import { EQUIP_SLOTS } from '../data/traits';
import { analyzeItemMechanics } from './itemMechanics';
import { encounterSpeedMultiplier, loadoutQuality } from './loadout';
import type { CharacterSheet, EquipSlot } from './types';

/**
 * What the institution has noticed about the eleven rows.
 *
 * ADR 0008 gave equipment a real mechanical effect — a kill takes `1000 / (1000 + quality)` of the
 * time it otherwise would — and the effect has never once been perceptible. The player cannot see
 * the counterfactual and nothing on any surface names it, so a mechanic that was designed, argued,
 * implemented and tested has been invisible since the day it shipped.
 *
 * The value of an effect in a game nobody plays is not its magnitude, it is whether it can be
 * attributed. An effect traceable to a named item in a row already on screen is worth more at zero
 * magnitude than an untraceable one at half. So this names it.
 *
 * Derived and presentational throughout. Every figure printed is one the engine multiplied by,
 * which is the only version of this worth shipping — the world console is where the truth contract
 * is strictest, and a filing that flattered the loadout would be worse than no filing.
 */

export interface LoadoutContribution {
  readonly slot: EquipSlot;
  readonly name: string;
  readonly quality: number;
  /**
   * The base noun's own rating, which is what the vocabularies escalate along.
   *
   * Distinct from `quality`, which is the total the engine multiplies by and which is the same
   * number in almost every slot — items are topped up until they match the character's level. The
   * standing is what says whether the hero is wearing a `Lanyard` or a `Legacy`.
   */
  readonly standing: number;
  /**
   * The bare noun, without modifiers or the assessor's mark.
   *
   * What the chatter quotes. A full generated name carries digits — `-4 Lapsed Contested Skeleton
   * Key` — and an ambient line citing a figure would be asserting state nothing computed, which the
   * bank is asserted never to do. The noun is the funny part anyway.
   */
  readonly base: string;
}

export interface LoadoutFiling {
  /** The best thing being worn, or nothing when the whole loadout contributes nothing. */
  readonly itemOfRecord: LoadoutContribution | null;
  /** Whole percent of encounter time the engine actually removed. Zero is common and is reported. */
  readonly reductionPercent: number;
  /** Every slot pulling its weight, best first. */
  readonly contributors: readonly LoadoutContribution[];
  /**
   * A modifier worn in three or more places at once.
   *
   * Bases cannot collide any more — each slot has its own vocabulary — but modifiers are still drawn
   * from one shared list, so a hero in three `Bonded` things is ordinary rather than exotic. The
   * institution treats that as a coincidence it has noticed, never as an achievement: the moment a
   * set reads as something to pursue, the joke becomes a spreadsheet the player is forbidden to fill
   * in, which is worse than no joke.
   */
  readonly repeatedModifier: { readonly name: string; readonly slots: number } | null;
}

/** Three, because two of anything is chance and four is rare enough to never fire. */
const REPEAT_THRESHOLD = 3;

/*
 * One slot of memory, keyed on the equipment object's identity.
 *
 * `fileLoadout` reads nothing but `character.Equip`, and it is expensive for what it is: eleven
 * `analyzeItemMechanics` calls, plus `loadoutQuality`'s eleven more downstream. It is also called
 * from a render body that runs on every tick, because `LogFeed` selects `state.character` and the
 * character's identity changes every tick as the task advances.
 *
 * The two rates are nothing alike. Measured over 2 000 real ticks on a warmed save: the character's
 * identity changed 2 000 times and `Equip`'s changed 14. `projectWorld`, which this dominates, cost
 * 23.6 us against a 6.9 us tick — the render path was more than three times the simulation, and
 * 99.3% of it re-derived a loadout that had not moved.
 *
 * Identity rather than contents, which is what makes this safe rather than a guess: the engine never
 * mutates an `Equip` in place. A stale hit would need one that changed without being replaced, which
 * nothing here does.
 *
 * Safe, but coarser than it reads. The replacement is not tied to a slot changing — the per-task
 * loop opens with `equip = { ...character.Equip }` unconditionally — so identity moves on every
 * completed task whether or not a slot did. About 450 identity changes against 16 to 35 real ones
 * over 40 000 ticks. Erring conservative is the right direction and the cost is a fraction of a
 * microsecond per tick; the invalidation is simply about thirteen times more eager than the rule
 * stated here would imply.
 *
 * One entry, not a map. The question is only ever "the same as last time?", and a growing cache on
 * a session that runs for weeks is a leak dressed up as an optimisation.
 */
let lastEquip: CharacterSheet['Equip'] | null = null;
let lastFiling: LoadoutFiling | null = null;

export function fileLoadout(character: CharacterSheet): LoadoutFiling {
  if (lastFiling !== null && character.Equip === lastEquip) return lastFiling;
  const filing = computeLoadoutFiling(character);
  lastEquip = character.Equip;
  lastFiling = filing;
  return filing;
}

