import { describe, expect, it } from 'vitest';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame, type GameTransitionState } from '../../engine/transition';

/**
 * The game's own clock, against the time the tasks actually took.
 *
 * `elapsedSeconds` accrued `Math.floor(progressDelta)` once per completed task, discarding every
 * task's fractional second — about 0.368 s each. The loss is systematic and one-directional, so it
 * compounds: measured over twelve simulated hours the clock read **0.9152 to 0.9161** of real task
 * time, sixty-two minutes short.
 *
 * That clock is the world console's "adventure elapsed", and it is the denominator both hero-banner
 * ETAs divide by — so it made those read about 9.5% optimistic while a docstring asserted that a
 * game second is a real second.
 *
 * Rounding rather than accumulating the remainder, because the field is a `boundedInteger` in the
 * checkpoint schema: carrying a fraction in `progression` fails validation, which five tests
 * correctly catch. Rounding keeps the integer contract and makes the error unbiased rather than
 * one-directional, which is what removes the compounding.
 */

const ratioOver = (seed: string, seconds: number) => {
  let state: GameTransitionState = {
    character: createNewCharacter('Clockwatcher', 'Half Daemon', 'Robot Monk', new RandomGenerator(seed)),
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const rng = new RandomGenerator(`${seed}:run`);
  for (let second = 0; second < seconds; second += 1) state = advanceGame(state, 1000, rng).state;
  return state.progression.elapsedSeconds / seconds;
};

describe('the adventure clock keeps up with the adventure', () => {
  it('stays within a fraction of a percent of real task time', () => {
    // 0.9971 to 0.9994 when written, against 0.9152 to 0.9161 before. The bound is generous enough
    // to absorb a task-mix change and far tighter than the one-directional loss it replaces.
    for (const seed of ['clock-a', 'clock-b', 'clock-c']) {
      const ratio = ratioOver(seed, 43_200);
      expect(ratio, `${seed}: ratio ${ratio}`).toBeGreaterThan(0.99);
      expect(ratio, `${seed}: ratio ${ratio}`).toBeLessThanOrEqual(1.01);
    }
  });

  it('does not drift further the longer it runs, which is what made it compound', () => {
    // The old loss grew with task count, so a longer run was further behind. An unbiased error does
    // not: two spans agree, which is the property that actually matters.
    //
    // Both spans are hours rather than one short and one long. A two-hour sample measured 1.0101 —
    // above one, which is the point, but noisy enough at that task count to fail a tight bound for
    // the right reason. Comparing two stable spans tests convergence rather than sample size.
    const six = ratioOver('clock-a', 21_600);
    const twelve = ratioOver('clock-a', 43_200);
    expect(Math.abs(twelve - six), `six ${six}, twelve ${twelve}`).toBeLessThan(0.01);
  });

  it('still stores whole seconds, which the checkpoint schema requires', () => {
    // Carrying the remainder would be more exact and fails `boundedInteger` on the next write.
    let state: GameTransitionState = {
      character: createNewCharacter('Whole', 'Half Daemon', 'Robot Monk', new RandomGenerator('whole')),
      progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const rng = new RandomGenerator('whole:run');
    for (let second = 0; second < 2_000; second += 1) {
      state = advanceGame(state, 1000, rng).state;
      expect(Number.isInteger(state.progression.elapsedSeconds), `${state.progression.elapsedSeconds}`).toBe(true);
    }
  });
});
