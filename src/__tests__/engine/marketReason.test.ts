import { describe, expect, it } from 'vitest';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { describeDecisionReason } from '../../state/gameEventAdapter';

/**
 * The only mechanical explanation in the game, on the path that actually triggers it.
 *
 * `describeDecisionReason` renders "Carrying N of M cubits. At capacity, procurement routes the hero
 * to market." It fires when `task_started` carries a `reason`, and `marketReason` was set in exactly
 * one place: the `act_marker` branch. Ordinary play routes to market from `generateTaskDescription`
 * instead, so an hour of real play produced **zero** occurrences of the word "cubits" against
 * **twenty-one** market trips.
 *
 * The mechanic that hijacks the hero most often was the one never explained — by copy that already
 * existed, was already in register, and was already tested.
 */

const play = (seed: string, seconds: number) => {
  let state: GameTransitionState = {
    character: createNewCharacter('Porter', 'Half Daemon', 'Robot Monk', new RandomGenerator(seed)),
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const rng = new RandomGenerator(`${seed}:run`);
  let trips = 0;
  let explained = 0;
  const reasons: string[] = [];

  for (let second = 0; second < seconds; second += 1) {
    const result = advanceGame(state, 1000, rng);
    state = result.state;
    for (const { event } of result.records) {
      if (event.type !== 'task_started' || event.task.type !== 'heading_to_market') continue;
      trips += 1;
      if (event.reason === undefined) continue;
      explained += 1;
      reasons.push(describeDecisionReason(event) ?? '');
    }
  }
  return { trips, explained, reasons };
};

describe('the hero says why they are walking to town', () => {
  it('explains every market trip, not only the one after an act marker', () => {
    for (const seed of ['porter-a', 'porter-b', 'porter-c']) {
      const { trips, explained } = play(seed, 3600);
      // The reach is the whole finding: twenty-one trips an hour, none of them explained.
      expect(trips, `${seed}: no market trips to explain`).toBeGreaterThan(5);
      expect(explained, `${seed}: ${explained} of ${trips} trips explained`).toBe(trips);
    }
  });

  it('quotes the engine figures rather than an estimate of them', () => {
    // Both numbers are the comparison the engine just made. A gloss that recomputed them from a
    // slightly different state would be a second opinion presented as the reason.
    const { reasons } = play('porter-a', 3600);
    expect(reasons.length).toBeGreaterThan(5);
    for (const reason of reasons) {
      expect(reason, reason).toMatch(/Carrying \d[\d,]* of \d[\d,]* cubits/);
      const [carried, capacity] = [...reason.matchAll(/(\d[\d,]*) cubits|Carrying (\d[\d,]*) of (\d[\d,]*)/g)]
        .flatMap((match) => [match[2], match[3]])
        .filter((value): value is string => value !== undefined)
        .map((value) => Number(value.replaceAll(',', '')));
      expect(carried, reason).toBeGreaterThanOrEqual(capacity!);
    }
  });

  it('says nothing on a trip that is not about capacity', () => {
    // Only the capacity route carries a reason. A hero walking to town for any other cause must not
    // be given this explanation, which would be a confident answer to a question nobody asked.
    for (const seed of ['porter-a', 'porter-b']) {
      const { reasons } = play(seed, 3600);
      for (const reason of reasons) expect(reason, reason).toContain('At capacity');
    }
  });
});
