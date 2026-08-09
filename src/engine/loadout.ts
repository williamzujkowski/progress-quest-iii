import { EQUIP_SLOTS } from '../data/traits';
import { analyzeItemMechanics } from './itemMechanics';
import type { CharacterSheet } from './types';

/**
 * How much the equipped loadout is worth, as one number.
 *
 * Classic Progress Quest gives equipment no mechanical effect at all — a kill's duration depends on
 * opponent puissance and character level and nothing else. This project is a spiritual successor
 * rather than a port (ADR 0003), and ADR 0008 records the deliberate divergence: equipment now
 * shortens encounters.
 *
 * The quality of a single item is already derived for the tooltips — a base noun's rating, plus its
 * modifiers, plus the assessor's mark. This sums that across the eleven slots so the two can never
 * disagree about what an item is worth.
 */

/**
 * Floored at zero, on purpose.
 *
 * A negative loadout is reachable — `-3 Burlap` is a real generated item and the starting hauberk
 * — and letting it lengthen encounters would mean a threadbare hauberk actively punishing the
 * player for wearing it. That is a mechanic nobody asked for and would be read as a bug.
 *
 * The floor is also what keeps every recorded golden intact: the sessions they captured carry
 * negative and zero loadouts, so flooring means their durations are arithmetically unchanged
 * rather than merely close.
 *
 * Adversaries are where negative effects belong, if they ever arrive — something done *to* the
 * hero rather than a property of their own gear.
 */
/*
 * Cached on the equipment object's identity, for the reason `fileLoadout` is.
 *
 * This reads nothing but `character.Equip` and costs eleven `analyzeItemMechanics` calls. It sits
 * behind `encounterSpeedMultiplier`, so it runs inside `projectCounterfactual` on a render path that
 * fires every tick, while `Equip` itself changed 14 times in 2 000 measured ticks.
 *
 * Identity rather than contents: the engine replaces `Equip` with a new object whenever it changes a
 * slot and never mutates one in place, so a stale hit would need a change that skipped that
 * replacement. One entry, because the question is only ever "the same as last time?".
 *
 * It is also on the engine's own path — `sim.ts` calls it once per kill — where the character is
 * rebuilt each transition and the cache simply misses. That costs one comparison and changes no
 * arithmetic, which is what keeps the recorded goldens out of this.
 */
let lastEquip: CharacterSheet['Equip'] | null = null;
let lastQuality = 0;

export function loadoutQuality(character: CharacterSheet): number {
  if (character.Equip === lastEquip) return lastQuality;
  const quality = computeLoadoutQuality(character);
  lastEquip = character.Equip;
  lastQuality = quality;
  return quality;
}

function computeLoadoutQuality(character: CharacterSheet): number {
  const total = EQUIP_SLOTS.reduce((sum, slot) => {
    const analysis = analyzeItemMechanics({ kind: 'equipment', name: character.Equip[slot], slot });
    return sum + (analysis.quality?.total ?? 0);
  }, 0);

  // Non-finite cannot arrive from the analysis, which rejects unsafe marks — but an imported sheet
  // reaches this before any engine arithmetic, and a NaN here would propagate into a duration.
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

/**
 * The multiplier a loadout applies to an encounter's duration.
 *
 * Asymptotic rather than linear: `1000 / (1000 + quality)` approaches zero and never reaches it, so
 * a kill can become very fast and never becomes instant or negative. A linear reduction would need
 * a clamp, and a clamp is a second rule to keep true.
 *
 * SCALE is the quality at which encounters take half as long. A thousand is deliberately far above
 * anything a mid-game loadout reaches, so the early game is untouched and the effect arrives as the
 * numbers do — which is the shape the escalation elsewhere in this game already has.
 */
const SCALE = 1000;

export function encounterSpeedMultiplier(quality: number): number {
  const floored = Number.isFinite(quality) ? Math.max(0, quality) : 0;
  return SCALE / (SCALE + floored);
}
