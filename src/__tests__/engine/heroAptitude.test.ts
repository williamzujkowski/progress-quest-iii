import { describe, expect, it } from 'vitest';
import { hagglingFavour, nimbleStacks } from '../../engine/heroAptitude';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame } from '../../engine/transition';
import type { StatsMap } from '../../engine/types';

const withStats = (overrides: Partial<StatsMap>): StatsMap => {
  const character = createNewCharacter('Apt', 'Half Daemon', 'Robot Monk', new RandomGenerator('apt'));
  const ordinary = Object.fromEntries(Object.keys(character.Stats).map((stat) => [stat, 10])) as StatsMap;
  return { ...ordinary, ...overrides };
};

/** One selling tick, with everything except the stat under test held at ordinary. */
const sellOneTick = (overrides: Partial<StatsMap>, rows: number) => {
  const character = createNewCharacter('Trader', 'Half Daemon', 'Robot Monk', new RandomGenerator('trader'));
  character.PendingTasks = undefined;
  character.Stats = withStats(overrides);
  character.Task = { description: 'Selling ballast...', durationMs: 1000, elapsedMs: 0, type: 'selling' };
  character.Inventory = Array.from({ length: rows }, (_unused, index) => ({ name: `pelt ${index}`, qty: 10 }));
  character.Gold = 0;

  const result = advanceGame(
    { character, progression: { experience: { currentSeconds: 0, maxSeconds: 1_000_000 }, completedTasks: 0, elapsedSeconds: 0 } },
    1000,
    new RandomGenerator('till'),
  );
  return {
    sales: result.records.map(({ event }) => event).filter((event) => event.type === 'inventory_sold').length,
    gold: result.state.character.Gold,
  };
};

describe('the two stats the game had always promised and never kept', () => {
  it('is inert at the ordinary ten, by arithmetic rather than by coverage', () => {
    // The licence both effects rest on. Every stat in every recorded fixture is exactly ten, so
    // `max(0, stat - 10)` is zero there as an identity — not because the fixtures happen not to
    // reach it. This is the strongest form of the ADR 0008 rule available.
    expect(nimbleStacks(withStats({}))).toBe(0);
    expect(hagglingFavour(withStats({}))).toBe(1);
    expect(nimbleStacks(withStats({ DEX: 3 }))).toBe(0);
    expect(hagglingFavour(withStats({ CHA: 3 }))).toBe(1);
  });

  it('rises with dexterity, in whole stacks, up to a ceiling', () => {
    expect(nimbleStacks(withStats({ DEX: 13 }))).toBe(0);
    expect(nimbleStacks(withStats({ DEX: 14 }))).toBe(1);
    expect(nimbleStacks(withStats({ DEX: 18 }))).toBe(2);
    // Stats grow with levels and are not bounded above, so the ceiling is what keeps a long game
    // from clearing an unbounded bag in one second.
    expect(nimbleStacks(withStats({ DEX: 1000 }))).toBe(3);
  });

  it('rises with charisma, in whole percent, up to a ceiling', () => {
    expect(hagglingFavour(withStats({ CHA: 11 }))).toBe(1);
    expect(hagglingFavour(withStats({ CHA: 12 }))).toBeCloseTo(1.01);
    expect(hagglingFavour(withStats({ CHA: 18 }))).toBeCloseTo(1.04);
    expect(hagglingFavour(withStats({ CHA: 1000 }))).toBeCloseTo(1.25);
  });

  it('reads each stat alone, not the sheet as a whole', () => {
    expect(nimbleStacks(withStats({ CHA: 1000, STR: 1000, INT: 1000 }))).toBe(0);
    expect(hagglingFavour(withStats({ DEX: 1000, STR: 1000, WIS: 1000 }))).toBe(1);
  });

  it('survives a stat that is not a finite number', () => {
    // Reachable from an imported save only through a schema that already rejects it, so this is
    // belt and braces — but the alternative is `NaN` propagating into a payout.
    //
    // Treated as ordinary rather than as enormous. A stat the engine cannot read is not evidence the
    // hero is gifted, and clamping infinity to the ceiling would reward a malformed save with the
    // best outcome available.
    expect(nimbleStacks(withStats({ DEX: Number.NaN }))).toBe(0);
    expect(nimbleStacks(withStats({ DEX: Number.POSITIVE_INFINITY }))).toBe(0);
    expect(hagglingFavour(withStats({ CHA: Number.NaN }))).toBe(1);
    expect(hagglingFavour(withStats({ CHA: Number.POSITIVE_INFINITY }))).toBe(1);
  });

  it('actually clears more of the bag when the hero is quick', () => {
    const ordinary = sellOneTick({}, 12);
    const quick = sellOneTick({ DEX: 18 }, 12);

    expect(ordinary.sales).toBe(1);
    expect(quick.sales).toBe(3);
  });

  it('actually pays more when the hero is persuasive', () => {
    const ordinary = sellOneTick({}, 1);
    const persuasive = sellOneTick({ CHA: 1000 }, 1);

    expect(ordinary.gold).toBeGreaterThan(0);
    expect(persuasive.gold).toBeGreaterThan(ordinary.gold);
    expect(persuasive.gold).toBe(Math.floor(ordinary.gold * 1.25));
  });

  it('composes with the equipment effects rather than replacing them', () => {
    // The overlap worth getting right. `bulkDisposal` is what the shoulders authorise and this is
    // what the hands manage; `marketFavour` is the ground underfoot and this is what the hero says
    // while standing on it. Both pairs add or multiply — neither shadows the other.
    const character = createNewCharacter('Both', 'Half Daemon', 'Robot Monk', new RandomGenerator('both'));
    character.PendingTasks = undefined;
    character.Stats = withStats({ DEX: 18, CHA: 18 });
    character.Equip = { ...character.Equip, Brassairts: 'Royal Assent', Sollerets: 'Antipode' };
    character.Task = { description: 'Selling ballast...', durationMs: 1000, elapsedMs: 0, type: 'selling' };
    character.Inventory = Array.from({ length: 12 }, (_unused, index) => ({ name: `pelt ${index}`, qty: 10 }));
    character.Gold = 0;

    const result = advanceGame(
      { character, progression: { experience: { currentSeconds: 0, maxSeconds: 1_000_000 }, completedTasks: 0, elapsedSeconds: 0 } },
      1000,
      new RandomGenerator('till'),
    );
    const sales = result.records.map(({ event }) => event).filter((event) => event.type === 'inventory_sold').length;

    // Four from the shoulders, two more from the hands.
    expect(sales).toBe(6);
    // And the two margins multiply rather than one winning: 1.6 from the ground, 1.04 from the hero.
    expect(result.state.character.Gold).toBe(sales * Math.floor(10 * 1 * 1.6 * 1.04));
  });
});
