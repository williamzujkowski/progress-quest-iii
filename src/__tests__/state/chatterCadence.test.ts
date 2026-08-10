import { describe, expect, it } from 'vitest';
import { NEW_CADENCE, readyToSpeak, scheduleChatter } from '../../state/chatterSchedule';
import type { SocialEntry, SocialSceneKind } from '../../state/socialProjection';

/**
 * The gate is asserted over a run rather than per call.
 *
 * A cadence test that pins one batch to one answer says nothing about the rate, and the rate is the
 * whole reason this exists — the feed was measured at 43.5 messages a minute against a target of
 * two to four.
 */

const scene = (sceneId: string, sceneKind: SocialSceneKind, lines = 3): SocialEntry[] =>
  Array.from({ length: lines }, (_, index) => ({
    id: `${sceneId}:${index}`,
    sceneId,
    sceneKind,
    sourceActivityId: 1,
    channel: 'guild' as const,
    speaker: { id: 'x', kind: 'cast' as const, displayName: 'X', role: 'r', fictional: true as const, automaticHero: false },
    // Distinct per scene, because the gate now declines a scene whose text is still on screen.
    // `line ${index}` made all 600 scenes byte-identical, which no real run produces — the loot bank
    // alone has thirteen variants and interpolates item names — and it turned a rate test into a
    // repetition test that reported the gate had silenced the channel.
    text: `${sceneId} line ${index}`,
  }));

/** Drives many batches through the gate the way the store does, one per completed task. */
const run = (kind: SocialSceneKind, batches: number) => {
  let cadence = NEW_CADENCE;
  let spoken = 0;
  for (let task = 1; task <= batches; task += 1) {
    const result = scheduleChatter(scene(`s:${task}`, kind), cadence, task);
    cadence = result.cadence;
    spoken += result.entries.length;
  }
  return spoken;
};

describe('the guild does not repeat itself inside one panel', () => {
  /*
   * `recentTexts` was written into by the event branch and never read against it, so event scenes —
   * 47 to 58% of everything a player sees — could repeat freely. Measured on real play, six lines an
   * hour arrived while an identical line was still on screen, including two loot lines 69 seconds
   * apart with nothing said between them.
   *
   * Cheap to refuse: the same measurement puts the cost at about eight lines an hour out of 271.
   */
  const repeatedScene = (task: number) => scene('same', 'loot').map((entry) => ({ ...entry, sceneId: `s:${task}` }));

  it('declines an ordinary scene whose words are still on screen', () => {
    let cadence = NEW_CADENCE;
    let spoken = 0;
    for (let task = 1; task <= 200; task += 1) {
      const result = scheduleChatter(repeatedScene(task), cadence, task);
      cadence = result.cadence;
      spoken += result.entries.length;
    }
    // Heard once and then refused while it stays in the window. Not zero — the first airing is not
    // a repeat of anything.
    expect(spoken).toBeGreaterThan(0);
    expect(spoken).toBeLessThan(30);
  });

  it('still speaks a scene the channel may never silence, even in the same words', () => {
    // A level or an act closing is worth hearing however it is worded, which is the whole reason
    // `ALWAYS_HEARD` exists. Suppressing those as repeats would be the fix eating the exemption.
    let cadence = NEW_CADENCE;
    let spoken = 0;
    for (let task = 1; task <= 200; task += 1) {
      const result = scheduleChatter(
        scene('same', 'level').map((entry) => ({ ...entry, sceneId: `s:${task}` })),
        cadence,
        task,
      );
      cadence = result.cadence;
      spoken += result.entries.length;
    }
    expect(spoken).toBe(600);
  });
});

