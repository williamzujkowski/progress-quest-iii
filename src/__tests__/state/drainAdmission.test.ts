import { describe, expect, it } from 'vitest';
import { NEW_CADENCE, scheduleChatter } from '../../state/chatterSchedule';
import type { SocialEntry, SocialSceneKind } from '../../state/socialProjection';

/**
 * A hidden tab does not advance the clock — `gameClock` returns early on `document.hidden` — so time
 * is banked and every return from a background tab is a drain. The projection looks at the hundreds
 * of scenes that produces and keeps the few worth reading, ranked by priority.
 *
 * Those survivors were then run through the one-in-five admission gate written for a live tick, and
 * about four in five were thrown away. Meanwhile the row announcing that scenes had been discarded
 * is in `ALWAYS_HEARD` and never dropped, so the notice of the loss was unconditional and the
 * content was a lottery.
 */

const scene = (sceneId: string, sceneKind: SocialSceneKind): SocialEntry => ({
  id: `${sceneId}:0`,
  sceneId,
  sceneKind,
  sourceActivityId: 1,
  channel: sceneKind === 'catch_up' ? 'system' : 'guild',
  speaker: { id: 'x', kind: 'cast', displayName: 'X', role: 'r', fictional: true, automaticHero: false },
  text: `line for ${sceneId}`,
});

const ordinary = (count: number, offset = 0) =>
  Array.from({ length: count }, (_unused, index) => scene(`s:${offset + index}`, 'loot'));

const spokenScenes = (entries: readonly SocialEntry[], completedTasks: number) =>
  new Set(scheduleChatter(entries, NEW_CADENCE, completedTasks).entries.map(({ sceneId }) => sceneId)).size;

describe('a return from being away is not a tick', () => {
  it('admits every scene the projection kept when the batch is a drain', () => {
    // The batch carries a catch-up row, which is what a drain looks like from here. The scenes
    // beside it have already been curated by priority; a second lottery on top of that is the defect.
    const batch = [scene('drain', 'catch_up'), ...ordinary(8)];

    expect(spokenScenes(batch, 500)).toBe(9);
  });

  it('still gates an ordinary batch, which is where the rule earns its place', () => {
    // The same eight scenes without the catch-up row. Roughly one in five survives, so a run of
    // batches must lose most of them — the rule is the difference between reporting and noticing,
    // and this change must not have quietly deleted it.
    let admitted = 0;
    let offered = 0;
    for (let task = 0; task < 200; task += 1) {
      const batch = ordinary(8, task * 8);
      offered += 8;
      admitted += spokenScenes(batch, task);
    }

    expect(admitted).toBeGreaterThan(0);
    expect(admitted / offered).toBeLessThan(0.5);
  });

  it('does not treat a lone milestone as a return', () => {
    // `catch_up` is the marker, not `ALWAYS_HEARD` membership. A level or a milestone is always
    // heard on its own account and must not drag the rest of its batch in with it.
    const batch = [scene('level', 'level'), ...ordinary(8)];

    expect(spokenScenes(batch, 7)).toBeLessThan(9);
  });
});
