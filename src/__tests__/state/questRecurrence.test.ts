import { describe, expect, it } from 'vitest';
import { recurringAssignments } from '../../state/questRecurrence';
import { projectSocialBatch } from '../../state/socialProjection';
import { advanceGame, type GameTransitionEvent, type GamePresentationSnapshot } from '../../engine/transition';
import { createNewCharacter } from '../../engine/sim';
import { levelUpTime } from '../../engine/math';
import { RandomGenerator } from '../../engine/prng';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * The assignment the institution has issued before.
 *
 * A durable event history was costed at 95.3 MB and rejected. This asks a smaller question
 * — not *when*, only *again* — which `Quest.history` has answered since the first schema and nothing
 * has ever read.
 */

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
  act: 3,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 200,
  elapsedSeconds: 4000,
  ...overrides,
});

const started = (activityId: number, description: string): IdentifiedGameTransitionRecord => ({
  activityId,
  record: { event: { type: 'quest_started', description } as GameTransitionEvent, post: snapshot({ completedTasks: activityId }) },
});

const completed = (activityId: number, description: string): IdentifiedGameTransitionRecord => ({
  activityId,
  record: { event: { type: 'quest_completed', description } as GameTransitionEvent, post: snapshot({ completedTasks: activityId }) },
});

describe('reading the assignment ring', () => {
  it('reports an assignment issued before, and stays quiet about a first', () => {
    expect(recurringAssignments([started(1, 'Fetch nine bolts')], ['Fetch nine bolts', 'Placate a duke', 'Fetch nine bolts'])).toEqual(new Set([1]));
    expect(recurringAssignments([started(1, 'Fetch nine bolts')], ['Placate a duke', 'Fetch nine bolts'])).toEqual(new Set());
  });

  it('counts as of the moment, not as of the end of the batch', () => {
    // The whole reason this is not `history.includes`. A drain carries several assignments and the
    // sheet handed over is the one from after all of them, so a genuinely-first assignment sits in a
    // history that a *later* one in the same batch duplicated. Reporting it would be a claim about
    // the past made from the future.
    const batch = [started(1, 'Fetch nine bolts'), started(2, 'Fetch nine bolts')];
    const history = ['Placate a duke', 'Fetch nine bolts', 'Fetch nine bolts'];

    expect(recurringAssignments(batch, history)).toEqual(new Set([2]));
  });

  it('says nothing when the ring does not line up with the events', () => {
    // A save from before the ring existed, an import, a batch whose events and sheet came from
    // different ticks. A callback that fires on a mismatch is a story about a quest the hero never
    // had, so the alignment is checked rather than assumed.
    // The ring has to end on the assignment that just started, because that is what the arithmetic
    // above assumes. This case is the one that discriminates: two prior copies are in the history,
    // so a version without the guard reports a reissue — off a history that plainly belongs to some
    // other tick, since the assignment in hand is not the last thing pushed.
    expect(recurringAssignments([started(1, 'Fetch nine bolts')], ['Fetch nine bolts', 'Fetch nine bolts', 'Placate a duke'])).toEqual(new Set());
    expect(recurringAssignments([started(1, 'Fetch nine bolts')], ['Fetch nine bolts', 'Placate a duke'])).toEqual(new Set());
    expect(recurringAssignments([started(1, 'Fetch nine bolts')], undefined)).toEqual(new Set());
    expect(recurringAssignments([started(1, 'Fetch nine bolts')], [])).toEqual(new Set());
  });

  it('has nothing to say about events that are not assignments starting', () => {
    expect(recurringAssignments([completed(1, 'Fetch nine bolts')], ['Fetch nine bolts', 'Fetch nine bolts'])).toEqual(new Set());
  });
});

