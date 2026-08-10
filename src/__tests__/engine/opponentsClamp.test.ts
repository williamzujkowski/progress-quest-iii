import { describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter, generateTaskDescription } from '../../engine/sim';
import { MONSTERS } from '../../data/traits';
import { MAX_PERSISTED_VALUE } from '../../data/limits';
import { characterSheetSchema } from '../../state/schemas';

/**
 * The one engine output on the task path that was not clamped.
 *
 * The monster count divides the target level by the monster's own, so a level-zero monster gives a
 * divisor of one and hands back the level itself. At a level near the persisted ceiling that count
 * is past `MAX_PERSISTED_VALUE`, and the sheet carrying it cannot be written.
 *
 * `getRandomMonster` would never pair a near-billion level with a level-zero monster on its own.
 * The quest-target bias is what makes it reachable: it selects on `Quest.targetIndex`, which an
 * importer chooses freely, and 42 of the 232 monsters are level one or lower.
 *
 * Nothing reads `opponents` back, so the only consequence was the save-loss — which is why this is
 * a clamp rather than a redesign of the count.
 */

/** `Backlog Item`, level 0 — the cheapest divisor in the table. */
const LEVEL_ZERO_INDEX = MONSTERS.findIndex(({ level }) => level === 0);

const hostile = (level: number) => {
  const character = createNewCharacter('Overrun', 'Half Daemon', 'Robot Monk', new RandomGenerator('clamp'));
  const target = MONSTERS[LEVEL_ZERO_INDEX]!;
  return {
    ...character,
    // Past the prologue, with its pending sequence cleared. Act 0 admits only `loading` and
    // `prologue` tasks, so a kill task there fails the phase rule for an unrelated reason and would
    // mask whatever this file is trying to say.
    Plot: { act: 1, currentProgress: 0, maxProgress: 26 },
    PendingTasks: undefined,
    Traits: { ...character.Traits, Level: level },
    Quest: {
      ...character.Quest,
      kind: 'exterminate' as const,
      targetIndex: LEVEL_ZERO_INDEX,
      target: `${target.name}|${target.level}|${target.item}`,
    },
  };
};

describe('the monster count stays inside what a sheet can hold', () => {
  it('finds the level-zero monster the bias can be pointed at', () => {
    // Every assertion below rests on this index existing; a table edit that removed it would
    // otherwise turn the whole file green without testing anything.
    expect(LEVEL_ZERO_INDEX).toBeGreaterThanOrEqual(0);
    expect(MONSTERS[LEVEL_ZERO_INDEX]?.level).toBe(0);
  });

  it('never reports more opponents than the sheet may carry', () => {
    /*
     * At the persisted ceiling rather than at `MAX_FINITE_CHARACTER_LEVEL`, which is 5049 — five
     * orders of magnitude below the cap, so a count drawn there cannot reach it and this test
     * passed against the unclamped engine. The level that provokes the overflow is the one the
     * schema itself permits, since that is what an importer may write.
     */
    const character = hostile(MAX_PERSISTED_VALUE);
    // Many draws, because the bias fires on roughly one task in four and the count depends on the
    // roll — a single sample would miss it more often than not.
    for (let attempt = 0; attempt < 4000; attempt += 1) {
      const task = generateTaskDescription(new RandomGenerator(`hostile-${attempt}`), character);
      expect(task.opponents ?? 0, `attempt ${attempt}: ${task.description}`).toBeLessThanOrEqual(MAX_PERSISTED_VALUE);
    }
  });

  it('produces a task the sheet schema accepts at the persisted ceiling', () => {
    // The schema is what actually refused, so it is what is asserted. A length check alone would
    // pass against a clamp applied to the wrong field.
    const character = hostile(MAX_PERSISTED_VALUE);
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const task = generateTaskDescription(new RandomGenerator(`ceiling-${attempt}`), character);
      const sheet = { ...character, Task: { ...task, elapsedMs: 0 } };
      const parsed = characterSheetSchema.safeParse(sheet);
      expect(parsed.success, `attempt ${attempt}: ${parsed.success ? '' : parsed.error.issues[0]?.message}`).toBe(true);
    }
  });

  it('leaves ordinary counts alone, so the clamp is inert in play', () => {
    /*
     * Strictly below the ceiling rather than at or below it, and that is the whole assertion: a
     * clamped value lands exactly on `MAX_PERSISTED_VALUE`, so a count strictly under it is proof
     * the clamp never fired. A clamp that bit at these levels would be a balance change wearing a
     * bug fix.
     *
     * The first version of this bounded the count by the character's level, which is not an
     * invariant — `targetLevel` drifts above the hero's own level, so 36 opponents at level 33 is
     * ordinary rather than a symptom.
     */
    for (const level of [1, 5, 33, 51, 200]) {
      const character = hostile(level);
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const task = generateTaskDescription(new RandomGenerator(`ordinary-${level}-${attempt}`), character);
        expect(task.opponents ?? 1, `level ${level}`).toBeLessThan(MAX_PERSISTED_VALUE);
      }
    }
  });
});
