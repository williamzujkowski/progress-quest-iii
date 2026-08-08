import { analyzeItemMechanics } from './itemMechanics';
import type { CharacterSheet } from './types';

/**
 * How much grand armour adds to two numbers that do nothing.
 *
 * `HP Max` and `MP Max` are grown at every level, announced in the activity log, and printed on the
 * hero banner — and read by nothing. Grepped: the transition increments them and `HeroBanner`
 * displays them, and that is the whole of it. The hero has no health because the hero cannot lose.
 *
 * That is canonical Progress Quest and it is not a defect to fix. The instinct it invites — quietly
 * giving the hero combat arithmetic so the numbers matter — would be the worse move, and would
 * break the one thing this game is about. So the decorative numbers stay decorative, and the joke is
 * made deliberate instead of accidental: the grandest thing the hero can wear raises the largest
 * figure on the banner and moves no mechanic whatsoever. The tooltip has to say so, because this
 * codebase pins its effect lines to mechanical truth.
 *
 * `Hauberk` is coverage — `Reinsurance`, `Backstop`, `Too Big To Fail`, `Lender of Last Resort`.
 * `Helm` is standing — `Corner Office`, `Chair`, `Casting Vote`, `Final Say`. Both ladders end
 * somewhere absurd, which is exactly where an effect that does nothing belongs.
 */

/**
 * Where "grand" begins.
 *
 * The top two-thirds of a ladder that runs 1 to 30, so only genuinely senior armour flourishes.
 *
 * Two separate things decide this number and it is worth keeping them apart. **Safety** requires
 * only that it exceed every armour rating a fixture wears: `Lanyard` is 1 and `-3 Boilerplate` has a
 * base of 3, and those are the only two armour nouns in the Hauberk and Helm slots across all
 * fifteen recordings. `xp-level-up.json` does reach this arithmetic — unlike the slot-keyed effects,
 * this one is not structurally unreachable — so anything above 3 keeps the recordings intact. A
 * mutation dropping the threshold to 4 was confirmed to leave the whole suite green.
 *
 * **Design** is what picks ten: a flourish that fired on a `Boilerplate` would be a flourish on
 * ordinary kit, and the joke only works at the absurd end of the ladder. The margin over the
 * fixtures is a consequence of that choice rather than the reason for it. See ADR 0010.
 */
const GRAND = 10;

const standing = (equip: CharacterSheet['Equip'], slot: 'Hauberk' | 'Helm'): number => {
  const name = equip[slot];
  if (!name) return 0;

  // A placeholder yields no breakdown at all; an uncatalogued name yields one with no base in it.
  const { quality } = analyzeItemMechanics({ kind: 'equipment', name, slot });
  const base = quality?.base;
  if (!base) return 0;

  return Math.max(0, base.value - GRAND);
};

/** Extra points of `HP Max` and `MP Max` at a level, neither of which the engine reads. */
export function vitalsFlourish(equip: CharacterSheet['Equip']): { readonly hp: number; readonly mp: number } {
  return { hp: standing(equip, 'Hauberk'), mp: standing(equip, 'Helm') };
}
