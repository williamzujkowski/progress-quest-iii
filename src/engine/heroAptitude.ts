import type { StatsMap } from './types';

/**
 * The two stats the game has always promised and never kept.
 *
 * Outside generation, the schema and `PRIME_STATS`, neither `DEX` nor `CHA` was read anywhere in the
 * codebase. Ten races and six classes name them — `Puma Consultant` grants DEX, `Demi-Contractor`
 * grants CHA — so the character-creation screen, the one place a player makes a choice in a game
 * where the player never acts, was choosing between things that did not differ.
 *
 * Both effects land on the market trip, which is where a nimble pair of hands and a persuasive
 * manner would land. They compose with the two equipment effects that touch the same quantities
 * rather than replacing them: `bulkDisposal.ts` is what the shoulders authorise, this is what the
 * hands manage; `marketFavour.ts` is the ground the hero stands on, this is what they say while
 * standing there. Kept separate so each surface can report its own contribution — a combined
 * function could not tell a tooltip what the item alone is worth.
 */

/**
 * The value every stat has in every recorded fixture, and the point either effect begins.
 *
 * ADR 0008's licence in its strongest form. `Math.max(0, stat - ORDINARY)` is zero at ten by
 * arithmetic, not by coverage, so neither effect can reach a golden however the fixtures are read.
 */
const ORDINARY = 10;

/** Stat points per extra stack, and the ceiling. Stats grow with levels and are not bounded above. */
const DEX_PER_STACK = 4;
const MAX_NIMBLE_STACKS = 3;

/** Stat points per percent of margin, and the ceiling, for the same reason. */
const CHA_PER_PERCENT = 2;
const MAX_HAGGLE_PERCENT = 25;

const above = (stat: number): number => Math.max(0, (Number.isFinite(stat) ? stat : ORDINARY) - ORDINARY);

/** Extra stacks a quick pair of hands clears, on top of whatever the shoulders authorised. */
export function nimbleStacks(stats: StatsMap): number {
  return Math.min(MAX_NIMBLE_STACKS, Math.floor(above(stats.DEX) / DEX_PER_STACK));
}

/** The margin a persuasive hero talks their way into, on top of the ground they are standing on. */
export function hagglingFavour(stats: StatsMap): number {
  return 1 + Math.min(MAX_HAGGLE_PERCENT, Math.floor(above(stats.CHA) / CHA_PER_PERCENT)) / 100;
}
