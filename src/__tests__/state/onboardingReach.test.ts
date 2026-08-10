import { describe, expect, it } from 'vitest';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { projectAmbient } from '../../state/socialProjection';
import { fileLoadout } from '../../engine/loadoutFiling';

/**
 * Whether a newcomer actually hears the lane that exists to talk to newcomers.
 *
 * `onboarding` is the one lane whose whole job is explaining the hall to somebody who just arrived,
 * and it is reachable only while the best thing they own is entry-tier — a window that closes on an
 * equipment tier rather than a clock, so it can shut in under two minutes.
 *
 * Weighted as an ordinary lane it was one slot in twenty-six. Measured over six fresh characters,
 * one heard it *never* and a second heard it *once*. The comment beside it claimed it was "loud
 * while it lasts", which a lane cannot be at one slot in twenty-six however short its window:
 * rarity multiplies with the window rather than cancelling against it.
 *
 * This is the assertion that comment should always have had. Every one of these figures is a
 * property of what ships rather than of the bank.
 */

const SEEDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

const survey = (seed: string) => {
  let state: GameTransitionState = {
    character: createNewCharacter('Newcomer', 'Half Daemon', 'Robot Monk', new RandomGenerator(seed)),
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const rng = new RandomGenerator(`${seed}:run`);
  let onboarding = 0;
  let total = 0;
  let firstSecond = -1;

  for (let second = 0; second < 900; second += 1) {
    const result = advanceGame(state, 1000, rng);
    state = result.state;
    if (result.records.length === 0) continue;
    const tasks = result.records.at(-1)!.post.completedTasks;
    // A loadout is passed, because that is what the store passes. The distinction matters: a caller
    // with no memory at all is not a newcomer and must not be treated as one.
    for (const entry of projectAmbient({ name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' }, tasks, { loadout: fileLoadout(state.character) })) {
      total += 1;
      if (!entry.sceneId.includes(':onboarding')) continue;
      onboarding += 1;
      if (firstSecond < 0) firstSecond = second;
    }
  }
  return { onboarding, total, firstSecond };
};

describe('the hall explains itself to everyone who arrives', () => {
  it('says something to every newcomer, not to five in six', () => {
    for (const seed of SEEDS) {
      const { onboarding } = survey(seed);
      // Three or more even on the character whose window closes soonest. A floor rather than a band
      // because the window length is drop-dependent and varies about fivefold between characters —
      // what must hold is that nobody gets zero, which is what shipped.
      expect(onboarding, `${seed}: ${onboarding} onboarding lines`).toBeGreaterThanOrEqual(3);
    }
  });

  it('speaks while the newcomer is still new', () => {
    // A line at minute nine is not onboarding, whatever lane produced it. Measured at 2 seconds for
    // every seed, so the bound is generous and still refuses a regression that pushed it late.
    for (const seed of SEEDS) {
      const { firstSecond } = survey(seed);
      expect(firstSecond, `${seed}: first onboarding line at ${firstSecond}s`).toBeGreaterThanOrEqual(0);
      expect(firstSecond, `${seed}: first onboarding line at ${firstSecond}s`).toBeLessThan(60);
    }
  });

  it('still ends on its own, rather than following the hero forever', () => {
    // The promotion must not become a permanent state. Onboarding is entry-tier only, so a hero
    // well past that tier must hear none of it — this is the half that keeps "loud" from becoming
    // "stuck".
    const veteran = createNewCharacter('Veteran', 'Half Daemon', 'Robot Monk', new RandomGenerator('vet'));
    let state: GameTransitionState = {
      character: veteran,
      progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const rng = new RandomGenerator('vet:run');
    for (let second = 0; second < 3000; second += 1) state = advanceGame(state, 1000, rng).state;

    const loadout = fileLoadout(state.character);
    expect(loadout?.itemOfRecord, 'the veteran should own something by now').toBeTruthy();

    let late = 0;
    for (let task = 0; task < 3000; task += 1) {
      for (const entry of projectAmbient({ name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' }, task, { loadout })) {
        if (entry.sceneId.includes(':onboarding')) late += 1;
      }
    }
    expect(late, `${late} onboarding lines for a hero past entry tier`).toBe(0);
  });

  it('leaves a caller that passes no memory alone', () => {
    // The permitting rule treats absent memory as entry tier, and that is right — but forcing the
    // lane on every memoryless caller would rewrite the ambient mix for most of the test suite and
    // for any surface that projects without a store behind it.
    let onboarding = 0;
    let total = 0;
    for (let task = 0; task < 3000; task += 1) {
      for (const entry of projectAmbient({ name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' }, task, {})) {
        total += 1;
        if (entry.sceneId.includes(':onboarding')) onboarding += 1;
      }
    }
    expect(total).toBeGreaterThan(1000);
    // Around one draw in twenty-six, which is the unpromoted weight. Well under a tenth either way.
    expect(onboarding / total, `${onboarding}/${total}`).toBeLessThan(0.1);
  });
});
