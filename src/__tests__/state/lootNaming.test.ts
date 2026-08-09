import { describe, expect, it } from 'vitest';
import { projectSocialBatch } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * Loot was the most repetitive scene in the game, and not because its bank was small.
 *
 * Measured over 636 lines of real play: loot reused 26 distinct sentences 113 times — a 4.3× reuse
 * against the market scene's 1.4×, from a bank of comparable size. The difference is that the market
 * interpolates the item's name and the gold, so its variety comes from the data. Loot said
 * "1 inventory unit" every time and had nothing to vary on.
 *
 * The fix is not to name the thing everywhere, which is why this file exists rather than a diff that
 * quietly rewrote the bank.
 */

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
  act: 3,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 40,
  elapsedSeconds: 4000,
  ...overrides,
});

const drop = (activityId: number, name: string, quantity = 1): IdentifiedGameTransitionRecord => ({
  activityId,
  record: { event: { type: 'item_gained', name, quantity } as GameTransitionEvent, post: snapshot({ completedTasks: activityId }) },
});

const said = (activityId: number, name: string, quantity = 1) =>
  projectSocialBatch([drop(activityId, name, quantity)]).map(({ text }) => text).join(' ');

/** The variants a run of drops produces, keyed by shape rather than by wording. */
const shapesOver = (name: string, count = 80) =>
  Array.from({ length: count }, (_unused, index) => said(2000 + index, name));

describe('some drops name the thing', () => {
  it('quotes the item, so the variety comes from the tables', () => {
    const naming = shapesOver('bent fork').filter((line) => line.includes('bent fork'));

    expect(naming.length, 'the naming variants must be reachable').toBeGreaterThan(0);
  });

  it('carries the quantity into the name when there is more than one', () => {
    const many = Array.from({ length: 80 }, (_unused, index) => said(3000 + index, 'lurker transcript', 4))
      .filter((line) => line.includes('lurker transcript'));

    expect(many.length).toBeGreaterThan(0);
    // "4 × lurker transcript", never "4 lurker transcripts" — the tables already pluralise however
    // they like, and appending an s to an engine-generated name invents a word.
    for (const line of many) expect(line, line).toContain('4 × lurker transcript');
  });

  it('bounds the name so it cannot swallow the sentence', () => {
    // Per entry rather than per scene: each line carries its own ceiling, and a scene is up to three
    // of them. Joining first measured the scene and would have passed on any bound at all.
    //
    // And the assertion is that the *sentence survives*, not merely that the line is short. The
    // projection already truncates every line at 180 code points, so a length check alone passes
    // with the name's own cap removed — it just leaves a line that is 180 characters of item name
    // and none of the remark it was supposed to be part of.
    const long = 'x'.repeat(400);
    let named = 0;
    for (let index = 0; index < 80; index += 1) {
      for (const { text } of projectSocialBatch([drop(4000 + index, long)])) {
        expect(Array.from(text).length, `${text.length} chars`).toBeLessThanOrEqual(180);
        if (!text.includes('xxx')) continue;
        named += 1;
        expect(text, text).toMatch(/nobody has verified|spelled it differently|heading that predates it/);
      }
    }
    expect(named, 'a long name has to actually reach a naming variant').toBeGreaterThan(0);
  });

  it('falls back rather than quoting an empty name', () => {
    // An engine name is never empty, but an imported save chooses this field. A naming variant with
    // nothing to name would otherwise read "  recovered." with the hole where the noun goes.
    // Matched on the naming variants' own tails. A looser filter caught "1 unit recovered. The
    // previous holder is not available for comment." — one of the refusals, which happens to share a
    // verb — and asserted the fallback against a line that was never going to carry it.
    const naming = Array.from({ length: 80 }, (_unused, index) => said(5000 + index, ''))
      .filter((line) => /nobody has verified that it is the name of this|manifest has spelled it differently|heading that predates it/.test(line));

    expect(naming.length, 'the naming variants must be reachable').toBeGreaterThan(0);
    for (const line of naming) {
      expect(line, line).toContain('an unlabelled find');
      expect(line, line).not.toMatch(/ {2}/);
    }
  });
});

describe('and some deliberately refuse to', () => {
  it('keeps the jokes that are about not naming it', () => {
    // Half the bank is bureaucratic refusal — "Source remains professionally unspecified",
    // "Provenance has taken personal leave". Quoting the item into those explains the gag away, so
    // the naming variants were added beside them rather than over them. A rewrite that named the
    // item everywhere would pass every assertion above and lose this.
    const everything = shapesOver('bent fork').join(' | ');

    expect(everything).toMatch(/professionally unspecified|Provenance has taken personal leave|without making eye contact/);
  });

  it('draws on both kinds across a run of drops', () => {
    const lines = shapesOver('bent fork');
    const naming = lines.filter((line) => line.includes('bent fork')).length;

    expect(naming, 'naming variants must appear').toBeGreaterThan(0);
    expect(lines.length - naming, 'and so must the ones that refuse').toBeGreaterThan(0);
  });

  it('is measurably less repetitive than it was', () => {
    // The point of the change, asserted rather than asserted-about. Eighty drops of one item across
    // eighty activity ids: the bank alone gives a fixed number of distinct openings, and the naming
    // variants add as many again as there are item names in play.
    const oneItem = new Set(shapesOver('bent fork'));
    const manyItems = new Set(Array.from({ length: 80 }, (_unused, index) => said(6000 + index, `specimen ${index % 12}`)));

    expect(manyItems.size).toBeGreaterThan(oneItem.size);
  });
});
