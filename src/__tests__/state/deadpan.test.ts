import { describe, expect, it } from 'vitest';
import { GRATS } from '../../data/socialGrats';
import { DKP_ALLOCATION, DKP_STANDINGS } from '../../data/socialDkp';
import {
  AMBIENT_LINES, AUCTION_LINES, BLAME_BEATS, EXCHANGES, FEUD_BEATS, ITEM_OF_RECORD_LINES,
  MISTELLS, ONBOARDING_LINES, QUESTION_BEATS, REACTION_LINES, SYSTEM_NOTICES, TRADE_LINES,
  UTILITY_BEATS,
} from '../../data/socialAmbient';

/**
 * The deadpan, enforced rather than described.
 *
 * `socialAmbient.ts` states the rule for its own banks — *"No line explains the line before it.
 * Agreement is the weakest possible second beat."* — and four lines outside those banks were
 * explaining themselves inside a single sentence, which is the same failure in less space:
 *
 *   "Congratulations. No re-routing is required, **which is the compliment**."
 *   "Performance is now described internally as consistent, **which is not nothing**."
 *
 * Both handed the reader the joke they had just been given. The tell is a trailing clause that
 * comments on the sentence it is attached to, and it is catchable: the deadpan states a fact and
 * stops, so a line that turns around to rate itself has broken register whatever it says.
 *
 * Scoped to the banks a reader meets as chatter or as a tenor line. Item and spell prose is
 * deliberately more florid and is held to the register rules in its own file.
 */

const SPEECH: readonly (readonly string[])[] = [
  Object.values(GRATS).flat(),
  DKP_STANDINGS,
  DKP_ALLOCATION,
  AMBIENT_LINES.map(({ text }) => text),
  TRADE_LINES.map(({ text }) => text),
  SYSTEM_NOTICES.map(({ text }) => text),
  AUCTION_LINES.map(({ text }) => text),
  REACTION_LINES.map(({ text }) => text),
  FEUD_BEATS.map(({ text }) => text),
  UTILITY_BEATS.map(({ text }) => text),
  QUESTION_BEATS.map(({ text }) => text),
  ITEM_OF_RECORD_LINES.map(({ text }) => text),
  BLAME_BEATS.map(({ text }) => text),
  ONBOARDING_LINES.map(({ text }) => text),
  MISTELLS.flat().map(({ text }) => text),
  EXCHANGES.flat().map(({ text }) => text),
];

const EVERY_LINE = SPEECH.flat();

describe('the deadpan does not rate itself', () => {
  it('has lines to check, or the sweep below proves nothing', () => {
    expect(EVERY_LINE.length).toBeGreaterThan(100);
  });

  it('never appends a clause that comments on the sentence it is attached to', () => {
    // The specific shapes that were shipped, plus their nearest neighbours. Each is a trailing
    // self-assessment: the line makes a claim and then tells the reader how to take it.
    const selfRating = /,\s*which is (?:the|not|hardly|scarcely|itself|no)\b|,\s*which is (?:a|an) \w+ (?:compliment|joke|distinction|comfort)\b/i;

    for (const line of EVERY_LINE) expect(line, line).not.toMatch(selfRating);
  });

  it('does not reach for whimsy or the personal', () => {
    // Every failure in this world is procedural. Drunkenness and philosophy are registers the
    // institution does not have — a clerk may be unreachable, reassigned, or on leave, and that is
    // funnier because it is something an organisation can actually record.
    for (const line of EVERY_LINE) {
      expect(line, line).not.toMatch(/\bsober\b|\bdrunk\b|\bphilosophical\b|\bwhimsical\b/i);
    }
  });
});
