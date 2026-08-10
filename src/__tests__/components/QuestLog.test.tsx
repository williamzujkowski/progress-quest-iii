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

    // Floored, not rounded. Rounding let the label reach the maximum before the track did.
    expect(quest.parentElement?.textContent).toContain('41 / 76 s');
    expect(plot.parentElement?.textContent).toContain('491 / 21600 s');
    // The announcement too, or a screen reader still reads two decimal places aloud every sample.
    expect(quest.getAttribute('aria-valuetext')).toBe('41 of 76 seconds');
    expect(plot.getAttribute('aria-valuetext')).toBe('491 of 21600 seconds');
  });

  it('never claims a completion the bar does not show', () => {
    /*
     * This assertion previously pinned the opposite, and the reasoning was wrong. It said the label
     * and the fill "are allowed to disagree because they answer different questions, and the fill is
     * the one that must not lie" — which protects the fill and says nothing about the label. Rounding
     * up to the maximum *is* the label lying: at 75.6 of 76 the panel read "76 / 76 s" beside a bar
     * at 99%, and `aria-valuetext` announced seventy-six of seventy-six while `aria-valuenow` said
     * ninety-nine. One element, two contradictory facts, on the last tick of every quest.
     *
     * Both now floor, so they cannot disagree about the thing that matters.
     */
    showing((character) => ({ ...character, Quest: { ...character.Quest, currentProgress: 75.6, maxProgress: 76 } }));

    const quest = screen.getByRole('progressbar', { name: 'Current quest progress' });
    expect(quest.getAttribute('aria-valuenow')).toBe('99');
    expect(quest.getAttribute('aria-valuetext')).toBe('75 of 76 seconds');
    expect(quest.parentElement?.textContent).toContain('75 / 76 s');
    expect(quest.parentElement?.textContent).not.toContain('76 / 76 s');
  });

  it('reaches the maximum only when the track has', () => {
    showing((character) => ({ ...character, Quest: { ...character.Quest, currentProgress: 76, maxProgress: 76 } }));

    const quest = screen.getByRole('progressbar', { name: 'Current quest progress' });
    expect(quest.getAttribute('aria-valuenow')).toBe('100');
    expect(quest.parentElement?.textContent).toContain('76 / 76 s');
  });

  it('does not divide by a denominator it has not checked', () => {
    // The only panel of the three without a guard. `maxProgress: 0` is schema-legal, and it rendered
    // `NaN%`, an `aria-valuenow` of `NaN`, and a `width` React drops — so the bar vanished rather
    // than reading empty.
    showing((character) => ({
      ...character,
      Task: { ...character.Task, durationMs: 0, elapsedMs: 0 },
      Quest: { ...character.Quest, currentProgress: 0, maxProgress: 0 },
      Plot: { ...character.Plot, currentProgress: 0, maxProgress: 0 },
    }));

    for (const name of ['Current task progress', 'Current quest progress', 'Plot act progress']) {
      const bar = screen.getByRole('progressbar', { name });
      expect(bar.getAttribute('aria-valuenow'), name).toBe('0');
      expect((bar.firstElementChild as HTMLElement).style.width, name).toBe('0%');
    }
    expect(document.body.textContent).not.toContain('NaN');
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
