import { describe, expect, it } from 'vitest';
import { BASE_TITLE, formatTabTitle, tabTitleFacts } from '../../state/tabTitle';

const facts = (over: Partial<Parameters<typeof tabTitleFacts>[0]> = {}) => ({
  level: 12, gold: 340, act: 2, velocity: 615, ...over,
});

describe('tab title', () => {
  it('rotates through the readings and wraps', () => {
    const shown = [0, 1, 2, 3, 4].map((frame) => formatTabTitle(facts(), frame));
    expect(shown[0]).toBe(`Lvl 12 · ${BASE_TITLE}`);
    expect(shown[1]).toBe(`340 GP · ${BASE_TITLE}`);
    expect(shown[2]).toBe(`Act 2 · ${BASE_TITLE}`);
    expect(shown[3]).toBe(`615 filed/hr · ${BASE_TITLE}`);
    expect(shown[4]).toBe(shown[0]);
  });

  it('always keeps the app identifiable', () => {
    // A tab that stops saying what it is becomes harder to find than one saying nothing new.
    for (const frame of [0, 1, 2, 3, 99]) {
      expect(formatTabTitle(facts(), frame)).toContain(BASE_TITLE);
    }
  });

  it('omits readings that have nothing to report', () => {
    // Act 0 is the prologue; a velocity needs a wide enough window to exist at all.
    expect(tabTitleFacts(facts({ act: 0, velocity: null }))).toEqual(['Lvl 12', '340 GP']);
  });

  it('claims no mechanic the engine does not model', () => {
    for (const frame of [0, 1, 2, 3]) {
      expect(formatTabTitle(facts(), frame)).not.toMatch(/damage|dps|healed|bonus|reward|idle earnings|offline/i);
    }
  });

  it('survives a negative or fractional frame rather than rendering undefined', () => {
    expect(formatTabTitle(facts(), -3)).toContain(BASE_TITLE);
    expect(formatTabTitle(facts(), 2.7)).toBe(`Act 2 · ${BASE_TITLE}`);
  });

  it('falls back to the plain title when there is nothing at all to say', () => {
    expect(formatTabTitle({ level: 0, gold: 0, act: 0, velocity: null }, 0)).toContain(BASE_TITLE);
  });
});