function computeLoadoutFiling(character: CharacterSheet): LoadoutFiling {
  const analysed = EQUIP_SLOTS.flatMap((slot) => {
    const name = character.Equip[slot];
    if (!name) return [];
    const quality = analyzeItemMechanics({ kind: 'equipment', name, slot }).quality;
    return quality ? [{ slot, name, quality }] : [];
  });

  // Ranked by the base noun's own rating, not by the total.
  //
  // `generateEquipUpgrade` adds modifiers and an assessor's mark until an item's total equals the
  // character's level exactly, so on a live sheet almost every slot totals the same number — eleven
  // slots, two distinct totals, checked in a running game. Ranking by total therefore names whichever
  // slot happens to come first in `EQUIP_SLOTS`, which is an ordering fact rather than an observation
  // about the loadout.
  //
  // The base ratings do differ, from 3 to 10 on that same sheet, and they are what the names are
  // made of. So the grandest thing being worn is the one with the grandest noun, which is both the
  // true answer and the funnier one — `Skeleton Key` deserves the citation over `Hot Desk` even
  // when the arithmetic calls them equal.
  // Only slots whose base noun the analyser actually resolved.
  //
  // The filter used to be `quality.total > 0` alone, with `base` falling back to the raw name. An
  // item can total more than zero on its assessor's mark while resolving no base at all — anything
  // uncatalogued carrying a positive mark — and the fallback then handed the whole generated string
  // to `{item}`, digits and all. Chatter is asserted never to quote a figure, and the field above is
  // documented as the bare noun; both were true only for names the analyser could read.
  //
  // Excluding them rather than repairing them, because there is nothing to repair: an item with no
  // catalogued noun has no bare noun to quote. It still counts toward the reduction, which is taken
  // from `loadoutQuality` further down and never from this list.
  const contributors = analysed
    .filter(({ quality }) => quality.total > 0 && quality.base !== null)
    .map(({ slot, name, quality }) => ({ slot, name, quality: quality.total, standing: quality.base!.value, base: quality.base!.name }))
    .sort((left, right) => right.standing - left.standing || right.quality - left.quality);

  // Taken from the same function the transition multiplies by, rather than recomputed from the
  // contributors above. A sum of the positive slots would disagree with the engine the moment a
  // negative item is worn, and a filing that disagrees with the arithmetic is the failure this is
  // meant to fix rather than an instance of it.
  const total = loadoutQuality(character);
  const reductionPercent = Math.round((1 - encounterSpeedMultiplier(total)) * 100);

  const modifierCounts = new Map<string, number>();
  for (const { quality } of analysed) {
    for (const { name } of quality.modifiers) modifierCounts.set(name, (modifierCounts.get(name) ?? 0) + 1);
  }
  const repeated = [...modifierCounts.entries()]
    .filter(([, count]) => count >= REPEAT_THRESHOLD)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];

  return {
    itemOfRecord: contributors[0] ?? null,
    reductionPercent,
    contributors,
    repeatedModifier: repeated ? { name: repeated[0], slots: repeated[1] } : null,
  };
}

/**
 * How precisely the console prints these two durations.
 *
 * Lives here rather than at the render site because the decision below depends on it. A
 * counterfactual is worth showing only when the two figures actually differ *as printed*, and that
 * is a question about the rendering — so the two have to agree about the precision or they will
 * drift and the guard will stop guarding.
 */
export const ENCOUNTER_SECONDS_PRECISION = 1;

/** The encounter as it is, beside the encounter as the original formula would have had it. */
export interface EncounterCounterfactual {
  readonly actualMs: number;
  readonly canonicalMs: number;
}

/**
 * What the current encounter would have cost without the loadout.
 *
 * The engine computes both figures and reports one. `generateMonsterTask` derives the canonical
 * duration — opponent puissance over character level, exactly as the original did — and then
 * multiplies it by `encounterSpeedMultiplier` before returning. The unmultiplied number is thrown
 * away at the moment it is used, and nothing has ever named it.
 *
 * This is the only genuinely new information an idle game can put on screen. Not a bigger number: a
 * comparison. `loadoutFiling` already argues the principle — an effect that can be attributed is
 * worth more at zero magnitude than an untraceable one at half — and the world console already
 * reports the reduction as a percentage. A percentage is a claim about a ratio; two durations are a
 * claim about this encounter, which is the one the player is watching a bar fill for.
 *
 * Recovered by division rather than recomputed. The multiplier is `SCALE / (SCALE + quality)` with
 * quality floored at zero, so it is never zero and never negative and the inverse is exact to within
 * the flooring the engine already applied. Recomputing the canonical formula here instead would be
 * two derivations of one number, which is how they drift apart.
 *
 * Null for anything that is not a kill. A market walk has no counterfactual — the loadout does not
 * touch it — and inventing one would be the tooltip failure this codebase keeps correcting.
 *
 * Null too when the two durations would print the same, which is not the same test as "the loadout
 * changes nothing" and was the bug. The guard used to be `multiplier >= 1`, catching only a loadout
 * worth exactly zero — but the console prints one decimal place, so any multiplier close enough to
 * one produced two identical strings and the line said *"scheduled at 6.0s; would have taken 6.0s"*.
 * Measured across nine qualities and five durations, 17 of 45 renderings were identical, and at
 * quality 1 to 5 every single one was.
 *
 * That is the early game, when the loadout is nearly worthless and a new reader is most likely to be
 * working out what the console means — and the one line that exists to make an invisible mechanic
 * attributable was showing them a number beside itself.
 */
export function projectCounterfactual(character: CharacterSheet): EncounterCounterfactual | null {
  const { Task } = character;
  if (Task.type !== 'kill' || !Number.isFinite(Task.durationMs) || Task.durationMs <= 0) return null;

  const multiplier = encounterSpeedMultiplier(loadoutQuality(character));
  // Nothing worth saying when the loadout changes nothing, which is every new character. A line
  // reading "would have taken the same" is noise dressed as information.
  if (multiplier >= 1) return null;

  const canonicalMs = Math.round(Task.durationMs / multiplier);
  // And nothing worth saying when the difference is real but too small to print. Compared as the
  // console will compare them, rather than by a tolerance chosen here — a tolerance would be a
  // second opinion about the same question, and the two would eventually disagree.
  const seconds = (ms: number) => (ms / 1000).toFixed(ENCOUNTER_SECONDS_PRECISION);
  if (seconds(Task.durationMs) === seconds(canonicalMs)) return null;

  return { actualMs: Task.durationMs, canonicalMs };
}
