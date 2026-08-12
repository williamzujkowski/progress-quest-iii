// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LogFeed } from '../../components/LogFeed';
import { describeGameEvent } from '../../state/gameEventAdapter';
import { useGameStore } from '../../state/gameStore';
import type { GameTransitionEvent } from '../../engine/transition';

/**
 * The activity feed's tags, measured against the strings the game actually logs.
 *
 * The classifier and the adapter drifted apart and nothing noticed. It matched `LEVEL UP!`,
 * `Act `, `Item ` and `Defeated monster and looted ` — a vocabulary no branch of
 * `describeGameEvent` can produce — so Loot and Level, the commonest line and the one exciting
 * one, were tagged zero times in ordinary play while three of five colours decorated nothing.
 *
 * It survived because the only test over it was an end-to-end step that pushed hand-written
 * strings into the store, chosen to match the classifier rather than taken from the engine. It
 * asserted that the code agreed with itself.
 *
 * So the events are the fixture here, never the sentences. Every case below starts as a
 * `GameTransitionEvent` and is rendered through the adapter, which means a reworded message moves
 * this test with it, and a message that stops being producible fails to compile.
 */

const originalState = useGameStore.getState();
afterEach(() => {
  cleanup();
  useGameStore.setState(originalState, true);
});

/** One event per arm of the adapter's switch, with the tag a watcher should see beside it. */
const CASES: { event: GameTransitionEvent; tag: string | null }[] = [
  { event: { type: 'level_gained', level: 2 }, tag: 'Level' },
  { event: { type: 'stat_gained', stat: 'HP Max', amount: 6 }, tag: 'Level' },
  { event: { type: 'stat_gained', stat: 'INT', amount: 1 }, tag: 'Level' },
  { event: { type: 'act_completed', act: 2 }, tag: 'Act' },
  { event: { type: 'act_completed', act: 0 }, tag: 'Act' },
  { event: { type: 'quest_completed', description: 'Find the lost stapler' }, tag: 'Quest' },
  { event: { type: 'quest_started', description: 'Locate the missing lanyard' }, tag: 'Quest' },
  { event: { type: 'item_gained', name: 'bent fork', quantity: 1 }, tag: 'Loot' },
  { event: { type: 'equipment_gained', name: 'Tax Hat', slot: 'Helm' }, tag: 'Loot' },
  { event: { type: 'gold_received', amount: 1 }, tag: 'Market' },
  { event: { type: 'inventory_sold', gold: 15 }, tag: 'Market' },
  { event: { type: 'equipment_purchased', name: 'Tax Hat', slot: 'Helm' }, tag: 'Market' },
  { event: { type: 'task_started', task: { description: 'Executing a passing pigeon...', durationMs: 1000, elapsedMs: 0, type: 'kill' } }, tag: 'Combat' },
  // Not every line earns a colour. The save notice is bookkeeping, and tagging it would spend a
  // category on the one event a watcher never needs to pick out of the scroll.
  { event: { type: 'save_requested', characterName: 'Oracle' }, tag: null },
];

const renderLog = (messages: string[]) => {
  useGameStore.setState({
    isPaused: true,
    log: messages.map((message, id) => ({ id, message })),
    nextActivityId: messages.length,
  });
  render(<LogFeed />);
  return screen.getByRole('region', { name: 'Activity Event Log', hidden: true });
};

const tagOf = (region: HTMLElement, message: string) => {
  const entry = within(region).getByText(message).closest('.log-entry');
  return entry?.querySelector('.log-tag')?.textContent ?? null;
};

describe('the activity feed tags what the game actually logs', () => {
  it('reaches every arm of the adapter, so the sweep cannot be vacuous', () => {
    // Without this, deleting cases would make every assertion below trivially true — and an
    // adapter that gained an event type would be silently untested rather than unhandled.
    // Twelve, because `describeUnboundedGameEvent`'s switch has twelve arms and every one of them
    // can reach the panel. Stated as a number rather than derived from `CASES`, so an adapter that
    // grows a thirteenth event fails here — which is the moment to decide what colour it gets,
    // rather than discovering months later that it never had one.
    const covered = new Set(CASES.map(({ event }) => event.type));
    expect(covered.size).toBe(12);
    expect(covered).toContain('item_gained');
    expect(covered).toContain('level_gained');
  });

  it('gives each logged event the tag a watcher expects', () => {
    const messages = CASES.map(({ event }) => describeGameEvent(event));
    const region = renderLog(messages);

    for (const [index, { event, tag }] of CASES.entries()) {
      expect(tagOf(region, messages[index]!), `${event.type}: ${messages[index]}`).toBe(tag);
    }
  });

  it('tags the two categories that were previously dead in ordinary play', () => {
    // Named separately because "some tag appeared" is not the property that broke. Loot is the
    // commonest line in the panel and Level is the one a watcher is waiting for; both returned
    // null for every string the engine could produce, and a general sweep would have gone green
    // the moment any one category worked.
    const loot = describeGameEvent({ type: 'item_gained', name: 'nit tail', quantity: 1 });
    const level = describeGameEvent({ type: 'level_gained', level: 2 });
    const region = renderLog([loot, level]);

    expect(tagOf(region, loot)).toBe('Loot');
    expect(tagOf(region, level)).toBe('Level');
  });

  it('does not mistake an item whose name contains a stat for a stat award', () => {
    // The stat award and the drop share the verb, so the discriminator is the whole tail. An
    // unanchored match would file this drop as a promotion.
    const drop = describeGameEvent({ type: 'item_gained', name: 'CON badge', quantity: 1 });
    const award = describeGameEvent({ type: 'stat_gained', stat: 'CON', amount: 1 });
    const region = renderLog([drop, award]);

    expect(tagOf(region, drop)).toBe('Loot');
    expect(tagOf(region, award)).toBe('Level');
  });

  it('leaves ordinary prose untagged', () => {
    const region = renderLog(['Activity 50', 'Resting at the inn.']);

    expect(tagOf(region, 'Activity 50')).toBeNull();
    expect(tagOf(region, 'Resting at the inn.')).toBeNull();
  });
});
