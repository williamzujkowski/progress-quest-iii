// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HeroBanner } from '../../components/HeroBanner';
import { createNewCharacter } from '../../engine/sim';
import { useGameStore } from '../../state/gameStore';

/**
 * Two figures this banner published without a noun.
 *
 * The experience bar is four pixels of accent under the hero's name, and the word "Experience"
 * appeared in the rendered interface zero times — it lived in `aria-label` and `aria-valuetext`,
 * which is to say for screen readers only. The nearest labelled thing to it is a heart reading
 * *HP Max*, so a watcher reads a filling bar as health and cannot then explain why it empties on
 * promotion. The one line that ever named it is absent for the first minute and absent again after
 * every level-up, because the projection discards any window straddling a reset.
 *
 * And the filing rate read `1240 /hr` beside `0 GP`, which reads as gold per hour. Its gloss lived
 * in a `title` and an `sr-only` span, and on touch there is no hover.
 */

vi.mock('../../state/useTrackProjection', () => ({ useTrackProjection: () => null }));
vi.mock('../../state/useTabTitle', () => ({ useTabTitle: () => undefined }));

const velocity = vi.hoisted(() => ({ current: null as number | null }));
vi.mock('../../state/useFilingVelocity', () => ({ useFilingVelocity: () => velocity.current }));

afterEach(() => {
  cleanup();
  velocity.current = null;
});

const banner = (experience: { currentSeconds: number; maxSeconds: number }) => {
  useGameStore.setState({
    character: createNewCharacter('Krg', 'Half Daemon', 'Robot Monk', 900),
    progression: { experience, completedTasks: 0, elapsedSeconds: 0 },
  });
  render(<HeroBanner />);
};

describe('the hero banner names what its bar is filling with', () => {
  it('shows the word and the figure on screen, not only to a screen reader', () => {
    banner({ currentSeconds: 62, maxSeconds: 100 });

    // `getByText` reads rendered text. The `aria-label` that used to be the only mention would not
    // satisfy this, which is the whole repair.
    expect(screen.getByText('Experience')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
  });

  it('keeps the label at the two moments the projection disappears', () => {
    // A fresh track and a just-reset one. `useTrackProjection` returns null here for both — mocked
    // to the state it genuinely holds during the first minute and after every promotion — so if the
    // label were conditional on the projection it would be missing exactly when the bar is dramatic.
    banner({ currentSeconds: 0, maxSeconds: 240 });
    const label = screen.getByText('Experience');
    expect(label).toBeTruthy();
    // Present is not the same as shown, and `getByText` does not distinguish them — a label hidden
    // while the projection is missing would be the same defect wearing a different attribute.
    expect(label.closest('[hidden]')).toBeNull();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.queryByText(/Next promotion expected/)).toBeNull();
  });
});

describe('the filing rate says what it is filing', () => {
  it('carries the noun in the visible strip, not only in the hover', () => {
    velocity.current = 1240;
    banner({ currentSeconds: 1, maxSeconds: 100 });

    // Located through the pill so a match cannot come from the `sr-only` gloss beside it, which was
    // already correct and was already unreachable on touch.
    const pill = screen.getByText('1240').closest('.velocity-pill');
    expect(pill?.querySelector('.stat-unit')?.textContent).toBe('filed/hr');
  });

  it('stays away entirely until the sampled window means something', () => {
    // Unchanged behaviour, asserted because the pill is now the only thing carrying the noun: a
    // wild first figure is worse than no figure on a dashboard made of numbers.
    banner({ currentSeconds: 1, maxSeconds: 100 });
    expect(document.querySelector('.velocity-pill')).toBeNull();
  });
});