describe('the reissue reaches the feed', () => {
  const history = ['Fetch nine bolts', 'Placate a duke', 'Fetch nine bolts'];

  it('speaks over the completion it shares a task with', () => {
    // A completion and the next start are pushed by the same task, so they share an envelope and
    // only one scene survives it. Before the priority moved, the completion took every one — which
    // would have left this feature projecting nothing at all while every test on the line bank
    // passed. Asserted through the real envelope rather than on a lone start event.
    const said = projectSocialBatch([completed(7, 'Placate a duke'), started(7, 'Fetch nine bolts')], history)
      .map(({ text }) => text).join(' ');

    expect(said.toLowerCase()).toMatch(/issued before|reissue|duplicate/);
  });

  it('leaves an ordinary assignment exactly as it was', () => {
    // The feature is additive or it is a rewrite of every quest scene in the game. A first-time
    // assignment must project the bytes it always did, history or no history.
    const envelope = [completed(7, 'Placate a duke'), started(7, 'Ransack a wing')];

    expect(projectSocialBatch(envelope, history)).toEqual(projectSocialBatch(envelope));
  });

  it('never says when, because the ring does not know when', () => {
    // A hundred assignments is the whole memory, and one issued a hundred and one back reads as new.
    // An interval, a date or a count would be claiming a memory the game does not have — that is
    // what the dated register in epic C is for, and it is not built.
    //
    // "Last time" survives this deliberately, and the distinction is the point rather than a
    // loophole: the ring does know a previous occasion existed, so naming one is supportable. What
    // it cannot support is *how long* ago, or *which act*. The first draft of the bank said "to the
    // same effect as last time" and this assertion flagged it under a wider rule — the rule was
    // wrong, not the line, and narrowing it is only honest because the ban on figures below is what
    // was actually load-bearing.
    for (let activityId = 0; activityId < 60; activityId += 1) {
      const said = projectSocialBatch([started(activityId, 'Fetch nine bolts')], history).map(({ text }) => text).join(' ');
      expect(said, said).not.toMatch(/\d/);
      expect(said.toLowerCase(), said).not.toMatch(/\bago\b|\bact\b|\bhours?\b|\bdays?\b|\bweeks?\b|\bmonths?\b|\byears?\b|\bearlier this\b/);
    }
  });

  it('draws on more than one way of saying it', () => {
    const openings = new Set<string>();
    for (let activityId = 0; activityId < 60; activityId += 1) {
      const first = projectSocialBatch([started(activityId, 'Fetch nine bolts')], history)[0];
      if (first !== undefined) openings.add(first.text);
    }

    expect(openings.size).toBeGreaterThanOrEqual(3);
  });
});

describe('what the engine actually produces', () => {
  it('reissues often enough to be a callback and rarely enough to stay one', () => {
    // Measured rather than assumed. The backlog states 76.4%, which would make the callback the
    // ordinary register for a quest rather than an occasional one. Driving the real engine gives
    // about one in five, which is the figure the priority bump above is justified against — so the
    // claim is pinned here rather than left in an issue body.
    const rng = new RandomGenerator('recurrence-measure');
    let state = {
      character: createNewCharacter('Meas', 'Double Tenant', 'Incident Paladin', 'measure-seed'),
      progression: { experience: { currentSeconds: 0, maxSeconds: levelUpTime(1) }, completedTasks: 0, elapsedSeconds: 0 },
    };
    let starts = 0;
    let reissues = 0;

    for (let tick = 0; tick < 20_000; tick += 1) {
      const result = advanceGame(state, 3000, rng);
      state = result.state;
      const sources = result.records.map((record, index) => ({ activityId: index, record }));
      const recurring = recurringAssignments(sources, result.state.character.Quest.history);
      starts += sources.filter(({ record }) => record.event.type === 'quest_started').length;
      reissues += recurring.size;
    }

    expect(starts, 'the run has to actually issue assignments').toBeGreaterThan(100);
    const rate = reissues / starts;
    expect(rate, `measured ${(rate * 100).toFixed(1)}%`).toBeGreaterThan(0.05);
    expect(rate, `measured ${(rate * 100).toFixed(1)}%`).toBeLessThan(0.5);
  }, 30_000);
});
