import { describe, expect, it } from 'vitest';
import { createNewCharacter, generateStatReward, generateTaskDescription } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
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
