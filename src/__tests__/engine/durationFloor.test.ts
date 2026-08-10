import { describe, expect, it } from 'vitest';
import { createNewCharacter, generateStatReward, generateTaskDescription } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { characterSheetSchema, progressTaskSchema } from '../../state/schemas';
import { loadoutQuality } from '../../engine/loadout';
import type { CharacterSheet } from '../../engine/types';

/**
 * Two states an unattended game can be handed, both of which used to end badly.
 *
 * A task of zero milliseconds is not a fast encounter, it is a lost save: `progressTaskSchema`
 * requires at least one, and `characterSheetSchema` embeds it as `Task`, so the checkpoint writer,
 * the roster writer and the exporter refuse the sheet together with no repair offered.
 *
 * And `RandomGenerator.random(n)` is `uint32() % n`, so an argument above 2^32 makes the modulo a
 * no-op — which silently collapses the one weighted draw in the engine.
 */

const wearing = (name: string, level = 1): CharacterSheet => {
  const character = createNewCharacter('Imported', 'Half Daemon', 'Robot Monk', new RandomGenerator('import'));
  return {
    ...character,
    Traits: { ...character.Traits, Level: level },
    Equip: Object.fromEntries(Object.keys(character.Equip).map((slot) => [slot, name])) as CharacterSheet['Equip'],
  };
};

describe('a task always lasts at least a millisecond', () => {
  it('survives a loadout the schema accepts and the arithmetic cannot', () => {
    // Reachable at level one, because quality comes from the item *name* rather than the level.
    // Eleven slots of this is a legal import and produced a zero duration on 23 of 30 tasks.
    const sheet = wearing('+1000000 Sacrosanct Antipode');
    expect(characterSheetSchema.safeParse(JSON.parse(JSON.stringify(sheet))).success, 'the import is accepted').toBe(true);
    expect(loadoutQuality(sheet)).toBeGreaterThan(1_000_000);

    const rng = new RandomGenerator('durations');
    for (let index = 0; index < 40; index += 1) {
      const task = generateTaskDescription(rng, sheet);
      expect(task.durationMs, `draw ${index}`).toBeGreaterThanOrEqual(1);
      // The load-bearing consequence: the sheet must stay writable.
      expect(
        progressTaskSchema.safeParse({ description: task.description, durationMs: task.durationMs, elapsedMs: 0, type: task.type }).success,
        `draw ${index} produced ${task.durationMs}ms`,
      ).toBe(true);
    }
  });

  it('leaves an ordinary loadout alone', () => {
    // The clamp must be inert everywhere it is not needed, which is everywhere a save reaches.
    const rng = new RandomGenerator('ordinary');
    const sheet = createNewCharacter('Ordinary', 'Half Daemon', 'Robot Monk', new RandomGenerator('o'));
    for (let index = 0; index < 40; index += 1) {
      expect(generateTaskDescription(rng, sheet).durationMs).toBeGreaterThan(100);
    }
  });
});

describe('the weighted stat draw keeps working at large stats', () => {
  it('does not collapse onto one stat once the squares pass the generator ceiling', () => {
    // `uint32() % n` is a no-op above 2^32. A single prime stat at 65 536 puts the sum of squares
    // past it, which is about two years of continuous running at the measured growth rate — and the
    // branch then returned STR every time.
    const stats = { STR: 100_000, CON: 100_000, DEX: 100_000, INT: 100_000, WIS: 100_000, CHA: 100_000, 'HP Max': 1, 'MP Max': 1 };
    const rng = new RandomGenerator('weighted');
    const picks = new Map<string, number>();
    for (let index = 0; index < 4000; index += 1) {
      const stat = generateStatReward(rng, stats as never);
      picks.set(stat, (picks.get(stat) ?? 0) + 1);
    }

    // Six equal prime stats, so no one of them should dominate. Before the clamp, STR took roughly
    // four times its share.
    const str = picks.get('STR') ?? 0;
    expect(str / 4000, `STR took ${((str / 4000) * 100).toFixed(0)}%`).toBeLessThan(0.35);
    expect(picks.size).toBeGreaterThan(4);
  });
});

describe('a new character owns nothing, rather than an empty stack of gold', () => {
  /*
   * `createNewCharacter` seeded `{ name: 'Gold', qty: 0 }`, and the market walk sells
   * `inventory[0]`. So the first market trip of every character that has ever existed opened with
   * "Selling 0 Golds...", "Sold 0x Gold for 0 gold." and "Got paid 0 gold pieces" — three
   * ungrammatical lines describing nothing, about three minutes in.
   *
   * Fixed at creation rather than in the market, because nothing needed the row: the purse is
   * `character.Gold`, and both `calculateEncumbrance` and the loot generator filter Gold out by name.
   * A recorded fixture does sell a Gold stack, but at a quantity of ten — the degenerate case was
   * only ever the empty one.
   */
  it('starts with an empty inventory', () => {
    const character = createNewCharacter('Fresh', 'Half Daemon', 'Robot Monk', new RandomGenerator('fresh'));
    expect(character.Inventory).toEqual([]);
  });

  it('never reports selling nothing for nothing', () => {
    let state: GameTransitionState = {
      character: createNewCharacter('Fresh', 'Half Daemon', 'Robot Monk', new RandomGenerator('market')),
      progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const rng = new RandomGenerator('market-run');

    // Long enough to cover several market trips, the first of which is where this always fired.
    for (let tick = 0; tick < 4000; tick += 1) {
      const result = advanceGame(state, 1000, rng);
      state = result.state;
      // The task description is the surface a watcher reads, and it is where the defect showed:
      // "Selling 0 Golds..." with the ungrammatical plural. `inventory_sold` carries only the gold
      // received, so the description is the thing to assert on rather than the event.
      expect(state.character.Task.description, state.character.Task.description).not.toMatch(/Selling 0 /);
    }
  });
});
