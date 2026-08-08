import { describe, expect, it } from 'vitest';
import { bulkStacks } from '../../engine/bulkDisposal';
import { armourTableForSlot } from '../../data/armourBySlot';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame } from '../../engine/transition';
import type { CharacterSheet } from '../../engine/types';

const wearing = (Brassairts: string): CharacterSheet['Equip'] => {
  const character = createNewCharacter('Signer', 'Half Daemon', 'Robot Monk', new RandomGenerator('signer'));
  return { ...character.Equip, Brassairts };
};

/** One selling tick against a bag of `rows` singleton stacks. */
const sellOneTick = (Brassairts: string, rows: number) => {
  const character = createNewCharacter('Clerk', 'Half Daemon', 'Robot Monk', new RandomGenerator('clerk'));
  character.PendingTasks = undefined;
  character.Equip = { ...character.Equip, Brassairts };
  character.Task = { description: 'Selling ballast...', durationMs: 1000, elapsedMs: 0, type: 'selling' };
  character.Inventory = Array.from({ length: rows }, (_unused, index) => ({ name: `pelt ${index}`, qty: 1 }));
  character.Gold = 0;

  const result = advanceGame(
    { character, progression: { experience: { currentSeconds: 0, maxSeconds: 1_000_000 }, completedTasks: 0, elapsedSeconds: 0 } },
    1000,
    new RandomGenerator('till'),
  );
  return {
    sales: result.records.map(({ event }) => event).filter((event) => event.type === 'inventory_sold').length,
    rowsLeft: result.state.character.Inventory.length,
    gold: result.state.character.Gold,
  };
};

describe('how much the hero can get rid of before someone signs again', () => {
  it('is one stack bare-shouldered, and rises to four', () => {
    expect(bulkStacks(wearing(''))).toBe(1);
    expect(bulkStacks(wearing('Cc Line'))).toBe(1);
    expect(bulkStacks(wearing('Royal Assent'))).toBe(4);
  });

  it('rises along the whole vocabulary and is never flat', () => {
    const rungs = armourTableForSlot('Brassairts').map(([name]) => bulkStacks(wearing(name)));

    expect(rungs).toHaveLength(20);
    for (const [index, stacks] of rungs.entries()) {
      expect(stacks).toBeGreaterThanOrEqual(1);
      if (index > 0) expect(stacks).toBeGreaterThanOrEqual(rungs[index - 1]!);
    }
    expect(new Set(rungs).size).toBeGreaterThan(1);
    expect(rungs.at(-1)).toBeGreaterThan(rungs[0]!);
  });

  it('reads the base noun, not the total the engine tops the item up to', () => {
    expect(bulkStacks(wearing('-4 Lapsed Contested Royal Assent'))).toBe(bulkStacks(wearing('Royal Assent')));
  });

  it('is the shoulders alone, not any slot holding a grand-sounding noun', () => {
    const character = createNewCharacter('Elsewhere', 'Half Daemon', 'Robot Monk', new RandomGenerator('elsewhere'));
    expect(bulkStacks({
      ...character.Equip, Brassairts: '', Gambeson: 'Doomsday Vault', Sollerets: 'Antipode', Weapon: 'Board Directive',
    })).toBe(1);
  });

  it('grants nothing extra for a name it cannot read', () => {
    expect(bulkStacks(wearing('Something Nobody Catalogued'))).toBe(1);
    expect(bulkStacks(wearing('—'))).toBe(1);
  });

  it('is inert for the loadout every recorded fixture wears', () => {
    // Brassairts is empty in all fifteen fixtures, input and post-transition, so every recorded
    // market trip sells exactly one stack per task as it always did. Pinned here so a fixture that
    // ever acquired shoulders fails with an explanation rather than as a golden diff.
    expect(bulkStacks({ ...wearing(''), Weapon: 'Sharp Rock', Hauberk: '-3 Boilerplate' })).toBe(1);
  });

  it('actually clears more of the bag in one tick', () => {
    const plain = sellOneTick('', 12);
    const authorised = sellOneTick('Royal Assent', 12);

    expect(plain.sales).toBe(1);
    expect(plain.rowsLeft).toBe(11);
    expect(authorised.sales).toBe(4);
    expect(authorised.rowsLeft).toBe(8);
    expect(authorised.gold).toBeGreaterThan(plain.gold);
  });

  it('emits one line per stack rather than one summarising line', () => {
    // The log is compared string for string by the goldens and announced through an `aria-live`
    // region. Selling faster is this change; rewording the sentences would be a separate one.
    const authorised = sellOneTick('Royal Assent', 12);
    expect(authorised.sales).toBe(4);
  });

  it('stops at an empty bag instead of reporting sales of nothing', () => {
    // The extra passes break early. The first pass does not, because a selling task on an empty bag
    // reported a sale of nothing before this change and a restored save can hold one.
    const shortBag = sellOneTick('Royal Assent', 2);
    expect(shortBag.sales).toBe(2);
    expect(shortBag.rowsLeft).toBe(0);

    const emptyBag = sellOneTick('Royal Assent', 0);
    expect(emptyBag.sales).toBe(1);
    expect(emptyBag.gold).toBe(0);
  });

  it('is a pure function of the slot', () => {
    const equip = wearing('Standing Order');
    const before = JSON.stringify(equip);

    expect(bulkStacks(equip)).toBe(bulkStacks(equip));
    expect(JSON.stringify(equip)).toBe(before);
  });
});
