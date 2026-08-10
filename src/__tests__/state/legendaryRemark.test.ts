import { describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { levelUpTime } from '../../engine/math';
import { advanceGame } from '../../engine/transition';
import { projectWorld } from '../../state/worldContext';

/**
 * Driven through the real engine rather than hand-built records: the whole point is that a rare
 * classification produces a different reaction, and only the engine decides what is rare.
 */
function harvest(seed: string, hours: number) {
  const rng = new RandomGenerator(seed);
  let state = {
    character: createNewCharacter('Harvest', 'Half Daemon', 'Robot Monk', rng),
    progression: { experience: { currentSeconds: 0, maxSeconds: levelUpTime(1) }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const byLabel = new Map<string, { items: number; notices: number; texts: string[] }>();
  for (let step = 0; step < hours * 60 * 60 * 20; step += 1) {
    const result = advanceGame(state, 50, rng);
    state = result.state;
    for (const record of result.records) {
      const projection = projectWorld({ kind: 'transition', source: { activityId: 0, record } });
      if (!projection.equipment) continue;
      const bucket = byLabel.get(projection.equipment.label) ?? { items: 0, notices: 0, texts: [] };
      bucket.items += 1;
      bucket.notices += projection.notices.length;
      bucket.texts.push(...projection.notices.map((entry) => entry.text));
      byLabel.set(projection.equipment.label, bucket);
    }
  }
  return byLabel;
}

describe('legendary acquisitions', () => {
  const harvested = harvest('legendary-remark', 6);

  it('are rare enough that remarking on them means something', () => {
    // Counted as acquisitions, not as notices. Legendary items now emit two notices each, so
    // measuring their share of notice text would count the remark as evidence for its own
    // justification - which is how the first version of this test read 10% for a 2% event.
    //
    // The bound is loose because the rate genuinely varies by seed: two six-hour runs came out at
    // 1.8% and 5.3%. It is here to catch the tier becoming ordinary, not to pin a frequency the
    // engine never promised.
    const total = [...harvested.values()].reduce((sum, bucket) => sum + bucket.items, 0);
    const legendary = harvested.get('legendary')?.items ?? 0;
    expect(legendary).toBeGreaterThan(0);
    expect(legendary / total).toBeLessThan(0.15);
  });

  it('say something the ordinary ones do not', () => {
    // Previously every tier produced the same sentence with a different adjective in it.
    const legendary = harvested.get('legendary')!;
    const serviceable = harvested.get('serviceable')!;
    expect(legendary.notices).toBe(legendary.items * 2);
    expect(serviceable.texts.every((text) => text.includes('filed at generation quality'))).toBe(true);
    expect(legendary.texts.some((text) => !text.includes('filed at generation quality'))).toBe(true);
  });

  it('still state plainly that nothing was gained in a fight', () => {
    const legendary = harvested.get('legendary')!;
    // "damage is not modeled", not "no combat effect": equipment does shorten encounters, and the
    // panel beside this one prints "Processing time reduced by N%" citing the same items. The old
    // string made the console contradict its neighbour, and this assertion defended it.
    expect(legendary.texts.some((text) => text.includes('damage is not modeled'))).toBe(true);
    expect(legendary.texts.some((text) => text.includes('no combat effect is modeled'))).toBe(false);
    for (const text of legendary.texts) {
      // A claim of power, not the word. The disclaimer above *denies* damage, so banning the token
      // outright would forbid the very sentence this test now requires — the check has to be about
      // what the line asserts rather than which nouns it contains.
      expect(text, text).not.toMatch(/deals? damage|damage bonus|increases? damage|mitigat|stronger|deadlier|powerful|bonus to/i);
    }
  });
});

describe('opponent count exposure', () => {
  it('reports a count on encounters and on nothing else', async () => {
    const rng = new RandomGenerator('opponent-exposure');
    let state = {
      character: createNewCharacter('Counter', 'Half Daemon', 'Robot Monk', rng),
      progression: { experience: { currentSeconds: 0, maxSeconds: levelUpTime(1) }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const seenByType = new Map<string, Set<number | undefined>>();
    for (let step = 0; step < 2 * 60 * 60 * 20; step += 1) {
      state = advanceGame(state, 50, rng).state;
      const task = state.character.Task;
      const bucket = seenByType.get(task.type) ?? new Set();
      bucket.add(task.opponents);
      seenByType.set(task.type, bucket);
    }

    expect([...seenByType.get('kill')!].every((count) => count !== undefined && count >= 1)).toBe(true);
    // Nothing that is not an encounter claims a count.
    for (const [type, counts] of seenByType) {
      if (type === 'kill') continue;
      expect([...counts]).toEqual([undefined]);
    }
  });

  it('reports more than one where the engine actually fights a crowd', async () => {
    // Multi-opponent pulls need a level that hours of play would be needed to reach, so the
    // generator is asked directly rather than waited for. Without this the field could report a
    // constant 1 forever and the test above would still pass.
    const { generateTaskDescription } = await import('../../engine/sim');
    const rng = new RandomGenerator('crowd');
    const character = createNewCharacter('Veteran', 'Half Daemon', 'Robot Monk', rng);
    character.Traits.Level = 60;
    character.Inventory = [];

    const counts = new Set<number | undefined>();
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const task = generateTaskDescription(rng, character);
      if (task.type === 'kill') counts.add(task.opponents);
    }
    expect([...counts].some((count) => (count ?? 0) > 1)).toBe(true);
  });

  it('restores a checkpoint written before the field existed', async () => {
    // Save compatibility is the risk this change actually carries, so it is asserted rather than
    // reasoned about: a task with no opponents field must still parse.
    const { progressTaskSchema } = await import('../../state/schemas');
    const legacyTask = { description: 'Executing a kobold...', durationMs: 1000, elapsedMs: 0, type: 'kill' as const };
    expect(progressTaskSchema.safeParse(legacyTask).success).toBe(true);
    expect(progressTaskSchema.safeParse({ ...legacyTask, opponents: 3 }).success).toBe(true);
    // A large crowd is legitimate - the count is derived from level, and at the maximum level the
    // engine produces hundreds of millions - so the bound is the shared persistence ceiling rather
    // than a guess at a plausible number. Only the impossible is refused.
    const { MAX_PERSISTED_VALUE } = await import('../../data/limits');
    expect(progressTaskSchema.safeParse({ ...legacyTask, opponents: 10_000 }).success).toBe(true);
    expect(progressTaskSchema.safeParse({ ...legacyTask, opponents: 0 }).success).toBe(false);
    expect(progressTaskSchema.safeParse({ ...legacyTask, opponents: 1.5 }).success).toBe(false);
    expect(progressTaskSchema.safeParse({ ...legacyTask, opponents: MAX_PERSISTED_VALUE + 1 }).success).toBe(false);
  });
});
