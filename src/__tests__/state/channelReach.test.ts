import { describe, expect, it } from 'vitest';
import { projectSocialBatch, type SocialChannel } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { ProgressTask } from '../../engine/types';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * Every channel the type admits is reachable, and the rarest one is pinned where it is decided.
 *
 * The chatter design issue records `raid` as producing zero messages in half an hour of play, and
 * reads that as a gap. It is not: `raid` is gated on `interplotRole === 'nemesis' && act >= 10`, and
 * an act costs `3600 * (1 + 5 * act)` seconds of plot progress, so reaching act ten is around ten
 * days of credited time. Driving the real engine for the equivalent of forty-four hours across three
 * seeds reached act four. The channel is rare on purpose — a raid line outside a raid would claim a
 * raid is happening — and rare is not the same as dead.
 *
 * But nothing pinned it. The existing tests assert the *text* moves from "dungeon" to "raid-class"
 * across the threshold, which is the wording rather than the routing: the three lines that carry it
 * choose `channel: raid ? 'raid' : 'party'`, and that expression could have been flattened to
 * `'party'` without a single test noticing. The channel would then be unreachable in play and
 * unreachable in the suite at once, while `ChatterFeed` went on carrying a label and a colour for
 * it — dead surface that looks alive.
 */

const task = (type: ProgressTask['type']): GameTransitionEvent =>
  ({ type: 'task_started', task: { description: `${type}...`, durationMs: 1000, elapsedMs: 0, type } } as GameTransitionEvent);

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
  act: 3,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 40,
  elapsedSeconds: 4000,
  ...overrides,
});

const source = (activityId: number, event: GameTransitionEvent, post: GamePresentationSnapshot): IdentifiedGameTransitionRecord =>
  ({ activityId, record: { event, post } });

const nemesisAt = (act: number, activityId: number) =>
  projectSocialBatch([source(activityId, task('cinematic'), snapshot({ completedTasks: activityId, act, nextTask: 'cinematic', interplotRole: 'nemesis' }))]);

const channelsOf = (entries: ReturnType<typeof projectSocialBatch>): ReadonlySet<SocialChannel> =>
  new Set(entries.map(({ channel }) => channel));

describe('the raid channel is rare, not dead', () => {
  it('routes a nemesis milestone at the threshold onto raid', () => {
    // The routing, not the wording. `channel: raid ? 'raid' : 'party'` is the line that decides it.
    expect(channelsOf(nemesisAt(10, 900))).toContain('raid');
  });

  it('routes the same milestone below the threshold somewhere else', () => {
    // A raid line outside a raid claims a raid is happening, which is the reason for the gate.
    const below = channelsOf(nemesisAt(9, 901));

    expect(below).not.toContain('raid');
    expect(below.size, 'the scene still has to say something').toBeGreaterThan(0);
  });

  it('holds across every hero the cast is drawn for', () => {
    // The variant chooser keys on the hero's identity, so one hero proves one variant. All three
    // milestone variants carry the same conditional, and a version that dropped it from two of them
    // would pass a single-hero check most of the time.
    for (let activityId = 910; activityId < 940; activityId += 1) {
      expect(channelsOf(nemesisAt(12, activityId)), `activity ${activityId}`).toContain('raid');
    }
  });
});
