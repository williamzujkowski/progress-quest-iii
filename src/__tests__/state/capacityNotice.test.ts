import { describe, expect, it } from 'vitest';
import { projectSocialBatch } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * `task_started` carries `reason.{carriedCubits, capacityCubits}` — the two figures the engine
 * actually compared when it decided to break off and sell. The activity log captions them; no chat
 * line has ever read them, on what is the most frequent boundary in the game.
 *
 * The joke is the attribution rather than the arithmetic: the hero is not going to town because
 * anybody decided to, they are going because a shelf filled up.
 */

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
  act: 3,
  completedTask: 'kill',
  nextTask: 'heading_to_market',
  completedTasks: 200,
  elapsedSeconds: 4000,
  ...overrides,
});

const marketTrip = (activityId: number, reason?: { carriedCubits: number; capacityCubits: number }): IdentifiedGameTransitionRecord => ({
  activityId,
  record: {
    event: {
      type: 'task_started',
      task: { description: 'Heading to market to sell loot...', durationMs: 4000, elapsedMs: 0, type: 'heading_to_market' },
      ...(reason === undefined ? {} : { reason }),
    } as GameTransitionEvent,
    post: snapshot({ completedTasks: activityId }),
  },
});

const textsFor = (activityId: number, reason?: { carriedCubits: number; capacityCubits: number }) =>
  projectSocialBatch([marketTrip(activityId, reason)]).map(({ text }) => text);

describe('the shelf that sent the hero to market', () => {
  it('quotes the two figures the engine actually compared', () => {
    const said = textsFor(400, { carriedCubits: 19, capacityCubits: 19 }).join(' ');

    expect(said).toContain('19');
    expect(said.toLowerCase()).toContain('cubits');
  });

  it('reports the figures the engine gave, not any of its own', () => {
    // Interpolated, never recomputed. A line that derived its own capacity would disagree with the
    // engine the moment the padding slot or a stat moved it, which is the failure the loadout filing
    // exists to prevent.
    for (const [carried, capacity] of [[19, 19], [7, 7], [143, 140]] as const) {
      const said = textsFor(500 + carried, { carriedCubits: carried, capacityCubits: capacity }).join(' ');
      expect(said, `${carried}/${capacity}`).toContain(String(carried));
      expect(said, `${carried}/${capacity}`).toContain(String(capacity));
    }
  });

  it('draws on more than one way of saying it', () => {
    // The market trip is the most frequent boundary in the game, so a single line would wear out
    // faster than anything else in the feed.
    const openings = new Set<string>();
    for (let task = 0; task < 60; task += 1) {
      const first = textsFor(600 + task, { carriedCubits: 19, capacityCubits: 19 })[0];
      if (first !== undefined) openings.add(first.replace(/\d+/g, '#'));
    }

    // All three, not merely more than one: collapsing two variants into the same sentence left a
    // third differing and passed a `> 1` check comfortably.
    expect(openings.size).toBeGreaterThanOrEqual(3);
  });

  it('says nothing when the engine gave no reason', () => {
    // A market trip can start without the capacity branch having fired — the hero leaves town when
    // the inventory empties. Asserting a shelf did it would be inventing the cause.
    const said = textsFor(700).join(' ').toLowerCase();

    expect(said).not.toContain('cubits');
    expect(said).not.toContain('capacity reached');
  });

  it('still says something, rather than falling silent', () => {
    // The zone scene has to keep producing a line either way, or the lane quietly lowers the rate
    // the cadence was tuned to.
    expect(textsFor(800).length).toBeGreaterThan(0);
    expect(textsFor(800, { carriedCubits: 19, capacityCubits: 19 }).length).toBeGreaterThan(0);
  });
});
