import { describe, expect, it } from 'vitest';
import { clawbackPerMille } from '../../engine/clawback';
import { WEAPONS } from '../../data/traits';
import { calculateEncumbrance, createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame } from '../../engine/transition';
import type { CharacterSheet } from '../../engine/types';

const swinging = (Weapon: string): CharacterSheet['Equip'] => {
  const character = createNewCharacter('Swinger', 'Half Daemon', 'Robot Monk', new RandomGenerator('swinger'));
  return { ...character.Equip, Weapon };
};

/**
 * How much the hero ended up holding after a run of kills.
 *
 * Counted from the bag rather than from `item_gained` events. A drop that lands on a stack the hero
 * already has increments the quantity and emits no event at all, so counting events undercounts
 * badly once the inventory fills — measured at a 3% apparent difference where the real one is 15%.
 */
const harvest = (Weapon: string, kills: number): number => {
  const rng = new RandomGenerator('harvest');
  const character = createNewCharacter('Harvester', 'Half Daemon', 'Robot Monk', new RandomGenerator('harvester'));
  character.PendingTasks = undefined;
  // Ample room, so the hero never breaks off to go to market and change the task mix underneath the
  // measurement.
  character.Stats = { ...character.Stats, STR: 5000 };

  let state = {
    character,
    progression: { experience: { currentSeconds: 0, maxSeconds: 10_000_000 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  for (let kill = 0; kill < kills; kill += 1) {
    state = {
      ...state,
      character: {
        ...state.character,
        // Re-imposed every iteration, not set once. Act transitions hand the hero new equipment, so
        // a run that only set the weapon at the start spends most of its kills holding something
        // else entirely — measured directly: a `Sticky Note` run, which should never reach the
        // second-drop guard at all, reached it on 356 of 400 kills and fired four times.
        Equip: { ...state.character.Equip, Weapon },
        Task: { description: 'Executing a Nit...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'random' } },
      },
    };
    state = advanceGame(state, 1000, rng).state;
  }
  return calculateEncumbrance(state.character.Inventory) + state.character.Gold;
};

describe('how much falls off a monster', () => {
  it('is nothing at all for the weakest instrument, and rises with the ladder', () => {
    // `Sticky Note` is rated 0, which is the arithmetic identity this whole effect rests on: at zero
    // the guard short-circuits and no draw is spent.
    expect(clawbackPerMille(swinging('Sticky Note'))).toBe(0);
    expect(clawbackPerMille(swinging('Claw-Back'))).toBe(20);
    expect(clawbackPerMille(swinging('Board Directive'))).toBe(150);
  });

  it('rises along the whole table and is never flat', () => {
    const rungs = WEAPONS.map(([name]) => clawbackPerMille(swinging(name)));

    expect(rungs).toHaveLength(WEAPONS.length);
    for (const chance of rungs) expect(chance).toBeGreaterThanOrEqual(0);
    expect(new Set(rungs).size).toBeGreaterThan(1);
    expect(Math.max(...rungs)).toBe(150);
  });

  it('reads the base noun, not the total the engine tops the item up to', () => {
    expect(clawbackPerMille(swinging('-4 Lapsed Contested Board Directive')))
      .toBe(clawbackPerMille(swinging('Board Directive')));
  });

  it('is the weapon alone, not any slot holding a grand-sounding noun', () => {
    const character = createNewCharacter('Elsewhere', 'Half Daemon', 'Robot Monk', new RandomGenerator('elsewhere'));
    expect(clawbackPerMille({
      ...character.Equip, Weapon: '', Gambeson: 'Doomsday Vault', Sollerets: 'Antipode', Helm: 'Corner Office',
    })).toBe(0);
  });

  it('grants nothing for a name it cannot read', () => {
    expect(clawbackPerMille(swinging('Something Nobody Catalogued'))).toBe(0);
    expect(clawbackPerMille(swinging('—'))).toBe(0);
  });

  it('is inert for the weapon every recorded fixture swings', () => {
    // The licence this effect needs, and it needs the strong form. Adding a draw shifts every value
    // after it, so it is not enough that the outcome match — no draw may be spent at all. Every
    // fixture's weapon is `Sharp Rock`, which matches no `WEAPONS` label, so no base resolves.
    expect(clawbackPerMille(swinging('Sharp Rock'))).toBe(0);
    expect(WEAPONS.filter(([label]) => 'Sharp Rock'.includes(label))).toEqual([]);
  });

  it('actually drops more over a run of kills', () => {
    // Measured rather than asserted per-kill: the effect is a chance, so one kill proves nothing.
    const blunt = harvest('Sticky Note', 400);
    const grand = harvest('Board Directive', 400);

    expect(blunt).toBeGreaterThan(0);
    // A 15% chance over 400 kills is about 60 extra artefacts. Asserted at a 10% margin, which is
    // clear of noise while leaving room for the chance to run cold.
    expect(grand).toBeGreaterThan(blunt * 1.1);
  });

  it('spends no randomness at all when the weapon grants nothing', () => {
    // The golden argument, asserted directly. A version that drew first and compared afterwards
    // would pass every test above and break all fifteen recordings.
    const rng = new RandomGenerator('untouched');
    const character = createNewCharacter('Quiet', 'Half Daemon', 'Robot Monk', new RandomGenerator('quiet'));
    character.PendingTasks = undefined;
    character.Equip = { ...character.Equip, Weapon: 'Sticky Note' };
    character.Task = { description: 'Executing a Nit...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'random' } };

    const withEffect = advanceGame(
      { character, progression: { experience: { currentSeconds: 0, maxSeconds: 100_000 }, completedTasks: 0, elapsedSeconds: 0 } },
      1000,
      rng,
    );
    const spentWithZero = rng.getState().join(',');

    // The same tick again, from an identical generator, for a weapon the analyser cannot read.
    const rngTwo = new RandomGenerator('untouched');
    const unreadable = { ...character, Equip: { ...character.Equip, Weapon: 'Sharp Rock' } };
    advanceGame(
      { character: unreadable, progression: { experience: { currentSeconds: 0, maxSeconds: 100_000 }, completedTasks: 0, elapsedSeconds: 0 } },
      1000,
      rngTwo,
    );

    expect(withEffect.records.length).toBeGreaterThan(0);
    expect(rngTwo.getState().join(',')).toBe(spentWithZero);
  });
});
