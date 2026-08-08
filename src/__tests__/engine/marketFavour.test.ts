import { describe, expect, it } from 'vitest';
import { marketFavour } from '../../engine/marketFavour';
import { armourTableForSlot } from '../../data/armourBySlot';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame } from '../../engine/transition';
import type { CharacterSheet } from '../../engine/types';

const standingOn = (Sollerets: string): CharacterSheet['Equip'] => {
  const character = createNewCharacter('Landed', 'Half Daemon', 'Robot Monk', new RandomGenerator('landed'));
  return { ...character.Equip, Sollerets };
};

/** One completed sale of one stack, with the loot named so the premium branch is not involved. */
const sellOneStack = (Sollerets: string): number => {
  const character = createNewCharacter('Vendor', 'Half Daemon', 'Robot Monk', new RandomGenerator('vendor'));
  character.PendingTasks = undefined;
  character.Task = { description: 'Selling ballast...', durationMs: 1000, elapsedMs: 0, type: 'selling' };
  character.Equip = { ...character.Equip, Sollerets };
  // Charisma pinned to the ordinary ten, where the hero's own haggling is inert by arithmetic. This
  // suite is about what the ground underfoot is worth; the two sources multiply, and leaving a
  // rolled stat in would make every figure here depend on a character seed.
  character.Stats = { ...character.Stats, CHA: 10 };
  character.Inventory = [{ name: 'ballast', qty: 10 }];
  character.Gold = 0;

  const result = advanceGame(
    { character, progression: { experience: { currentSeconds: 0, maxSeconds: 100_000 }, completedTasks: 0, elapsedSeconds: 0 } },
    1000,
    new RandomGenerator('sale'),
  );
  const sold = result.records.map(({ event }) => event).find((event) => event.type === 'inventory_sold');
  if (sold?.type !== 'inventory_sold') throw new Error('expected a sale');
  return sold.gold;
};

describe('the terms the hero gets for standing somewhere', () => {
  it('is exactly one bare-footed, and rises to the top of the ladder', () => {
    // Named at both ends rather than asserted as a range. A range admits a constant, and a constant
    // is the shape a broken lookup takes.
    expect(marketFavour(standingOn(''))).toBe(1);
    expect(marketFavour(standingOn('Desk Space'))).toBeCloseTo(1.02);
    expect(marketFavour(standingOn('Antipode'))).toBeCloseTo(1.6);
  });

  it('rises along the whole vocabulary and is never flat', () => {
    const rungs = armourTableForSlot('Sollerets').map(([name]) => marketFavour(standingOn(name)));

    expect(rungs).toHaveLength(20);
    for (const [index, favour] of rungs.entries()) {
      expect(favour).toBeGreaterThan(1);
      if (index > 0) expect(favour).toBeGreaterThanOrEqual(rungs[index - 1]!);
    }
    expect(new Set(rungs).size).toBeGreaterThan(1);
    expect(rungs.at(-1)).toBeGreaterThan(rungs[0]!);
  });

  it('reads the base noun, not the total the engine tops the item up to', () => {
    expect(marketFavour(standingOn('-4 Lapsed Contested Antipode'))).toBe(marketFavour(standingOn('Antipode')));
  });

  it('is the footprint alone, not any slot holding a grand-sounding noun', () => {
    const character = createNewCharacter('Elsewhere', 'Half Daemon', 'Robot Monk', new RandomGenerator('elsewhere'));
    expect(marketFavour({
      ...character.Equip, Sollerets: '', Gambeson: 'Doomsday Vault', Helm: 'Corner Office', Gauntlets: 'Blank Cheque',
    })).toBe(1);
  });

  it('grants nothing for a name it cannot read', () => {
    expect(marketFavour(standingOn('Something Nobody Catalogued'))).toBe(1);
    expect(marketFavour(standingOn('—'))).toBe(1);
  });

  it('is inert for the loadout every recorded fixture wears', () => {
    // ADR 0008's licence. Sollerets is empty in all fifteen fixtures, input and post-transition, so
    // the two pinned sale figures are untouched. This pins the premise rather than the conclusion:
    // a fixture that ever acquired footing fails here first, and says why.
    expect(marketFavour({ ...standingOn(''), Weapon: 'Sharp Rock', Hauberk: '-3 Boilerplate' })).toBe(1);
  });

  it('actually pays more, rather than only reporting a larger number', () => {
    // The whole point. Same seed, same stack, same level — only the boots differ.
    const bare = sellOneStack('');
    const landed = sellOneStack('Antipode');

    expect(bare).toBeGreaterThan(0);
    expect(landed).toBeGreaterThan(bare);
    expect(landed).toBe(Math.floor(bare * 1.6));
  });

  it('floors the payout rather than rounding it up', () => {
    // Integrality alone does not pin this — flooring and rounding up both yield whole numbers, and
    // a mutation swapping one for the other survived a test that only checked for an integer. So
    // every rung is compared against the floored figure, and the run is required to contain at
    // least one rung where the two actually differ, or the comparison proves nothing.
    const bare = sellOneStack('');
    let fractional = 0;

    for (const [name] of armourTableForSlot('Sollerets')) {
      const exact = bare * marketFavour(standingOn(name));
      if (!Number.isInteger(exact)) fractional += 1;
      expect(sellOneStack(name), name).toBe(Math.floor(exact));
    }

    expect(fractional, 'no rung produced a fractional price, so nothing here distinguishes floor from ceil')
      .toBeGreaterThan(0);
  });

  it('is a pure function of the slot', () => {
    const equip = standingOn('Company Town');
    const before = JSON.stringify(equip);

    expect(marketFavour(equip)).toBe(marketFavour(equip));
    expect(JSON.stringify(equip)).toBe(before);
  });
});