describe('how much the guild actually says', () => {
  it('cuts ordinary chatter by roughly an order of magnitude', () => {
    // 600 loot scenes of three lines each is 1800 lines ungated. Both bounds are asserted: too
    // little is as wrong as too much, and a gate that silenced everything would pass a one-sided
    // check while deleting the feature.
    const spoken = run('loot', 600);
    expect(spoken).toBeGreaterThan(40);
    expect(spoken).toBeLessThan(300);
  });

  it('never suppresses a level, a milestone, or the row that explains a drain', () => {
    // These bypass both gates. A silent level-up is the one suppression a player reads as a bug,
    // and silencing the catch-up row removes the explanation rather than the noise.
    expect(run('level', 200)).toBe(600);
    expect(run('milestone', 200)).toBe(600);
    expect(run('catch_up', 200)).toBe(600);
  });

  it('does not make a level wait behind the gap', () => {
    // Speaking, then immediately levelling, must not queue the level behind a drawn gap — it would
    // land after loot the player has stopped looking at.
    const first = scheduleChatter(scene('a', 'loot'), NEW_CADENCE, 100);
    const level = scheduleChatter(scene('b', 'level'), first.cadence, 100);
    expect(level.entries).toHaveLength(3);
  });

  it('lets a scene through whole or not at all', () => {
    // Half a three-line exchange is worse than none of it.
    let cadence = NEW_CADENCE;
    for (let task = 1; task <= 400; task += 1) {
      const result = scheduleChatter(scene(`s:${task}`, 'loot'), cadence, task);
      cadence = result.cadence;
      expect([0, 3]).toContain(result.entries.length);
    }
  });

  it('keeps a batch of mixed scenes coherent', () => {
    // A level arriving alongside loot must not drag the loot in with it, or the always-heard rule
    // becomes a way for suppressed scenes to ride along.
    const mixed = [...scene('loot-1', 'loot'), ...scene('level-1', 'level')];
    const result = scheduleChatter(mixed, { lastLineTasks: 500, recentTexts: [] }, 501);
    expect(result.entries.every(({ sceneKind }) => sceneKind === 'level')).toBe(true);
    expect(result.entries).toHaveLength(3);
  });

  it('says nothing, and changes nothing, when there is nothing to say', () => {
    const cadence = { lastLineTasks: 42, recentTexts: [] };
    const result = scheduleChatter([], cadence, 99);
    expect(result.entries).toHaveLength(0);
    // The gap must not advance on an empty batch, or a quiet stretch would reset the clock and the
    // next line would be delayed for no reason.
    expect(result.cadence).toBe(cadence);
  });
});

describe('what the guild says when the hero has done nothing', () => {
  // Varied per task, the way `projectAmbient` is. A fixture that offered one fixed string would be
  // refused by the recent-line memory after its first outing and measure that instead of cadence.
  const ambient = (task = 0) => scene(`amb:${task}`, 'ambient', 1).map((entry) => ({ ...entry, text: `ambient ${task}` }));

  it('fills a silence the event scenes left', () => {
    // The gate drops four ordinary scenes in five. Without ambient the feed can only ever be about
    // the hero, which is the property that made it read as a caption track.
    let cadence = NEW_CADENCE;
    let spoken = 0;
    for (let task = 1; task <= 400; task += 1) {
      const result = scheduleChatter(scene(`s:${task}`, 'loot'), cadence, task, () => ambient(task));
      cadence = result.cadence;
      spoken += result.entries.filter(({ sceneKind }) => sceneKind === 'ambient').length;
    }
    expect(spoken).toBeGreaterThan(20);
  });

  it('declines most free slots rather than filling every one', () => {
    // Filling every slot took the feed to six messages a minute with ambient seven lines in ten,
    // which is a caption track with a different subject.
    // Counted against the slots the gap actually offered, not against the loop length. A bound of
    // "fewer than half the iterations" passed even when ambient took every single free slot,
    // because the gap alone already limits it to roughly one in eight.
    let cadence = NEW_CADENCE;
    let offered = 0;
    let spoken = 0;
    for (let task = 1; task <= 600; task += 1) {
      if (readyToSpeak(task, cadence.lastLineTasks, `gap:${task}`)) offered += 1;
      const result = scheduleChatter([], cadence, task, () => ambient(task));
      cadence = result.cadence;
      spoken += result.entries.length;
    }
    expect(spoken).toBeGreaterThan(20);
    // The quiet is what makes the next line read as somebody arriving at a topic rather than a
    // timer firing, so a good share of offered slots must go unused.
    expect(spoken).toBeLessThan(offered * 0.75);
  });

  it('never speaks over an event that earned its line', () => {
    // Ambient fills silence; it does not compete. A level and a stray remark in the same breath
    // would bury the thing the player was waiting for.
    const result = scheduleChatter(scene('lvl', 'level'), { lastLineTasks: 0, recentTexts: [] }, 50, () => ambient());
    expect(result.entries.every(({ sceneKind }) => sceneKind === 'level')).toBe(true);
  });

  it('does not bypass the gap', () => {
    // Ambient is what fills the silence between lines, not a way around the rate limit.
    const first = scheduleChatter([], NEW_CADENCE, 100, () => ambient());
    // Asserted rather than returned past. The early return meant a regression where ambient stopped
    // speaking at all reported green while the feature this guards was dead — the sibling banks
    // assert their premise for exactly this reason.
    expect(first.entries.length, 'ambient has to speak at all before a gap can be bypassed').toBeGreaterThan(0);
    expect(scheduleChatter([], first.cadence, 100, () => ambient()).entries).toHaveLength(0);
  });
});

