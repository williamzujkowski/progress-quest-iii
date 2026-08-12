import { KLASSES, RACES } from '../data/traits';
import { RandomGenerator } from './prng';
import type { StatsMap } from './types';

export const MAX_FINITE_CHARACTER_LEVEL = Math.floor(Math.log(Number.MAX_VALUE / 60) / Math.log(1.15));

export function levelUpTime(level: number): number {
  // 20 minutes for level 1, exponential increase after that
  const seconds = Math.round((20 + Math.pow(1.15, level)) * 60);
  // ponytail: preserve accepted high-level saves; saturate only when JS numbers overflow.
  return Number.isFinite(seconds) ? seconds : Number.MAX_VALUE;
}

export function roll3d6(rng: RandomGenerator): number {
  return rng.random(6) + 1 + (rng.random(6) + 1) + (rng.random(6) + 1);
}

/**
 * Cubits the hero can carry: strength, a constant, and whatever the padding slot allows.
 *
 * The allowance is passed in rather than read off the sheet here, because this module knows about
 * numbers and not about equipment. Every shipping caller has a loadout to hand and passes
 * `storageAllowance`; the default exists for tests that reason about strength alone, and describing
 * it as a production affordance was a claim about callers that do not exist.
 */
export function calculateEncumbranceMax(str: number, storageAllowance = 0): number {
  return str + 10 + storageAllowance;
}

export function generateInitialStats(rng: RandomGenerator, raceName: string, klassName: string): StatsMap {
  const stats: StatsMap = {
    STR: roll3d6(rng),
    CON: roll3d6(rng),
    DEX: roll3d6(rng),
    INT: roll3d6(rng),
    WIS: roll3d6(rng),
    CHA: roll3d6(rng),
    'HP Max': roll3d6(rng) + 2,
    'MP Max': roll3d6(rng) + 2,
  };

  const race = RACES.find((r) => r.name === raceName);
  if (race) {
    for (const stat of race.stats) {
      stats[stat] += 2;
    }
  }

  const klass = KLASSES.find((k) => k.name === klassName);
  if (klass) {
    for (const stat of klass.stats) {
      stats[stat] += 2;
    }
  }

  return stats;
}

const KPARTS = [
  ['br', 'cr', 'dr', 'fr', 'gr', 'j', 'kr', 'l', 'm', 'n', 'pr', '', '', '', 'r', 'sh', 'tr', 'v', 'wh', 'x', 'y', 'z'],
  ['a', 'a', 'e', 'e', 'i', 'i', 'o', 'o', 'u', 'u', 'ae', 'ie', 'oo', 'ou'],
  ['b', 'ck', 'd', 'g', 'k', 'm', 'n', 'p', 't', 'v', 'x', 'z'],
] as const;

export function generateName(rng: RandomGenerator): string {
  let result = '';
  for (let i = 0; i <= 5; ++i) {
    result += rng.pick(KPARTS[i % KPARTS.length] ?? KPARTS[0]);
  }
  return result.charAt(0).toUpperCase() + result.slice(1);
}
