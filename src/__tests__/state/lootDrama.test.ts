import { describe, expect, it } from 'vitest';
import { EXCHANGES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';

/**
 * The oldest argument in raiding: who is holding it, whether that was an off-spec need, and the item
 * that keeps dropping for nobody.
 *
 * Added to the exchange bank rather than given a lane. A `loot` lane was the obvious build and the
 * wrong one — the rotation is already fourteen distinct kinds across nineteen slots, so another
 * running bit takes weight from the ones already there rather than adding to them. The measurement
 * that mattered pointed elsewhere: ambient is 43.8% of what is on screen at any moment and reuses
 * each line 2.5 times, the highest reuse left in the feed. Deepening a bank lowers that and costs no
 * lane weight at all.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' };

const spokenOver = (tasks: number) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task)).flat();

/** The four exchanges this file adds, identified by their opening line. */
const OPENINGS = [
  'Who is holding the loot?',
  'That was an off-spec need.',
  'It dropped again.',
  'Has the thing we came for ever dropped?',
];

const dramaExchanges = EXCHANGES.filter((exchange) => OPENINGS.includes(exchange[0]?.text ?? ''));

describe('loot drama is an argument, not an announcement', () => {
  it('is in the bank, all four of it', () => {
    expect(dramaExchanges).toHaveLength(OPENINGS.length);
  });

  it('puts the disagreement on two different shoulders', () => {
    // The bit is two people disagreeing about a rule nobody wrote down. One seat saying all of it is
    // somebody talking themselves out of a grievance, which is a different and worse joke.
    for (const exchange of dramaExchanges) {
      expect(new Set(exchange.map(({ seat }) => seat)).size, exchange[0]?.text).toBeGreaterThan(1);
    }
  });

  it('names no item and states no figure', () => {
    // The constraint every ambient bank is held to: a line citing either would assert state nothing
    // computed. It also happens to be funnier — the object is never identified, so the argument is
    // about the rule rather than about the thing.
    for (const exchange of dramaExchanges) {
      for (const { text } of exchange) expect(text, text).not.toMatch(/\d/);
    }
  });

  it('reaches the feed', () => {
    const said = new Set(spokenOver(3000).map(({ text }) => text));
    const landed = OPENINGS.filter((opening) => said.has(opening));

    expect(landed.length, `only ${landed.length} of ${OPENINGS.length} reached the feed`).toBeGreaterThan(1);
  });

  it('lands the whole exchange rather than half of one', () => {
    // An exchange whose reply never arrives is a remark, and a remark that ends on a question is
    // the feed dropping a line rather than a joke.
    const said = spokenOver(3000).map(({ text }) => text);
    const opened = said.filter((text) => OPENINGS.includes(text));
    expect(opened.length, 'the bit has to fire at all').toBeGreaterThan(0);

    for (const exchange of dramaExchanges) {
      const opening = exchange[0]?.text as string;
      if (!said.includes(opening)) continue;
      for (const { text } of exchange) expect(said, `${opening} is missing a reply`).toContain(text);
    }
  });

  it('adds to the bank rather than displacing it', () => {
    // The reason this is an addition and not a rewrite. A change that swapped four existing
    // exchanges for these would satisfy everything above and lower nothing.
    const unclosableSale = EXCHANGES.find((exchange) => exchange[0]?.text === 'Sold.');
    const intakeSheet = EXCHANGES.find((exchange) => exchange[0]?.text === 'Did you sign the intake sheet?');

    expect(unclosableSale, 'the sale that never closes must survive').toBeDefined();
    expect(intakeSheet, 'the intake-sheet feud must survive').toBeDefined();
    expect(EXCHANGES.length).toBeGreaterThan(OPENINGS.length + 6);
  });
});
