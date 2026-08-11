// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CurrencyNumber } from '../../components/GameNumber';

/**
 * A currency figure keeps its spoken form where it needs one, and does not invent one where it does
 * not.
 *
 * Grouped digits read correctly aloud, so `1,158,330` needs no `sr-only` twin and adding one would
 * say the number twice. The fallback past the persisted ceiling is scientific notation, which
 * emphatically does need one — rendering it bare made a screen reader announce "one point zero zero
 * e twelve".
 *
 * The first version of this component dropped the twin in both cases. CI caught it, on a locator
 * looking for the `aria-hidden` half that had stopped existing.
 */

afterEach(cleanup);

describe('a currency figure is spoken the way it is read', () => {
  it('renders grouped digits as one plain span', () => {
    const container = render(<CurrencyNumber value={1_158_330} />).container;
    expect(container.textContent).toBe('1,158,330');
    // No twin: the digits are already legible aloud, and a second copy would be read twice.
    expect(container.querySelector('.sr-only')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('keeps the spoken twin when it falls back to an exponent', () => {
    const container = render(<CurrencyNumber value={1e12} />).container;
    const visible = container.querySelector('[aria-hidden="true"]');
    const spoken = container.querySelector('.sr-only');
    expect(visible?.textContent, 'the exponent lost its aria-hidden half').toBe('1.00e12');
    // Asserted as "not the exponent" rather than against a fixed phrase. The spoken form is
    // `describeGameNumber`'s and is currently "1 trillion" — I guessed "times 10 to the 12" writing
    // this, which is the wrong thing to pin: what matters is that a reader is not handed the
    // exponent, not which words replace it.
    expect(spoken?.textContent, 'the exponent lost its spoken half').toBeTruthy();
    expect(spoken?.textContent).not.toBe('1.00e12');
    expect(spoken?.textContent).toMatch(/trillion|times 10/i);
  });

  it('does not read an exponent literally', () => {
    // The regression in one assertion: a reader must never be handed "1.00e12" as its only text.
    const container = render(<CurrencyNumber value={1e12} />).container;
    const spokenOnly = container.querySelector('.sr-only')?.textContent ?? '';
    expect(spokenOnly).not.toBe('1.00e12');
    expect(spokenOnly.length).toBeGreaterThan(0);
  });
});
