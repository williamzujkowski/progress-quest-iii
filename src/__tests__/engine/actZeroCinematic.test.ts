import { describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { characterSheetSchema } from '../../state/schemas';

/**
 * The engine producing a state its own sheet schema forbids.
 *
 * `characterSheetSchema` permits a cinematic only above act 0, and permits act 0 only alongside
 * `loading` or `prologue`. But `plot.act` advances when the act marker fires, not when the bar
 * fills — so a full bar at act 0 started a cinematic the sheet then refused, and every write failed
 * from that tick onward. Not a lost checkpoint: no checkpoint was ever written at all.
 *
 * Act 0 has exactly one way out, and the cinematic is not it — the prologue ends with its own act
 * marker. So a bar that fills early there is clamped and waits.
 *
 * A randomized fuzz over 3000 schema-legal importable sheets found this signature and only this one,
 * 90 times, which is why the sheet is asserted rather than the pending list alone.
 */

/** The importable sheet that provoked it: act 0, a kill already at full progress on both bars. */
const stranded = (): GameTransitionState => {
  const character = createNewCharacter('Stranded', 'Half Daemon', 'Robot Monk', new RandomGenerator('act0'));
  return {
    character: {
      ...character,
      Plot: { act: 0, currentProgress: 26, maxProgress: 26 },
      Task: { description: 'Executing a Backlog Item', durationMs: 1000, elapsedMs: 0, type: 'kill' },
      PendingTasks: undefined,
    },
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
};

describe('a plot bar that fills during act 0 does not start a cinematic', () => {
  it('refuses the sheet at the door rather than stranding it', () => {
    /*
     * This asserted that the stranded sheet stayed *writable* across 600 ticks, which it did — and
     * that turned out to be half an answer. The engine correctly declines to start a cinematic at
     * act 0, so the plot pinned at full and the hero never advanced an act again: the save-loss
     * became a silent permanent stall, with the hero still levelling and looting.
     *
     * The schema now refuses `act === 0` paired with a non-prologue task, so the sheet never gets
     * far enough to strand. The engine guard below stays, because it is what makes the state
     * unreachable from play rather than merely unimportable.
     */
    expect(characterSheetSchema.safeParse(stranded().character).success).toBe(false);
  });

  it('keeps an ordinary act-0 character writable throughout the prologue', () => {
    // The refusal must not catch a real newcomer. A fresh character is act 0 for its first
    // twenty-eight seconds, and every tick of that has to stay valid.
    let state: GameTransitionState = {
      character: createNewCharacter('Ordinary', 'Half Daemon', 'Robot Monk', new RandomGenerator('act0-ok')),
      progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const rng = new RandomGenerator('act0-ok-run');
    for (let tick = 0; tick < 120; tick += 1) {
      state = advanceGame(state, 1000, rng).state;
      const parsed = characterSheetSchema.safeParse(state.character);
      expect(parsed.success, `tick ${tick}: ${parsed.success ? '' : parsed.error.issues[0]?.message}`).toBe(true);
    }
  });

  it('never puts a cinematic task in front of a hero still in act 0', () => {
    let state = stranded();
    const rng = new RandomGenerator('act0-tasks');

    for (let tick = 0; tick < 600; tick += 1) {
      state = advanceGame(state, 1000, rng).state;
      const { Plot, Task, PendingTasks } = state.character;
      if (Plot.act > 0) break;
      expect(Task.type, `tick ${tick}`).not.toBe('cinematic');
      for (const entry of PendingTasks ?? []) expect(entry.type, `tick ${tick}`).not.toBe('cinematic');
    }
  });

  it('still runs the cinematic once the act is past its first, which the guard must not cost', () => {
    // The guard is a phase rule, not a removal. An act-1 hero whose bar is full gets the interplot
    // sequence exactly as before — without this, the fix would read as "cinematics deleted".
    const character = createNewCharacter('Onward', 'Half Daemon', 'Robot Monk', new RandomGenerator('act1'));
    let state: GameTransitionState = {
      character: {
        ...character,
        Plot: { act: 1, currentProgress: 26, maxProgress: 26 },
        Task: { description: 'Executing a Backlog Item', durationMs: 1000, elapsedMs: 0, type: 'kill' },
        PendingTasks: undefined,
      },
      progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const rng = new RandomGenerator('act1-run');

    let sawCinematic = false;
    for (let tick = 0; tick < 60 && !sawCinematic; tick += 1) {
      state = advanceGame(state, 1000, rng).state;
      sawCinematic = state.character.Task.type === 'cinematic'
        || (state.character.PendingTasks ?? []).some(({ type }) => type === 'cinematic');
    }
    expect(sawCinematic).toBe(true);
  });
});
