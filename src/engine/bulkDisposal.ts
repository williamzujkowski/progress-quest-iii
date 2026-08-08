import { analyzeItemMechanics } from './itemMechanics';
import type { CharacterSheet } from './types';

/**
 * How many stacks the hero can get rid of before someone has to sign again.
 *
 * The market queue is the dullest visible stretch of the loop and it is dull for a structural
 * reason: `selling` disposes of exactly one stack per second, and stacks are almost always size one,
 * because the duplicate-loot branch needs more than 250 distinct inventory names and the bag holds
 * about twenty. So a trip is N seconds of `Selling a nit tail...` for N kills, growing with how well
 * the hero is doing.
 *
 * `Brassairts` is filed under *escalation: what sits on the shoulders and passes things upward*, and
 * the ladder is authority — `Cc Line`, `Read Receipt`, `Escalation Path`, `Chain of Command`,
 * `Standing Item`, `Veto`, `Standing Order`, `Emergency Powers`, `Royal Assent`. A hero with a
 * standing order does not need a separate sign-off per nit tail. That is the whole joke and it is
 * also, exactly, the mechanic.
 *
 * Keyed to the slot for the reason `storage.ts` gives at length: a keyword list is the substring trap
 * this repo has been caught by four times.
 */

/**
 * Standing per additional stack.
 *
 * Ratings run 1 to 30, so the hero clears between one and four stacks a second. Deliberately small.
 * The point is to compress dead air, not to delete the market trip — the trip is a beat in the loop,
 * and a hero who teleported through it would have lost something rather than gained it.
 */
const STANDING_PER_EXTRA_STACK = 10;

export function bulkStacks(equip: CharacterSheet['Equip']): number {
  const name = equip.Brassairts;
  if (!name) return 1;

  // A placeholder yields no breakdown at all; an uncatalogued name yields one with no base in it.
  // Both arrive from an imported save, and destructuring through the first throws.
  const { quality } = analyzeItemMechanics({ kind: 'equipment', name, slot: 'Brassairts' });
  const base = quality?.base;
  if (!base) return 1;

  // The base noun's own rating, not the item's total, so the figure tracks what is on the shoulders
  // rather than which act the hero has reached.
  return 1 + Math.floor(base.value / STANDING_PER_EXTRA_STACK);
}
