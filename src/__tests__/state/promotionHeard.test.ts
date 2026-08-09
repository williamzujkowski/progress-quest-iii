import { describe, expect, it, vi } from 'vitest';
import { GRATS } from '../../data/socialGrats';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';
import { projectSocialBatch } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * A promotion used to render as a single line most of the time.
 *
 * `linesFor` wrote three, but `spokenLines` drew every scene's length from `[1,1,1,1,1,2,2,2,3]`, so
 * five times in nine a level was an announcement with nobody answering it. The middle line, when it
 * did survive, was a fixed remark from `support` — one per variant, three sentences covering every
 * promotion a save would ever see — and `logistics` and `field` never spoke at a level at all.
 */

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 7 },
  act: 2,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 42,
  elapsedSeconds: 3671,
  activeQuest: { kind: 'exterminate', target: 'Nit|1|tail', targetIndex: 0 },
  ...overrides,
});

const source = (activityId: number, event: GameTransitionEvent, post = snapshot()): IdentifiedGameTransitionRecord =>
  ({ activityId, record: { event, post } });

const promotion = (activityId: number, completedTasks: number) =>
  projectSocialBatch([source(activityId, { type: 'level_gained', level: 7 }, snapshot({ completedTasks }))]);

const seatOf = (speakerId: string) => SOCIAL_PERSONAS.find(({ id }) => id === speakerId)?.seat;
const ALL_GRATS = Object.values(GRATS).flat();

describe('a promotion is heard whole', () => {
  it('always speaks all three of its lines', () => {
    // Every other scene draws its length. This one does not, because a level is rare and is the one
    // moment a room reacts to rather than narrates.
    for (let task = 0; task < 40; task += 1) {
      expect(promotion(100 + task, task).length, `task ${task}`).toBe(3);
    }
  });

  it('stays inside the bound every other scene is held to', () => {
    // The exemption lengthens nothing. An earlier attempt at this added a congratulations cascade on
    // top and pushed promotions to five and six lines, which broke three assertions elsewhere that
    // pin one completed task to one bounded scene. Three was always what the scene was written as.
    for (let task = 0; task < 40; task += 1) {
      expect(promotion(200 + task, task).length).toBeLessThanOrEqual(3);
    }
  });

  it('is still one scene for one completed task', () => {
    const entries = promotion(300, 5);
    expect(new Set(entries.map(({ sceneId }) => sceneId)).size).toBe(1);
  });
});

describe('who answers a promotion', () => {
  it('brings in the two seats that never spoke at a level', () => {
    // `logistics` and `field` had no line in any promotion variant. Measured across many promotions,
    // because the seat is drawn by hash and one scene proves only that one combination exists.
    const seats = new Set<string | undefined>();
    for (let task = 0; task < 60; task += 1) {
      for (const entry of promotion(400 + task, task)) {
        if (entry.speaker.kind === 'cast') seats.add(seatOf(entry.speaker.id));
      }
    }

    expect(seats).toContain('logistics');
    expect(seats).toContain('field');
    expect(seats).toContain('support');
    expect(seats).toContain('official');
  });

  it('answers with more than the three sentences it used to have', () => {
    const answers = new Set<string>();
    for (let task = 0; task < 60; task += 1) {
      for (const { text } of promotion(500 + task, task)) if (ALL_GRATS.includes(text)) answers.add(text);
    }

    expect(answers.size).toBeGreaterThan(3);
  });

  it('answers between the announcement and the hero, never after', () => {
    // Order is the beat. A congratulation after the hero has already replied is a different joke and
    // this is not the place for it.
    for (let task = 0; task < 60; task += 1) {
      const entries = promotion(600 + task, task);
      const heroAt = entries.findIndex(({ speaker }) => speaker.automaticHero);
      const grats = entries.findIndex(({ text }) => ALL_GRATS.includes(text));

      expect(grats, `task ${task}`).toBeGreaterThan(0);
      expect(heroAt, `task ${task}`).toBeGreaterThan(grats);
    }
  });

  it('says the same thing on every replay of the same promotion', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Date.now'); });
    try {
      for (let task = 0; task < 20; task += 1) {
        expect(JSON.stringify(promotion(700 + task, task))).toBe(JSON.stringify(promotion(700 + task, task)));
      }
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });

  it('keeps the announcement carrying the level the hero reached', () => {
    // The opening line carries the interpolated fact. Five existing tests assert a typed fact
    // survives its scene, and this scene must not become the exception.
    for (let task = 0; task < 20; task += 1) {
      // Case-insensitive: one of the three variants opens "Level 7 is official", the others put it
      // mid-sentence in lower case. Matching one spelling asserted the variant rather than the fact.
      expect(promotion(800 + task, task).some(({ text }) => /level 7/i.test(text)), `task ${task}`).toBe(true);
    }
  });
});
