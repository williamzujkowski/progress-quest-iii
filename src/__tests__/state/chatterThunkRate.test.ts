import { describe, expect, it } from 'vitest';
import { createNewCharacter } from '../../engine/sim';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { RandomGenerator } from '../../engine/prng';
import { NEW_CADENCE, scheduleChatter, type ChatterCadence } from '../../state/chatterSchedule';
import { projectAmbient, projectSocialBatch } from '../../state/socialProjection';
import { fileLoadout } from '../../engine/loadoutFiling';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * The rate the ambient thunk actually fires at, asserted rather than claimed.
 *
 * `scheduleChatter` takes its ambient argument as a thunk because building it is the most expensive
 * thing on the tick — `fileLoadout` alone is 22 µs of a 26 µs tick, and the memory bag behind it now
 * walks the roster, the caseload and the world context as well. The whole justification is that the
 * branch is rare.
 *
 * Three comments stated that rarity as "27 of 20 000 ticks". Re-measured, it is about **610** — off
 * by twenty-three times. The conclusion never moved (3.1% against 100% is still a thirty-two-fold
 * saving) but nobody could have noticed the drift, because a figure in a comment is not something
 * anybody runs.
 *
 * So the band is here instead. Wide on purpose: the exact rate is a cadence decision and should be
 * free to move. What it must not do is reach every tick, which would silently restore the cost the
 * thunk exists to avoid, or fall to zero, which would mean the ambient channel had gone quiet.
 */

const TICKS = 6000;

const measure = (seed: string) => {
  let state: GameTransitionState = {
    character: createNewCharacter('Reach', 'Half Daemon', 'Robot Monk', new RandomGenerator(seed)),
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const rng = new RandomGenerator(`${seed}:run`);
  let cadence: ChatterCadence = NEW_CADENCE;
  let invoked = 0;
  let ambientLines = 0;
  let ticksWithRecords = 0;

  for (let tick = 0; tick < TICKS; tick += 1) {
    const result = advanceGame(state, 1000, rng);
    state = result.state;
    const sources = result.records.map((record, index) => ({ activityId: tick * 10 + index, record })) as IdentifiedGameTransitionRecord[];
    if (sources.length === 0) continue;
    ticksWithRecords += 1;

    const chatterTasks = sources.at(-1)!.record.post.completedTasks;
    const scheduled = scheduleChatter(
      projectSocialBatch(sources, state.character.Quest.history),
      cadence,
      chatterTasks,
      () => {
        invoked += 1;
        return projectAmbient(sources.at(-1)!.record.post.hero, chatterTasks, { loadout: fileLoadout(state.character) });
      },
    );
    cadence = scheduled.cadence;
    ambientLines += scheduled.entries.filter(({ sceneKind }) => sceneKind === 'ambient').length;
  }

  return { invoked, ambientLines, ticksWithRecords };
};

describe('the ambient thunk stays rare enough to be worth being a thunk', () => {
  it('fires on a small share of ticks, and not on none of them', () => {
    for (const seed of ['rate-a', 'rate-b']) {
      const { invoked } = measure(seed);
      const share = invoked / TICKS;
      // The measured rate is about 0.031. The band tolerates a cadence redesign and refuses the two
      // failures that matter: a thunk on every tick, and a channel that stopped talking.
      expect(share, `${seed}: ${invoked}/${TICKS}`).toBeGreaterThan(0.005);
      expect(share, `${seed}: ${invoked}/${TICKS}`).toBeLessThan(0.12);
    }
  });

  it('is discarded far more often than it is used, which is the reason it is deferred', () => {
    // The claim the thunk rests on, stated as a ratio rather than a rate so it survives a change to
    // how often a tick produces records at all.
    for (const seed of ['rate-a', 'rate-b']) {
      const { invoked, ticksWithRecords } = measure(seed);
      expect(ticksWithRecords).toBeGreaterThan(invoked * 4);
    }
  });

  it('still puts ambient lines in the feed at a rate a watcher would notice', () => {
    // The other half, and the thing the rate is in service of. A thunk that never fired would pass
    // the band above and mean the seven memory-fed lanes were invisible.
    //
    // Roughly 120 lines an hour at one tick per second, which is about a third of the sampled span
    // here. Asserted as a floor rather than a band: the ceiling is the band above.
    for (const seed of ['rate-a', 'rate-b']) {
      const { ambientLines } = measure(seed);
      expect(ambientLines, `${seed}`).toBeGreaterThan(TICKS / 100);
    }
  });
});
