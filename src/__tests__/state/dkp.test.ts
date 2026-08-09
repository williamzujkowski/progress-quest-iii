import { describe, expect, it, vi } from 'vitest';
import { DKP_ALLOCATION, DKP_STANDINGS } from '../../data/socialDkp';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';
import { projectSocialBatch } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * DKP was a spreadsheet with a bidding process attached — a guild bureaucracy invented to allocate
 * loot fairly and weaponised within a week. The running joke is that the hero is always just below
 * the cutoff: they attend everything, are awarded nothing, and the ledger is scrupulously fair
 * about it.
 */

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 40 },
  act: 12,
  completedTask: 'cinematic',
  nextTask: 'cinematic',
  completedTasks: 900,
  elapsedSeconds: 90_000,
  ...overrides,
});

const source = (activityId: number, event: GameTransitionEvent, post: GamePresentationSnapshot): IdentifiedGameTransitionRecord =>
  ({ activityId, record: { event, post } });

/** The boss framing opening — a `nemesis` cinematic starting. */
const bossOpens = (activityId: number, completedTasks: number) => projectSocialBatch([source(
  activityId,
  { type: 'task_started', task: { description: 'Locked in grim combat', durationMs: 2000, elapsedMs: 0, type: 'cinematic' } },
  snapshot({ completedTasks, interplotRole: 'nemesis' }),
)]);

/** The act closing behind it. */
const actCloses = (activityId: number, completedTasks: number) =>
  projectSocialBatch([source(activityId, { type: 'act_completed', act: 12 }, snapshot({ completedTasks }))]);

const seatOf = (speakerId: string) => SOCIAL_PERSONAS.find(({ id }) => id === speakerId)?.seat;

describe('what the guild says about the ledger', () => {
  it('talks standings when the boss opens, and allocation when the act closes', () => {
    // Two banks rather than one. Saying the wrong one at the wrong moment is the joke backwards:
    // allocation before the boss, or attendance after the loot has gone.
    for (let task = 0; task < 40; task += 1) {
      const opening = bossOpens(100 + task, task).map(({ text }) => text);
      const closing = actCloses(200 + task, task).map(({ text }) => text);

      expect(opening.some((text) => DKP_STANDINGS.includes(text)), `open ${task}`).toBe(true);
      expect(opening.some((text) => DKP_ALLOCATION.includes(text)), `open ${task}`).toBe(false);
      expect(closing.some((text) => DKP_ALLOCATION.includes(text)), `close ${task}`).toBe(true);
      expect(closing.some((text) => DKP_STANDINGS.includes(text)), `close ${task}`).toBe(false);
    }
  });

  it('says it on the guild channel, because that is where a ledger lives', () => {
    for (let task = 0; task < 20; task += 1) {
      const ledger = bossOpens(300 + task, task).find(({ text }) => DKP_STANDINGS.includes(text));
      expect(ledger?.channel, `task ${task}`).toBe('guild');
      expect(seatOf(ledger!.speaker.id)).toBe('logistics');
    }
  });

  it('draws on the whole bank rather than one line', () => {
    const said = new Set<string>();
    for (let task = 0; task < 80; task += 1) {
      for (const { text } of bossOpens(400 + task, task)) if (DKP_STANDINGS.includes(text)) said.add(text);
      for (const { text } of actCloses(500 + task, task)) if (DKP_ALLOCATION.includes(text)) said.add(text);
    }

    expect(said.size).toBeGreaterThan(4);
  });

  it('never states a number the player could try to improve', () => {
    // The anti-pattern this has to avoid. The player cannot act, so a standing that reads as
    // pursuable turns the joke into a spreadsheet they are forbidden to fill in. The lines describe
    // a process; the only figures in them are jokes about bidding, not the hero's own total.
    for (const text of [...DKP_STANDINGS, ...DKP_ALLOCATION]) {
      expect(text, text).not.toMatch(/\byour\b|\byou\b/i);
      expect(text, text).not.toMatch(/\b(?:total|score|rank(?:ing)?|balance)\b/i);
    }
  });

  it('sets the thesis up as often as it pays it off', () => {
    // The bit this module's docstring calls "this project's thesis in one bit" — the hero attends
    // everything, is awarded nothing, and the ledger is scrupulously fair about it. Twelve lines
    // shipped and exactly one said it, all of it in the allocation bank, so a watcher met the
    // punchline before the premise and then never met it again.
    //
    // Counted in both banks rather than overall, because the setup has to reach the *standings* —
    // the beat spoken when the boss opens — for the allocation to land as a payoff rather than as
    // the first mention.
    const mentions = (bank: readonly string[]) =>
      bank.filter((text) => /\bcutoff\b|\bsecond\b/i.test(text)).length;

    expect(mentions(DKP_STANDINGS), 'the standings must set the cutoff up').toBeGreaterThan(1);
    expect(mentions(DKP_ALLOCATION), 'and the allocation must pay it off').toBeGreaterThan(1);
  });

  it('keeps the hero below the cutoff, never above it', () => {
    const hopeful = [...DKP_ALLOCATION, ...DKP_STANDINGS]
      .filter((text) => /hero/i.test(text))
      .filter((text) => /\bwon\b|\bawarded the\b|\bfirst\b/i.test(text));

    expect(hopeful).toEqual([]);
  });

  it('is heard whole, like the promotion it sits beside', () => {
    // `ALWAYS_HEARD` lists `milestone` alongside `level`: a scene the channel may never silence is a
    // scene worth hearing out. Without the exemption the ledger line is cut five times in nine.
    for (let task = 0; task < 30; task += 1) {
      expect(bossOpens(600 + task, task).length, `task ${task}`).toBe(3);
      expect(actCloses(700 + task, task).length, `task ${task}`).toBe(3);
    }
  });

  it('says the same thing on every replay of the same milestone', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Date.now'); });
    try {
      for (let task = 0; task < 20; task += 1) {
        expect(JSON.stringify(bossOpens(800 + task, task))).toBe(JSON.stringify(bossOpens(800 + task, task)));
      }
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });
});
