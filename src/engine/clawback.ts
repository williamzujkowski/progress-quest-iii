import { analyzeItemMechanics } from './itemMechanics';
import type { CharacterSheet } from './types';

/**
 * How often a kill yields a second thing, decided by what the hero swung.
 *
 * The third effect equipment has, after the encounter multiplier of ADR 0008 and the two slots that
 * carry their own idea — `storage.ts` for capacity, `marketFavour.ts` for terms. This one is the
 * weapon, and the reasoning is the oldest in the genre made bureaucratic: a bigger instrument makes
 * more of a mess, and somebody has to file all of it. A `Sticky Note` produces one artefact. A
 * `Severance Cannon` produces two often enough to notice.
 *
 * Keyed to the slot rather than to the three nouns that name the idea outright — `Claw-Back`,
 * `Ratchet Clause`, `Hackathon Prize`. A keyword list is the substring trap this repo has been
 * caught by four times, and the slot reads the same way across the whole ladder anyway.
 */

/**
 * Chance of a second drop per point of standing, in tenths of a percent.
 *
 * Ratings run 0 to 15, so the chance runs from nothing at all to 15%. Bounded low on purpose. Extra
 * loot fills the bag, and the bag is what interrupts the hero to go to market, so a generous version
 * of this would read as a punishment. At 15% the effect is roughly one extra artefact per seven
 * kills, which the carrying capacity from the padding slot absorbs without the market trip
 * arriving sooner than it used to.
 */
const PER_MILLE_PER_STANDING = 10;

/** In tenths of a percent. Zero means no second roll is attempted, and no draw is spent looking. */
export function clawbackPerMille(equip: CharacterSheet['Equip']): number {
  const name = equip.Weapon;
  if (!name) return 0;

  // A placeholder yields no breakdown at all; an uncatalogued name yields one with no base in it.
  // Both arrive from an imported save, and destructuring through the first throws.
  const { quality } = analyzeItemMechanics({ kind: 'equipment', name, slot: 'Weapon' });
  const base = quality?.base;
  if (!base) return 0;

  // The base noun's own rating, not the item's total: `generateEquipUpgrade` tops every item up to
  // the character's level, so a total-derived chance would climb with the act rather than with what
  // the hero is holding, and every weapon would eventually behave the same.
  return base.value * PER_MILLE_PER_STANDING;
}
