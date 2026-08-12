import { MAX_PERSISTED_GOLD, MAX_PERSISTED_VALUE } from '../data/limits';

/**
 * Gold that keeps growing instead of stopping.
 *
 * It used to saturate: `Math.min(MAX_PERSISTED_GOLD, gold + earned)`. That is a cap rather than an
 * ending — the figure simply froze at a trillion while the game carried on selling loot, and every
 * sale after that reported earning nothing.
 *
 * It now sheds a decade instead. The stored figure stays under the cap, exact and safe to add to,
 * and a count of powers of ten carries the scale. Which is the joke: the number gets bigger because
 * zeros are appended, not because anything computed a bigger number. See ADR 0009.
 *
 * The arithmetic lives here rather than in a general mantissa-and-decade carrier, of the kind ADR
 * 0008 deferred, because gold has a constraint such a carrier does not: the mantissa must stay a
 * whole number of coins. A player with `4.2 × 10^12` gold has an exact integer of gold, and a
 * carrier normalising to `[1, 10)` would turn a balance into a decimal. No such carrier is in the
 * tree — this says why gold would not share one, not that it declined to use something that exists.
 */

/** Gold carried as an exact figure plus the decades it has shed. */
export interface GoldPurse {
  readonly gold: number;
  readonly decades: number;
}

/**
 * Adds earnings, shedding decades rather than saturating.
 *
 * Shedding divides by ten and rounds down, so a decade costs at most nine coins of precision out
 * of a trillion. Rounding rather than truncating would be no more accurate and would occasionally
 * hand the player money they had not earned.
 *
 * The decade count saturates at `MAX_PERSISTED_VALUE`, and the figure then rides at the cap the way
 * it used to before any of this. Every other quantity the transition writes into the sheet is
 * clamped — Level, the stats, the act, spell level, inventory quantity — and the carrier was
 * originally not, which made it the one persisted number that could grow past what the schema
 * accepts. A character in that state fails `characterSheetSchema`, and the checkpoint writer, the
 * roster writer and the exporter all refuse it at once with no repair offered, so the save is lost
 * on close.
 *
 * Not reachable by playing: earnings scale roughly as the cube of level, and a billion decade-sheds
 * is not a number of kills. It is reachable by importing a hand-edited save, which the schema
 * accepts because a billion is a legal value right up until it is incremented.
 */
export function earnGold(purse: GoldPurse, earned: number): GoldPurse {
  if (!Number.isFinite(earned) || earned <= 0) return purse;

  let gold = purse.gold + earned;
  let decades = purse.decades;

  while (gold >= MAX_PERSISTED_GOLD && decades < MAX_PERSISTED_VALUE) {
    gold = Math.floor(gold / 10);
    decades += 1;
  }

  // Saturating the decade count leaves the figure itself above the cap, so it needs its own clamp.
  // Without this the loop's exit condition would simply hand back the unbounded sum.
  return { gold: Math.min(gold, MAX_PERSISTED_GOLD - 1), decades };
}

/**
 * Spends, which cannot shed decades back.
 *
 * A purchase is priced in ordinary coins, so a player whose balance has shed decades can always
 * afford it and the decades never come back down. That asymmetry is deliberate: this game has no
 * mechanic that should be able to erase an order of magnitude a player has reached, and a spend
 * path that could would be a way to lose progress by shopping.
 */
export function spendGold(purse: GoldPurse, cost: number): GoldPurse {
  if (!Number.isFinite(cost) || cost <= 0) return purse;
  if (purse.decades > 0) return purse.gold >= cost ? { ...purse, gold: purse.gold - cost } : purse;
  return { ...purse, gold: Math.max(0, purse.gold - cost) };
}

/**
 * What the player is told they earned.
 *
 * Reported from the figures rather than by subtracting balances: once a decade is shed, the stored
 * balance falls even though the player gained, so a naive difference reports a loss. That is the
 * defect this function exists to prevent, and it would have been invisible until someone sold loot
 * at exactly the wrong moment.
 */
export function goldEarnedBetween(before: GoldPurse, after: GoldPurse, requested: number): number {
  if (after.decades !== before.decades) return requested;
  return after.gold - before.gold;
}
