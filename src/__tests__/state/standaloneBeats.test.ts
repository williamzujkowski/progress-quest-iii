import { describe, expect, it } from 'vitest';
import { BLAME_BEATS, FEUD_BEATS, QUESTION_BEATS, UTILITY_BEATS } from '../../data/socialAmbient';

/**
 * Every running-bit beat has to make sense on its own.
 *
 * The four banks are written as ordered serials, and the beat index marches with the task counter
 * whether or not the player heard the previous beat — so most beats are met alone and out of order.
 * Measured on real play: one run delivered "The box is mandatory" forty minutes before "I have added
 * a box", another opened its feud on the final beat, and a third answered a request nobody heard.
 *
 * The structural fix — emitting each bit as a unit, the way `EXCHANGES` works — was built and
 * reverted: it makes four more lanes speak two and three lines at once, against a rule this codebase
 * argues for explicitly ("a burst of ambient would be a caption track with a different subject").
 * So the copy carries the weight instead, and the serial ordering stays exactly as it was.
 *
 * A bare one-word beat is deliberate and stays. "Horse." and "The Greaves." are the terse deadpan
 * the ambient bank is built to include — the one-to-three word utterance is the most common in a
 * real channel and was zero per cent of this one. They read as exasperation, not as a dangling
 * reference.
 */

const ALL_BEATS = [
  ['FEUD_BEATS', FEUD_BEATS],
  ['UTILITY_BEATS', UTILITY_BEATS],
  ['BLAME_BEATS', BLAME_BEATS],
  ['QUESTION_BEATS', QUESTION_BEATS],
] as const;

/**
 * Phrases that point at something a previous line was supposed to have introduced.
 *
 * Deliberately narrow. "The intake sheet" is fine — it is a thing the guild has, named in full. What
 * is not fine is a bare demonstrative standing in for a noun the reader never met: "the new box",
 * "the other one", "both" with nothing to be both of.
 */
const DANGLING = [
  /\bthe new \w+/i,
  /\bthe other one\b/i,
  /\bto both\.\s*$/i,
  /\bthe latter\b|\bthe former\b/i,
  /\bas (?:above|discussed|noted)\b/i,
];

describe('a running bit is legible the first time you meet it', () => {
  it('has beats to check, or the sweep below proves nothing', () => {
    for (const [name, bank] of ALL_BEATS) {
      expect(bank.length, `${name} is empty`).toBeGreaterThan(3);
    }
  });

  it('points at nothing the reader has not been shown', () => {
    for (const [name, bank] of ALL_BEATS) {
      for (const { text } of bank) {
        for (const pattern of DANGLING) {
          expect(text, `${name}: "${text}" refers back to a line the reader probably missed`).not.toMatch(pattern);
        }
      }
    }
  });

  it('names its subject in every beat that is not a deadpan fragment', () => {
    // Each bank runs on one subject. A beat longer than a few words has to name it, or it is a
    // sentence about something the reader cannot identify. Short fragments are exempt: they read as
    // interjections, which is what they are for.
    const SUBJECTS: Record<string, RegExp> = {
      FEUD_BEATS: /intake sheet|box/i,
      UTILITY_BEATS: /support|thing|run|matter/i,
      BLAME_BEATS: /\{slot\}/,
      QUESTION_BEATS: /horse|agenda/i,
    };
    for (const [name, bank] of ALL_BEATS) {
      for (const { text } of bank) {
        if (text.trim().split(/\s+/u).length <= 3) continue;
        expect(text, `${name}: "${text}" never says what it is about`).toMatch(SUBJECTS[name]!);
      }
    }
  });
});
