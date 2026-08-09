import { z } from './zod';
import { readLedger, writeLedger } from './ledgerStorage';
import { MAX_PERSISTED_GOLD, MAX_PERSISTED_VALUE, MAX_PERSISTED_DESCRIPTION_LENGTH } from '../data/limits';
import { EQUIP_SLOTS } from '../data/traits';
import { analyzeItemMechanics } from '../engine/itemMechanics';
import type { GameTransitionEvent } from '../engine/transition';
import type { EquipmentClassification } from './worldContext';

/**
 * Personal bests, kept as the institution's own filing cabinet.
 *
 * Deliberately outside the active checkpoint. That envelope is strict and versioned and governs
 * whether a session can restore at all; a decorative ledger has no business gating that. This
 * gets its own key and its own schema, and a corrupt or missing ledger degrades to "no records
 * yet" rather than costing anyone their game.
 *
 * Every figure is a maximum or a count over events the engine already emits. Nothing here feeds
 * back into the simulation, so it cannot affect the RNG continuation or save compatibility.
 */

export const COMMENDATIONS_STORAGE_KEY = 'progquest_commendations_v1';

/**
 * The best thing ever worn in each slot, kept after the item itself is gone.
 *
 * Equipment is never sold — the market sells inventory. It vanishes by being overwritten: a better
 * breastplate replaces the one in the slot and the old one is simply not there any more. This is
 * the only place that remembers it. `label` and `quality` are the classification worldContext already
 * computes; they are prestige, not power, and CONTEXT.md is explicit that equipment has no
 * combat contribution at all.
 */
const exhibitEntrySchema = z.object({
  name: z.string().min(1).max(MAX_PERSISTED_DESCRIPTION_LENGTH),
  label: z.enum(['questionable', 'serviceable', 'notable', 'legendary']),
  quality: z.number().finite(),
}).strict();

const commendationsSchema = z.object({
  highestLevel: z.number().int().min(0).max(MAX_PERSISTED_VALUE),
  largestSale: z.number().int().min(0).max(MAX_PERSISTED_GOLD),
  questsCompleted: z.number().int().min(0).max(MAX_PERSISTED_VALUE),
  actsCompleted: z.number().int().min(0).max(MAX_PERSISTED_VALUE),
  // Keys are constrained to real slots so a hostile ledger cannot grow without bound, and
  // partialRecord rather than record because zod treats an enum-keyed record as exhaustive -
  // a plain record here would reject every ledger that has not yet filled all eleven slots,
  // which is all of them. Defaulted so a ledger written before the exhibit existed still loads.
  exhibit: z.partialRecord(z.enum(EQUIP_SLOTS as [string, ...string[]]), exhibitEntrySchema).default({}),
}).strict();

export type Commendations = z.infer<typeof commendationsSchema>;


export const EMPTY_COMMENDATIONS: Commendations = {
  highestLevel: 0,
  largestSale: 0,
  questsCompleted: 0,
  actsCompleted: 0,
  exhibit: {},
};

/**
 * Keeps the finer of the two. Ties keep the incumbent, so the record reflects the first time a
 * quality was reached rather than the most recent — a record of when, not of what is worn now.
 */
export function mergeExhibit(
  records: Commendations,
  slot: string,
  name: string,
  classification: Pick<EquipmentClassification, 'label' | 'quality'>,
): Commendations {
  if (!EQUIP_SLOTS.includes(slot as never) || name.length === 0) return records;
  const held = records.exhibit[slot];
  if (held && held.quality >= classification.quality) return records;
  return {
    ...records,
    exhibit: { ...records.exhibit, [slot]: { name, label: classification.label, quality: classification.quality } },
  };
}

/** The finest thing ever recorded in any slot, named the way the chatter may quote it. */
export interface FinestExhibit {
  readonly slot: string;
  /** The bare noun. A generated name carries an assessor's mark, and no chatter line may quote one. */
  readonly base: string;
}

/**
 * The best single thing the ledger has ever recorded, across every character it has spanned.
 *
 * The exhibit is per-slot and the guild wants one benchmark, not eleven. Ties resolve by slot name
 * so the answer is stable across reloads rather than dependent on key order — the same rule
 * `mostLitigated` uses next door, for the same reason.
 *
 * Entries whose base noun the analyser cannot resolve are skipped rather than repaired, exactly as
 * `fileLoadout` skips them: an item with no catalogued noun has no bare noun to quote, and handing
 * the raw generated string to a chatter line would put an assessor's mark in a bank asserted to
 * carry no figures.
 *
 * Returns null for a fresh ledger, which is every ledger until something is equipped.
 */
export function finestExhibit(records: Commendations): FinestExhibit | null {
  let best: { slot: string; base: string; quality: number } | null = null;

  for (const slot of EQUIP_SLOTS) {
    const entry = records.exhibit[slot];
    if (!entry) continue;
    const base = analyzeItemMechanics({ kind: 'equipment', name: entry.name, slot }).quality?.base;
    if (!base) continue;
    if (!best || entry.quality > best.quality || (entry.quality === best.quality && slot < best.slot)) {
      best = { slot, base: base.name, quality: entry.quality };
    }
  }

  return best === null ? null : { slot: best.slot, base: best.base };
}

/** True when nothing has happened worth filing, so the panel can stay away rather than show zeroes. */
export function isEmpty(records: Commendations): boolean {
  return records.highestLevel === 0 && records.largestSale === 0
    && records.questsCompleted === 0 && records.actsCompleted === 0
    && Object.keys(records.exhibit).length === 0;
}

/**
 * Folds a batch of events into the records. Pure, and returns the same object when nothing
 * changed so a caller can skip a write and a render on the overwhelming majority of ticks.
 */
export function mergeEvents(records: Commendations, events: readonly GameTransitionEvent[]): Commendations {
  let next = records;
  const bump = (patch: Partial<Commendations>) => { next = { ...next, ...patch }; };

  for (const event of events) {
    switch (event.type) {
      case 'level_gained':
        // A max rather than a counter: a new character starting over must not erase the record.
        if (event.level > next.highestLevel) bump({ highestLevel: Math.min(MAX_PERSISTED_VALUE, event.level) });
        break;
      case 'inventory_sold':
        if (event.gold > next.largestSale) bump({ largestSale: Math.min(MAX_PERSISTED_GOLD, event.gold) });
        break;
      case 'quest_completed':
        bump({ questsCompleted: Math.min(MAX_PERSISTED_VALUE, next.questsCompleted + 1) });
        break;
      case 'act_completed':
        bump({ actsCompleted: Math.min(MAX_PERSISTED_VALUE, next.actsCompleted + 1) });
        break;
      default:
        break;
    }
  }
  return next;
}

/** Reads fail closed; the shared reader owns that. The schema says everything, so nothing is
 *  normalised on the way in. */
export function readCommendations(storage: Pick<Storage, 'getItem'> | undefined): Commendations {
  return readLedger(storage, COMMENDATIONS_STORAGE_KEY, commendationsSchema, EMPTY_COMMENDATIONS);
}

/** Writes are best-effort; the shared writer owns that. */
export function writeCommendations(storage: Pick<Storage, 'setItem'> | undefined, records: Commendations): void {
  writeLedger(storage, COMMENDATIONS_STORAGE_KEY, commendationsSchema, records);
}
