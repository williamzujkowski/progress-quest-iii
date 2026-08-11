import { describe, expect, it } from 'vitest';
import { formatCurrency, formatGameNumber } from '../../engine/text';

/**
 * A gold total stays legible past the point an act ordinal stops being one.
 *
 * `formatGameNumber` crosses into scientific notation at a million, which is right for the surface
 * it was built for — `Loading Act 1.00e6...` reads correctly, and there is a test that requires it.
 * But peak gold crosses a million at about day twenty-seven, and `1.16e6` is the smallest a million
 * has ever looked. One constant was serving two purposes with opposite requirements.
 *
 * The threshold here is the persisted ceiling. Ordinary play never approaches it — the equipment
 * sink pins gold below 5L², about 1.3e8 at the maximum finite level — so the exponent form is a
 * guard against an imported save rather than something a player reaches.
 */

describe('a currency total is written to be read', () => {
  it('keeps a million in plain digits, grouped', () => {
    // The whole point. This is the figure that made the issue worth filing.
    expect(formatCurrency(1_158_330)).toBe('1,158,330');
    expect(formatGameNumber(1_158_330)).toBe('1.16e6');
  });

  it('groups, because plain digits alone would not be an improvement', () => {
    // `127474005` is harder to read than the exponent it replaces. The separators are the fix, not
    // the raised threshold on its own.
    expect(formatCurrency(127_474_005)).toBe('127,474,005');
    expect(formatCurrency(1_000)).toBe('1,000');
  });

  it('agrees with the ordinary formatter below a thousand, where grouping does nothing', () => {
    for (const value of [0, 1, 42, 999]) {
      expect(formatCurrency(value), `${value}`).toBe(formatGameNumber(value));
    }
  });

  it('falls back to the exponent past the persisted ceiling', () => {
    // Reachable only by import. A grouped twelve-digit figure is not more legible than an exponent,
    // so the escape hatch stays.
    expect(formatCurrency(2_000_000_000)).toBe(formatGameNumber(2_000_000_000));
  });

  it('leaves the act ordinal alone, which is the collision this resolves', () => {
    // An act of a million is an index and reads correctly as an exponent; a test elsewhere requires
    // `Loading Act 1.00e6...`. Currency needed its own formatter precisely so that could stay true.
    expect(formatGameNumber(1_000_000)).toBe('1.00e6');
    expect(formatCurrency(1_000_000)).toBe('1,000,000');
  });

  it('does not render a negative zero', () => {
    expect(formatCurrency(-0)).toBe('0');
  });
});
