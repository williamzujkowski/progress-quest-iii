import { describe, expect, it } from 'vitest';
import { AMBIENT_LINES, AUCTION_LINES, BLAME_BEATS, EXCHANGES, FEUD_BEATS, ITEM_OF_RECORD_LINES, MISTELLS, ONBOARDING_LINES, QUESTION_BEATS, REACTION_LINES, SYSTEM_NOTICES, TRADE_LINES, UTILITY_BEATS } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';

/**
 * The register the feed could not otherwise reach: the building talking to nobody, on a schedule,
 * whether or not anything happened.
 *
 * `AmbientChannel` is narrow on purpose, and the test of what belongs is not "would it be funny" but
 * "is it true". A raid line outside a raid claims a raid is happening; an ambient whisper claims the
 * reader is seeing somebody's private message. `system` asserts no second person, no private
 * conversation, and no audience — it is the institution talking to nobody, which is this game's
 * premise rather than a claim about it.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' };
const TEXTS = SYSTEM_NOTICES.map(({ text }) => text);

const spokenOver = (tasks: number) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task)).flat();

describe('the building talking to nobody', () => {
  it('reaches the feed, and draws on the whole bank', () => {
    const said = new Set(spokenOver(3000).filter(({ text }) => TEXTS.includes(text)).map(({ text }) => text));

    expect(said.size).toBeGreaterThan(3);
  });

  it('speaks on system and nowhere else', () => {
    for (const notice of SYSTEM_NOTICES) expect(notice.channel, notice.text).toBe('system');
  });

  it('is the only ambient bank allowed on that channel', () => {
    // The widening was argued for one register. A second bank drifting onto `system` would make it
    // a colour rather than a claim about who is speaking, and the argument would quietly stop
    // applying without anybody deciding that.
    const everyOtherBank = [
      ...AMBIENT_LINES, ...REACTION_LINES, ...TRADE_LINES, ...AUCTION_LINES, ...FEUD_BEATS,
      ...QUESTION_BEATS, ...UTILITY_BEATS, ...ITEM_OF_RECORD_LINES, ...BLAME_BEATS,
      ...ONBOARDING_LINES, ...EXCHANGES.flat(), ...MISTELLS.flat(),
    ];

    for (const line of everyOtherBank) expect(line.channel, line.text).not.toBe('system');
  });

  it('addresses nobody, which is what makes it a notice', () => {
    // A notice that spoke to somebody would be a remark. No second person, and no name — the cast is
    // people, and attributing a scheduled downtime to a named clerk changes what it is.
    for (const text of TEXTS) {
      expect(text, text).not.toMatch(/\byou\b|\byour\b|\bwe\b|\bour\b/i);
      expect(text, text).not.toMatch(/\bhero\b/i);
    }
  });

  it('states no figure, like every other ambient bank', () => {
    for (const text of TEXTS) expect(text, text).not.toMatch(/\d/);
  });

  it('says nothing that depends on anything having happened', () => {
    // The point of the register is that it is issued on a schedule regardless of events. A notice
    // reacting to a kill or a sale would be an event scene wearing a system prefix.
    for (const text of TEXTS) {
      expect(text, text).not.toMatch(/\bkill|\bsold|\bloot|\bquest|\blevel\b/i);
    }
  });
});
