import { describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { MAX_PERSISTED_DESCRIPTION_LENGTH } from '../../data/limits';
import { characterSheetSchema } from '../../state/schemas';

/**
 * The three characters that made a save unwritable forever.
 *
 * A pending entry becomes the running task with an ellipsis appended. Both fields are held to the
 * same `MAX_PERSISTED_DESCRIPTION_LENGTH`, so a description the schema was willing to accept became
 * one it refused, at the first task transition — and since the reload restored the same entry and
 * ran the same transition, the loop had no exit but deleting the character.
 *
 * Measured before the fix: 996 and 997 survived; 998, 999 and 1000 broke.
 *
 * The general shape is worth naming, because it is not specific to this field. Whenever a value is
 * read from a bounded field, decorated, and written back to a field with the same bound, the
 * decoration is the amount by which the second bound is too small. `describeGameEvent` clamps
 * against exactly this; this path did not.
 */

const runningTask = (pendingLength: number) => {
  const character = createNewCharacter('Verbose', 'Half Daemon', 'Robot Monk', new RandomGenerator('cap'));
  const state: GameTransitionState = {
    character: {
      ...character,
      PendingTasks: [
        { description: 'x'.repeat(pendingLength), durationMs: 1000, elapsedMs: 0, type: 'prologue' },
        { description: 'Loading', durationMs: 2000, elapsedMs: 0, type: 'act_marker' },
      ],
    },
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  // Past the two-second loading task but not past the one-second entry that follows it, so the long
  // description is the task actually running. Landing on 3000 instead steps clean over it onto the
  // act marker, which is a sixteen-character string that satisfies every assertion below for free —
  // which is exactly how the first version of this test passed against an unclamped engine.
  return advanceGame(state, 2500, new RandomGenerator('cap-run')).state.character;
};

describe('a pending description that fills the cap still fits once it is running', () => {
  it('keeps the running task inside the cap the sheet is validated against', () => {
    for (const length of [996, 997, 998, 999, MAX_PERSISTED_DESCRIPTION_LENGTH]) {
      const character = runningTask(length);
      expect(character.Task.description.length, `pending ${length}`).toBeLessThanOrEqual(MAX_PERSISTED_DESCRIPTION_LENGTH);
      // The sheet schema is the thing that actually refused, so it is the thing asserted. Checking
      // only the length would pass against a clamp applied to the wrong field.
      expect(characterSheetSchema.safeParse(character).success, `pending ${length}`).toBe(true);
    }
  });

  it('spends the clamp on the sentence rather than on the ellipsis', () => {
    // The ellipsis is what distinguishes the task being done now from the same task waiting its
    // turn, so it is the part that has to survive. Trimming the result instead would leave a
    // sentence that merely looks cut off, which is the same picture as a truncated one.
    expect(runningTask(MAX_PERSISTED_DESCRIPTION_LENGTH).Task.description.endsWith('...')).toBe(true);
  });

  it('leaves an ordinary description exactly as it was, plus the ellipsis', () => {
    // The clamp must be inert at every length that occurs in play — engine-authored descriptions
    // are two orders of magnitude below the cap, and none of them should move.
    const character = createNewCharacter('Ordinary', 'Half Daemon', 'Robot Monk', new RandomGenerator('plain'));
    const state: GameTransitionState = {
      character,
      progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const advanced = advanceGame(state, 2500, new RandomGenerator('plain-run')).state.character;
    expect(advanced.Task.description).toBe('Experiencing an enigmatic and foreboding night vision...');
  });
});
