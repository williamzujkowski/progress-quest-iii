// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { HeroBanner } from '../../components/HeroBanner';
import { createNewCharacter } from '../../engine/sim';
import { useGameStore } from '../../state/gameStore';
import { PRIME_STATS } from '../../data/traits';

/**
 * Every prime stat says what it is for, and says something true.
 *
 * The figures shipped as six three-letter codes with bare integers and no gloss anywhere in the app
 * — there is no help screen, tutorial or glossary. `HeroBanner` already states the rule twice: a
 * figure whose noun lives only in `sr-only` is unlabelled for most of the people looking at it.
 *
 * The honesty half matters as much as the presence half. A review of this screen reported that only
 * STR does anything; checked at the call sites, every one of them is consulted — so a label saying
 * "nothing consults it" would have been the lie, not the omission.
 */

afterEach(cleanup);

const banner = () => {
  useGameStore.setState({ character: createNewCharacter('Labelled', 'Half Daemon', 'Robot Monk', 900) });
  return render(<HeroBanner />).container;
};

describe('the prime stats explain themselves', () => {
  it('gives every stat a visible-on-hover gloss, not only a screen-reader one', () => {
    const container = banner();
    const titles = [...container.querySelectorAll('.hero-stat')].map((node) => node.getAttribute('title'));
    expect(titles).toHaveLength(PRIME_STATS.length);
    for (const title of titles) {
      expect(title, 'a stat with no gloss').toBeTruthy();
      // Long enough to be a sentence rather than a restatement of the abbreviation.
      expect((title ?? '').length).toBeGreaterThan(20);
    }
  });

  it('names a mechanic rather than repeating the abbreviation', () => {
    const container = banner();
    const titles = [...container.querySelectorAll('.hero-stat')]
      .map((node) => node.getAttribute('title') ?? '');
    // Each gloss has to reach past the expansion into what the number does. Without this, "STR —
    // Strength" would pass the test above and tell a newcomer nothing.
    for (const title of titles) expect(title, title).toMatch(/—\s*\w+\s+—|—.*\b(how|which|what|the terms)\b/);
  });

  it('claims no effect the engine does not have', () => {
    // The two vitals are genuinely inert: nothing damages the hero and no spell spends MP. A gloss
    // implying otherwise would be exactly the kind of lie this codebase keeps having to remove.
    const container = banner();
    const vitals = [...container.querySelectorAll('.meter-health, .meter-magic')]
      .map((node) => node.getAttribute('title') ?? '');
    expect(vitals.length).toBeGreaterThanOrEqual(2);
    for (const title of vitals) {
      expect(title, title).not.toMatch(/damage|heal|restore|survive|spend it|protects/i);
      expect(title, title).toMatch(/Nothing in the world reduces it|has ever spent any/);
    }
  });
});
