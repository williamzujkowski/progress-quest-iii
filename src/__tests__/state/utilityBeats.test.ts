import { describe, expect, it } from 'vitest';
import { UTILITY_BEATS } from '../../data/socialAmbient';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';
import { KLASSES } from '../../data/traits';
import { projectAmbient } from '../../state/socialProjection';

/**
 * The oldest joke in raiding, and already this game's joke about the hero told about somebody else:
 * a utility seat is brought because the run does not work without it, blamed when it goes wrong,
 * and left off the credit — and keeps turning up.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' };
const TEXTS = UTILITY_BEATS.map(({ text }) => text);

const spokenOver = (tasks: number) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task)).flat();

describe('the seat everybody needs and nobody thanks', () => {
  it('reaches the channel', () => {
    const said = spokenOver(3000).filter(({ text }) => TEXTS.includes(text));
    expect(said.length).toBeGreaterThan(0);
  });

  it('advances in order and wraps rather than resolving', () => {
    // The same form the intake-sheet feud uses. A thank-you at the end would be a payoff, and the
    // absence of one is the content — so the bit has to come round again rather than conclude.
    const seen = spokenOver(6000).filter(({ text }) => TEXTS.includes(text)).map(({ text }) => TEXTS.indexOf(text));

    expect(new Set(seen).size, 'every beat must be reachable').toBe(TEXTS.length);
    // Wrapping means the last beat is followed by the first somewhere in a long run.
    expect(seen.some((index, position) => index === 0 && seen[position - 1] === TEXTS.length - 1)).toBe(true);
  });

  it('never lets the acknowledgement arrive', () => {
    // The failure mode is a well-meaning line that resolves it. Thanks in this bit are always
    // procedural, never personal, and the closing beat has to stay the joke rather than become a
    // payoff — so no beat may thank the seat plainly.
    for (const text of TEXTS) {
      expect(text, text).not.toMatch(/\bthank you\b|\bwell done\b|\bappreciated\b/i);
    }
    expect(TEXTS.at(-1)).toContain('a meeting nobody attended');
  });

  it('names no class and no person', () => {
    // The joke is structural, so it survives being about a seat rather than about a bard. It also
    // has to: the tables are asserted to name no real person, and a guildmate's twenty-year-old
    // character name is a real person who has not been asked.
    for (const text of TEXTS) {
      expect(text, text).not.toMatch(/\b(?:bard|enchanter|shaman|druid|paladin|rogue|mage|priest|warrior)\b/i);
      expect(text, text).not.toMatch(/\d/);
    }
  });

  it('is spoken by seats the cast actually has', () => {
    const seats = new Set(SOCIAL_PERSONAS.map(({ seat }) => seat));
    for (const { seat } of UTILITY_BEATS) expect(seats.has(seat), seat).toBe(true);
  });

  it('has a class in the game the bit is obviously about', () => {
    // The seat joke works without one, but the game now names the role too. `Cadence Owner` is a
    // musical term and an agile one at once, which is the bard in this register: the class that
    // keeps everybody else in time and is never credited for it.
    //
    // Renamed rather than added. `KLASSES` is drawn with `rng.pick` for passing NPCs and two
    // recordings pin one of them, so the table's length may not move — asserted here so the next
    // person reaching for a new class learns it from a test rather than from a golden diff.
    expect(KLASSES.map(({ name }) => name)).toContain('Cadence Owner');
    expect(KLASSES).toHaveLength(18);
  });

  it('keeps the request and the answer on different shoulders', () => {
    // A seat asking itself for a favour is not the joke. The asking and the doing have to be
    // different people, or it reads as one person talking to themselves.
    const asks = UTILITY_BEATS.filter(({ text }) => /can support/i.test(text));
    expect(asks.length).toBeGreaterThan(0);
    for (const ask of asks) expect(ask.seat).not.toBe('support');
  });
});
