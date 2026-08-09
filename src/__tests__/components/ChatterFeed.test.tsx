// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatterFeed } from '../../components/ChatterFeed';
import type { SocialEntry, SocialChannel } from '../../state/socialProjection';
import { useGameStore } from '../../state/gameStore';

const originalState = useGameStore.getState();

const entry = (id: number, channel: SocialChannel, speaker: 'cast' | 'hero' = 'cast'): SocialEntry => ({
  id: `social:${id}:quest:0`,
  sceneId: `social:${id}:quest`,
  sceneKind: 'quest',
  sourceActivityId: id,
  channel,
  speaker: speaker === 'hero'
    ? { id: 'hero', kind: 'hero', displayName: 'Hero', role: 'Automatic hero reply', fictional: true, automaticHero: true }
    : { id: `cast-${id}`, kind: 'cast', displayName: `Cast ${id}`, role: 'Quest clerk', fictional: true, automaticHero: false },
  text: `Message ${id}`,
});

afterEach(() => {
  cleanup();
  useGameStore.setState(originalState, true);
});

describe('the empty channel says the right kind of empty', () => {
  /*
   * `socialEntries` is reset to `[]` on every load path while `log` is restored from the checkpoint,
   * and chatter is the default tab — so a returning player's first sight was an empty panel reading
   * "No fictional messages yet" beside a full activity log. "Yet" is a promise about something
   * arriving, and nothing said before the reload is going to.
   */
  it('says nothing has happened when nothing has', () => {
    useGameStore.setState({ socialEntries: [], progression: { ...originalState.progression, completedTasks: 0 } });
    render(<ChatterFeed />);

    expect(screen.getByText(/No fictional messages yet/)).toBeTruthy();
  });

  it('says the channel is not kept when the file plainly has a past', () => {
    // The state after any reload of a running save: tasks completed, no chatter restored.
    useGameStore.setState({ socialEntries: [], progression: { ...originalState.progression, completedTasks: 412 } });
    render(<ChatterFeed />);

    expect(screen.getByText(/not minuted between sessions/)).toBeTruthy();
    expect(screen.queryByText(/yet/)).toBeNull();
  });

  it('shows neither once the channel has anything in it', () => {
    useGameStore.setState({ socialEntries: [entry(1, 'guild')], progression: { ...originalState.progression, completedTasks: 412 } });
    render(<ChatterFeed />);

    expect(document.querySelector('.chatter-empty')).toBeNull();
    expect(screen.getByText('Message 1')).toBeTruthy();
  });
});

