import { describe, expect, it } from 'vitest';
import { AUCTION_LINES, EXCHANGES, TRADE_LINES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';

/**
 * The auction channel is a different rhythm from a trade advertisement, and the difference is the
 * point. `TRADE_LINES` carries the long advertisement; this carries the channel's *forms* — the
 * price check, the bump, the repost, the undercut, the thing offered free that nobody takes.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' };
const TEXTS = AUCTION_LINES.map(({ text }) => text);

const spokenOver = (tasks: number) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task)).flat();

describe('the auction channel', () => {
  it('reaches the feed, and draws on the whole bank', () => {
    // Counting lines rather than distinct lines let a version that always said the same thing pass.
    const said = new Set(spokenOver(3000).filter(({ text }) => TEXTS.includes(text)).map(({ text }) => text));

    expect(said.size).toBeGreaterThan(4);
  });

  it('broadcasts on world, because that is who can hear an auction', () => {
    // A `SocialChannel` value is a claim about who can hear a line. `world` already means a
    // broadcast not scoped to guild or party, and the audience of an auction is that same audience.
    // A channel of its own would assert a second broadcast audience that does not exist — and what
    // made the tunnel legible was never the prefix, it was the abbreviations.
    for (const line of AUCTION_LINES) expect(line.channel, line.text).toBe('world');
  });

  it('carries forms the advertisement bank does not', () => {
    // The reason this is a second bank rather than more trade lines. A bump is not a variation on an
    // advertisement; it is a different utterance, and half of these are two words long.
    const said = TEXTS.join(' | ').toLowerCase();

    expect(said).toContain('pc on');
    expect(said).toContain('up');
    expect(said).toContain('undercut');
    expect(said).toContain('free');
    expect(said).toContain('wtb');

    // And none of them is simply a trade line moved across.
    for (const text of TEXTS) expect(TRADE_LINES.map((line) => line.text)).not.toContain(text);
  });

  it('keeps the short end genuinely short', () => {
    // The channel's signature is that a bump is two characters. A bank whose shortest line is a
    // sentence is an advertisement bank with different words.
    // Counted rather than minimised: a single two-word line satisfies a `min <= 2` check, so
    // lengthening the bump left `Still up.` holding the assertion up on its own.
    const brief = TEXTS.filter((text) => text.split(' ').length <= 2);

    expect(brief.length, 'the bank needs more than one genuinely short utterance').toBeGreaterThan(1);
    expect(Math.min(...TEXTS.map((text) => text.length)), 'and one of them should be a bump').toBeLessThanOrEqual(3);
  });

  it('has a sale that never closes, spoken with the hero out of the room', () => {
    const closing = EXCHANGES.find((exchange) => exchange[0]?.text === 'Sold.');

    expect(closing, 'the unclosable sale must be in the exchange bank').toBeDefined();
    expect(closing!.map(({ text }) => text)).toEqual(['Sold.', 'To whom?', 'The channel.']);
    // Two speakers, and neither is the hero.
    expect(new Set(closing!.map(({ seat }) => seat)).size).toBeGreaterThan(1);
  });

  it('states no figure, like every other ambient bank', () => {
    // An ambient line citing a number would assert state nothing computed. An auction channel is the
    // most tempting place in the game to break that, because real ones are nothing but numbers.
    for (const text of TEXTS) expect(text, text).not.toMatch(/\d/);
  });
});