describe('what the guild has just said', () => {
  it('refuses an ambient line that is still on screen', () => {
    // Two lanes hold one string for a long stretch by design — a running bit keeps its beat for
    // forty tasks, and the trade advertisement is fixed per character. Both are right; neither
    // should arrive twice inside one unscrolled panel.
    const held = scene('bit', 'ambient', 1).map((entry) => ({ ...entry, text: 'Horse.' }));

    let cadence = NEW_CADENCE;
    let spoken = 0;
    for (let task = 1; task <= 400; task += 1) {
      const result = scheduleChatter([], cadence, task, () => held);
      cadence = result.cadence;
      spoken += result.entries.length;
    }
    // It gets said, once, and then not again while it is remembered.
    expect(spoken).toBe(1);
  });

  it('forgets far enough back that a held line can return', () => {
    // Memory, not a ban. A question re-asked minutes later is the form working; one re-asked four
    // lines later is the defect.
    let cadence = NEW_CADENCE;
    const held = scene('bit', 'ambient', 1).map((entry) => ({ ...entry, text: 'Horse.' }));
    // Driven until it actually speaks. A single call may be refused by the gap or by the decline
    // rate, and asserting against a slot that never fired would test nothing.
    for (let task = 1; task <= 400 && !cadence.recentTexts.includes('Horse.'); task += 1) {
      cadence = scheduleChatter([], cadence, task, () => held).cadence;
    }
    expect(cadence.recentTexts).toContain('Horse.');

    // Nine other lines go by, which is more than the window holds.
    for (let task = 2; task <= 400 && cadence.recentTexts.includes('Horse.'); task += 1) {
      cadence = scheduleChatter([], cadence, task, () => scene(`o:${task}`, 'ambient', 1).map((entry) => ({ ...entry, text: `other ${task}` }))).cadence;
    }
    expect(cadence.recentTexts).not.toContain('Horse.');
  });

  it('remembers event lines too, so an ambient line cannot echo one', () => {
    const result = scheduleChatter(scene('lvl', 'level', 2), NEW_CADENCE, 10);
    expect(result.cadence.recentTexts.length).toBe(2);
    // Newest first, so the panel order and the memory order agree.
    expect(result.cadence.recentTexts[0]).toBe(result.entries.at(-1)?.text);
  });

  it('keeps the memory short enough to be a window rather than a history', () => {
    let cadence = NEW_CADENCE;
    for (let task = 1; task <= 60; task += 1) {
      cadence = scheduleChatter(scene(`s:${task}`, 'level', 3), cadence, task).cadence;
    }
    expect(cadence.recentTexts.length).toBeLessThanOrEqual(8);
  });
});

