import { describe, expect, it } from 'vitest';
import { projectSocialBatch } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * A completion, said as one.
 *
 * `quest_started` and `quest_completed` shared a bank, and the only thing that differed was a
 * participle. Everything after the first clause was written for a departure and spoken at a return:
 * *"Route confidence is high"* about a route already walked, *"I have marked every uncertain
 * direction as scenic"* at the point there is nothing left to mark, and a hero replying *"Proceed
 * until the objective becomes retrospectively obvious"* to an objective that has stopped.
 *
 * Worse than bland, and worse than it looks. `SCENE_LENGTHS` renders a quest scene as one line five
 * times in nine, so the opening carries the scene — and the opening was the clause that differed by
 * that single word.
 */

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
  act: 3,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 200,
  elapsedSeconds: 9000,
  ...overrides,
});

const scene = (activityId: number, type: 'quest_started' | 'quest_completed', post = snapshot()) =>
  projectSocialBatch([{
    activityId,
    record: { event: { type, description: 'Exterminate the Nits' } as GameTransitionEvent, post },
  } as IdentifiedGameTransitionRecord]);

/** Every variant, across enough draws that the hash cannot hide one. */
const everyLine = (type: 'quest_started' | 'quest_completed', post = snapshot()) =>
  Array.from({ length: 40 }, (_unused, index) => scene(index * 3, type, { ...post, completedTasks: 200 + index * 7 })).flat();

describe('a completed assignment is described as having ended', () => {
  it('never tells the hero to proceed at the moment the thing has stopped', () => {
    // The line that made this a defect rather than a flatness. It is a start instruction, and it was
    // spoken at a finish because the bank could not tell which event it was describing.
    for (const { text } of everyLine('quest_completed')) {
      expect(text, text).not.toContain('Proceed until the objective becomes retrospectively obvious');
      expect(text, text).not.toMatch(/Route confidence is high|marked every uncertain direction/);
    }
  });

  it('does not read as a departure', () => {
    // Checked as a shape rather than against the three lines that happened to be wrong: a completion
    // scene must not talk about a route as something still ahead.
    for (const { text } of everyLine('quest_completed')) {
      expect(text, text).not.toMatch(/\bProceed\b|\bcommence\b|\bset out\b|\bawait(?:s|ing)? (?:instruction|departure)\b/i);
    }
  });

  it('leaves the start scene alone, which was correct for a start', () => {
    const started = everyLine('quest_started').map(({ text }) => text);
    expect(started.some((text) => text.includes('Proceed until the objective becomes retrospectively obvious'))).toBe(true);
    expect(started.some((text) => text.includes('approved'))).toBe(true);
    // And the two banks must no longer be the same text with one word swapped.
    const completed = new Set(everyLine('quest_completed').map(({ text }) => text.replace(/completed/g, 'X')));
    const opened = new Set(started.map((text) => text.replace(/approved/g, 'X')));
    for (const text of completed) expect(opened.has(text), `both banks say: ${text}`).toBe(false);
  });

  it('names a certification the completion conferred, which reached only a world notice', () => {
    // `spellRewards` carries quest awards as well as promotion ones. The level scene closed exactly
    // this gap for `source: 'level'`; the quest half was still going nowhere.
    const post = snapshot({ spellRewards: [{ name: 'Cone of Boilerplate', level: 2, source: 'quest' }] });
    const spoken = everyLine('quest_completed', post).map(({ text }) => text);

    expect(spoken.some((text) => text.includes('Cone of Boilerplate'))).toBe(true);
    // Every variant of the branch names it, so the reading does not depend on the draw.
    for (let index = 0; index < 12; index += 1) {
      const lines = scene(index * 5, 'quest_completed', { ...post, completedTasks: 300 + index * 11 });
      expect(lines.map(({ text }) => text).join(' '), `draw ${index}`).toContain('Cone of Boilerplate');
    }
  });

  it('ignores a certification the promotion conferred, not this assignment', () => {
    // The same discipline the level scene keeps in the other direction: `spellRewards` carries both
    // sources, and claiming a promotion's award as a quest's would be inventing a fact.
    const post = snapshot({ spellRewards: [{ name: 'Summon a Stakeholder', level: 1, source: 'level' }] });
    for (const { text } of everyLine('quest_completed', post)) {
      expect(text, text).not.toContain('Summon a Stakeholder');
    }
  });
});
