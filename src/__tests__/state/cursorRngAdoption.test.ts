import { afterEach, describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { useGameStore } from '../../state/gameStore';
import { captureActiveSession } from '../../state/sessionCheckpoint';
import { activeCheckpointV1Schema, characterSheetSchema } from '../../state/schemas';
import { MAX_PENDING_TASKS } from '../../data/limits';
import type { CharacterSheet } from '../../engine/types';

/**
 * A hero caught mid-duel, and the one field that could not survive the trip.
 *
 * `activeCheckpointV1Schema` requires a nemesis cursor's `replayRngState` to equal the session's RNG
 * state. `characterSheetSchema` has no equivalent rule — `rngState` is not part of a sheet — so such
 * a character imports cleanly and loads from the roster cleanly, and is then unwritable for as long
 * as the duel lasts, with the checkpoint refused on every tick.
 *
 * The session used to seed its generator from the character's own JSON, which cannot land on the
 * cursor's continuation by any arrangement of the sheet.
 *
 * The cursor was always self-contained: `replayNemesisRound` sets the generator from this same field
 * before every round. So adopting it parks the generator exactly where the next round would start it
 * anyway, and the duel resumes rather than being silently discarded on load.
 */

// Restored wholesale, the idiom the checkpoint suite already uses — minus its `localStorage.clear()`,
// which needs jsdom. Nothing here reaches storage: `captureActiveSession` reads the store and
// returns, and the writing is what the checkpoint controller does with it.
//
// (`GameStore` has no `reset`; an optional call on a property the type does not declare is a
// typecheck error rather than a graceful no-op.)
const originalState = useGameStore.getState();
afterEach(() => useGameStore.setState(originalState, true));

/** An act well past the tenth, which is the earliest a nemesis duel can occur. */
const ACT = 94;

const midDuel = (): CharacterSheet => {
  const character = createNewCharacter('Duelling', 'Half Daemon', 'Robot Monk', new RandomGenerator('duel'));
  // Any state that is not the one the session would derive from this sheet's JSON — which is every
  // state, since that derivation cannot be steered. Taken from an unrelated generator so the test
  // does not accidentally encode the seeding rule it exists to be independent of.
  const elsewhere = new RandomGenerator('a different continuation entirely');
  elsewhere.random(1000);

  return {
    ...character,
    Plot: { act: ACT, currentProgress: 3, maxProgress: 26 },
    Task: { description: 'Locked in grim combat with Vashenko the Gnoll...', durationMs: 2000, elapsedMs: 0, type: 'cinematic' },
    PendingTasks: [
      {
        description: 'Locked in grim combat with Vashenko the Gnoll',
        type: 'nemesis_cursor',
        nemesis: 'Vashenko the Gnoll',
        round: MAX_PENDING_TASKS - 4,
        advantageMod3: 1,
        // The schema pins this to the act, so it is derived rather than written down twice.
        rollLimit: ACT + 2,
        replayRngState: elsewhere.getState(),
      },
      { description: 'Loading', durationMs: 1000, elapsedMs: 0, type: 'act_marker' },
    ],
  };
};

describe('a character loaded mid-duel can still be checkpointed', () => {
  it('accepts the sheet, which is what let this through in the first place', () => {
    // The sheet schema has no rule about RNG continuation and cannot have one. That is precisely why
    // the mismatch had to be resolved on load rather than refused at the door.
    expect(characterSheetSchema.safeParse(midDuel()).success).toBe(true);
  });

  for (const source of ['import', 'roster'] as const) {
    it(`writes a valid checkpoint after loading from ${source}`, () => {
      useGameStore.getState().startSession({ source, character: midDuel() });

      const captured = captureActiveSession(0);
      const parsed = activeCheckpointV1Schema.safeParse(captured);
      expect(parsed.success, parsed.success ? '' : parsed.error.issues.map(({ message }) => message).join('; ')).toBe(true);
    });
  }

  it('parks the generator on the cursor, not merely on something that validates', () => {
    // Asserted against the cursor's own field rather than against "some state that passes", so a fix
    // that satisfied the schema by rewriting the cursor instead would not pass here. The duel has to
    // resume where it left off; making the complaint go away is not the same thing.
    const character = midDuel();
    const cursor = character.PendingTasks?.[0];
    useGameStore.getState().startSession({ source: 'import', character });

    expect(cursor?.type).toBe('nemesis_cursor');
    if (cursor?.type !== 'nemesis_cursor') return;
    expect(useGameStore.getState().rng.getState()).toEqual(cursor.replayRngState);
  });

  it('leaves a character without a cursor seeded as before', () => {
    // The adoption is conditional, and an ordinary load must not change. Two loads of the same sheet
    // land on the same generator, which is the determinism the seeding rule exists for.
    const plain = createNewCharacter('Ordinary', 'Half Daemon', 'Robot Monk', new RandomGenerator('plain'));
    useGameStore.getState().startSession({ source: 'roster', character: plain });
    const first = useGameStore.getState().rng.getState();
    useGameStore.getState().startSession({ source: 'roster', character: plain });

    expect(useGameStore.getState().rng.getState()).toEqual(first);
    // And distinct from the duelling hero's continuation, so "both loads agree" cannot be satisfied
    // by the adoption having fired on a sheet that carries no cursor at all.
    const duelling = midDuel().PendingTasks?.[0];
    if (duelling?.type === 'nemesis_cursor') expect(first).not.toEqual(duelling.replayRngState);
  });
});