describe('simulated chatter accessibility', () => {
  it('is a quiet, explicitly fictional plain-text transcript', () => {
    useGameStore.setState({ socialEntries: [entry(3, 'hero', 'hero'), entry(2, 'world'), entry(1, 'guild')] });
    render(<ChatterFeed />);

    const panel = screen.getByRole('region', { name: 'Simulated chatter' });
    const messages = screen.getByRole('region', { name: 'Fictional chatter messages' });
    expect(panel.textContent).toContain('No people are online. Every message is fictional, generated locally, and sent nowhere.');
    expect(messages.getAttribute('aria-live')).toBe('off');
    expect(screen.queryByRole('status')).toBeNull();
    expect([...messages.querySelectorAll('[data-social-id]')].map(({ textContent }) => textContent?.includes('Message'))).toEqual([true, true, true]);
    expect(messages.querySelector('bdi[data-speaker-name][dir="auto"]')?.textContent).toBe('Cast 1');
    expect(screen.getByText('Automatic hero reply')).not.toBeNull();
  });

  it('blends every channel into one stream rather than showing one at a time', () => {
    // There used to be a channel dropdown. A chat window in this genre is a blend — the reader tells
    // the channels apart by the prefix, not by choosing one — and a filter that shows a single
    // channel turns the room back into the log this area was rebuilt to stop being.
    useGameStore.setState({ socialEntries: [entry(3, 'hero', 'hero'), entry(2, 'world'), entry(1, 'guild')] });
    render(<ChatterFeed />);

    expect(screen.getByText('Message 1')).not.toBeNull();
    expect(screen.getByText('Message 2')).not.toBeNull();
    expect(screen.getByText('Message 3')).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Chatter channel' })).toBeNull();
  });

  it('names the channel in text, not only in colour', () => {
    // Colour carries the convention — guild green, party blue, a whisper in magenta — but it is not
    // a distinction every reader can make, so the label is written out and the colour is carried on
    // an attribute the stylesheet reads.
    useGameStore.setState({ socialEntries: [entry(4, 'whisper'), entry(3, 'raid'), entry(2, 'party'), entry(1, 'guild')] });
    render(<ChatterFeed />);

    const messages = screen.getByRole('region', { name: 'Fictional chatter messages' });
    const prefixes = [...messages.querySelectorAll('.chatter-channel')];

    expect(prefixes.map(({ textContent }) => textContent)).toEqual(['[Guild]', '[Party]', '[Raid]', '[Whisper]']);
    expect(prefixes.map((node) => node.getAttribute('data-channel'))).toEqual(['guild', 'party', 'raid', 'whisper']);
  });

  it('has no mute control, and so cannot be left silently muted', () => {
    useGameStore.setState({ socialEntries: [entry(1, 'guild')] });
    render(<ChatterFeed />);

    expect(screen.queryByRole('button', { name: /mute/i })).toBeNull();
    expect(screen.getByText('Message 1')).not.toBeNull();
  });

  it('preserves a reader who scrolled back and offers an explicit jump', () => {
    useGameStore.setState({ socialEntries: [entry(1, 'guild')] });
    render(<ChatterFeed />);
    const messages = screen.getByRole('region', { name: 'Fictional chatter messages' });
    Object.defineProperties(messages, {
      scrollHeight: { configurable: true, value: 300 },
      clientHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });
    fireEvent.scroll(messages);

    act(() => useGameStore.setState({ socialEntries: [entry(2, 'world'), entry(1, 'guild')] }));

    expect(messages.scrollTop).toBe(40);
    const jump = screen.getByRole('button', { name: 'Jump to latest chatter' });
    fireEvent.click(jump);
    expect(messages.scrollTop).toBe(300);
    expect(document.activeElement).toBe(messages);
    expect(screen.queryByRole('button', { name: 'Jump to latest chatter' })).toBeNull();
  });

  it('auto-follows without stealing focus and ignores hidden scroll geometry', () => {
    useGameStore.setState({ socialEntries: [entry(1, 'guild')] });
    const { rerender } = render(<><button type="button">Outside chatter</button><ChatterFeed /></>);
    const outside = screen.getByRole('button', { name: 'Outside chatter' });
    const messages = screen.getByRole('region', { name: 'Fictional chatter messages' });
    Object.defineProperties(messages, {
      scrollHeight: { configurable: true, value: 300 },
      clientHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });
    fireEvent.scroll(messages);
    rerender(<><button type="button">Outside chatter</button><ChatterFeed active={false} /></>);
    messages.scrollTop = 200;
    fireEvent.scroll(messages);
    messages.scrollTop = 40;
    outside.focus();

    act(() => useGameStore.setState({ socialEntries: [entry(2, 'world'), entry(1, 'guild')] }));
    rerender(<><button type="button">Outside chatter</button><ChatterFeed active /></>);

    expect(messages.scrollTop).toBe(40);
    expect(screen.getByRole('button', { name: 'Jump to latest chatter' })).not.toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('follows the latest retained row when its hidden container becomes active', () => {
    useGameStore.setState({ socialEntries: [entry(2, 'world'), entry(1, 'guild')] });
    const { rerender } = render(<ChatterFeed active={false} />);
    const messages = screen.getByRole('region', { name: 'Fictional chatter messages' });
    Object.defineProperties(messages, {
      scrollHeight: { configurable: true, value: 300 },
      clientHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });

    rerender(<ChatterFeed active />);

    expect(messages.scrollTop).toBe(300);
  });

  it('clears a stale jump affordance when a session reset clears chatter', () => {
    useGameStore.setState({ socialEntries: [entry(1, 'guild')] });
    render(<ChatterFeed />);
    const messages = screen.getByRole('region', { name: 'Fictional chatter messages' });
    Object.defineProperties(messages, {
      scrollHeight: { configurable: true, value: 300 },
      clientHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });
    fireEvent.scroll(messages);
    expect(screen.getByRole('button', { name: 'Jump to latest chatter' })).not.toBeNull();

    act(() => useGameStore.setState({ socialEntries: [] }));

    expect(screen.queryByRole('button', { name: 'Jump to latest chatter' })).toBeNull();
  });
});
