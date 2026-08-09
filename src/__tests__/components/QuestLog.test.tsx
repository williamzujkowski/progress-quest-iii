// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QuestLog } from '../../components/QuestLog';
import { createNewCharacter } from '../../engine/sim';
import { QUEST_TARGET_PROGRESS } from '../../engine/transition';
import { useGameStore } from '../../state/gameStore';
import type { CharacterSheet } from '../../engine/types';

afterEach(cleanup);

/**
 * The three bars in this panel, read as a watcher reads them.
 *
 * Two of them are denominated in seconds of task time and said so nowhere, beside a quest
 * description reading *Exterminate the Gnolls* — so `37 / 112` invited a count, and the game then
 * contradicted it twice over: a rat advances the same track, and the named target advances it by
 * three. The quantity was not merely unlabelled, it was misreadable in a way the watcher would
 * eventually notice.
 *
 * And the multiplier itself was invisible. `transition.ts` states the goal outright — the effect
 * "has to be attributable by a player who never acts" — and no surface named it, while the loadout
 * multiplier twenty lines away is cited, quantified and given a counterfactual in seconds.
 */

const showing = (overrides: (character: CharacterSheet) => CharacterSheet = (character) => character) => {
  const character = createNewCharacter('Clerk', 'Half Daemon', 'Robot Monk', 900);
  useGameStore.setState({ character: overrides(character) });
  render(<QuestLog />);
};

const engaged = (character: CharacterSheet): CharacterSheet =>
  ({ ...character, Task: { ...character.Task, type: 'kill', questTarget: true } });

describe('the quest panel says what its bars are counting', () => {
  it('marks both second-denominated ratios with the unit, and leaves the percentage alone', () => {
    showing((character) => ({
      ...character,
      Quest: { ...character.Quest, currentProgress: 37, maxProgress: 112 },
      Plot: { ...character.Plot, currentProgress: 1240, maxProgress: 21600 },
    }));

    // The figures are unchanged and now carry a noun. Located through the labelled rows rather than
    // by text search, so a unit rendered somewhere unrelated could not satisfy this.
    const quest = screen.getByRole('progressbar', { name: 'Current quest progress' });
    const plot = screen.getByRole('progressbar', { name: 'Plot act progress' });

    expect(quest.parentElement?.textContent).toContain('37 / 112 s');
    // Ungrouped, which is `formatGameNumber`'s doing and not this panel's — the unit is the change.
    expect(plot.parentElement?.textContent).toContain('1240 / 21600 s');
    // The task bar is a genuine percentage and must not acquire a unit it does not have. Checked
    // structurally: its description is prose and would match any letter searched for in its text.
    const task = screen.getByRole('progressbar', { name: 'Current task progress' });
    expect(task.parentElement?.querySelector('.stat-unit')).toBeNull();
    expect(quest.parentElement?.querySelectorAll('.stat-unit')).toHaveLength(1);
  });

  it('reports whole seconds, because the tracks accumulate fractional ones', () => {
    // `progressDelta` is `task.durationMs / 1000`, so a live save carries values like 41.92 against
    // an integer maximum. Two decimal places asserted hundredth-of-a-second accuracy about a running
    // sum of task durations, and changed on every tick — the two quietest readings in the panel were
    // the noisiest things on screen.
    showing((character) => ({
      ...character,
      Quest: { ...character.Quest, currentProgress: 41.92, maxProgress: 76 },
      Plot: { ...character.Plot, currentProgress: 491.76, maxProgress: 21600 },
    }));

    const quest = screen.getByRole('progressbar', { name: 'Current quest progress' });
    const plot = screen.getByRole('progressbar', { name: 'Plot act progress' });

    expect(quest.parentElement?.textContent).toContain('42 / 76 s');
    expect(plot.parentElement?.textContent).toContain('492 / 21600 s');
    // The announcement too, or a screen reader still reads two decimal places aloud every sample.
    expect(quest.getAttribute('aria-valuetext')).toBe('42 of 76 seconds');
    expect(plot.getAttribute('aria-valuetext')).toBe('492 of 21600 seconds');
  });

  it('keeps the fill exact, so rounding is a label change and not a progress change', () => {
    // The percentages come off the raw values. A bar rounded before the division would disagree with
    // itself at the edges — 0.4 of a second showing as a filled pixel, or the reverse.
    showing((character) => ({ ...character, Quest: { ...character.Quest, currentProgress: 0.6, maxProgress: 100 } }));

    const quest = screen.getByRole('progressbar', { name: 'Current quest progress' });
    // 0.6 of 100 floors to 0%, while the label rounds to 1 — the two are allowed to disagree because
    // they answer different questions, and the fill is the one that must not lie.
    expect(quest.getAttribute('aria-valuenow')).toBe('0');
    expect(quest.parentElement?.textContent).toContain('1 / 100 s');
  });

  it('announces the same seconds to a screen reader, which the percentage alone did not', () => {
    showing((character) => ({ ...character, Quest: { ...character.Quest, currentProgress: 37, maxProgress: 112 } }));

    const quest = screen.getByRole('progressbar', { name: 'Current quest progress' });
    // `aria-valuenow` is the percentage and stays that way; the text is what gets read out.
    expect(quest.getAttribute('aria-valuetext')).toBe('37 of 112 seconds');
    expect(quest.getAttribute('aria-valuenow')).toBe('33');
  });

  it('says what the act track does not count, always, rather than only once it is puzzling', () => {
    showing();

    // Unconditional on purpose. The banner's projection disagrees with naive subtraction from the
    // first tick, so a note that waited for some threshold would be absent exactly when a watcher
    // first builds the wrong model.
    expect(screen.getByText(/Travel, market attendance and ceremony are not credited/)).toBeTruthy();
  });
});

describe('the quest panel attributes the multiplier while it is applying', () => {
  it('names the rate the engine actually uses, rather than a figure of its own', () => {
    showing(engaged);

    const note = screen.getByText(/Named party engaged/);
    expect(note.textContent).toContain(`${QUEST_TARGET_PROGRESS}× the ordinary`);
    // The constant is the point of the assertion above — a panel writing its own `3` would go on
    // asserting it after the transition stopped multiplying by three.
    expect(QUEST_TARGET_PROGRESS).toBeGreaterThan(1);
  });

  it('stays away on an ordinary kill, so its presence is the signal', () => {
    showing((character) => ({ ...character, Task: { ...character.Task, type: 'kill' } }));

    // A note that were always shown would attribute nothing: the watcher needs to tell the lurching
    // kill from the three others around it, and permanence is exactly the failure being repaired.
    expect(screen.queryByText(/Named party engaged/)).toBeNull();
  });
});
