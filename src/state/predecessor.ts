import type { CharacterSheet } from '../engine/types';

/**
 * Who held this file before.
 *
 * The backlog's history epic proposed it as an addition the source document did not contain, and
 * called it the funniest possible institutional memory: **the institution outlives the hero**. The
 * pieces were already here and unconnected. The roster holds many characters. The caseload,
 * commendation and specimen ledgers deliberately span all of them — *"a new character starting over
 * must not erase the record"* — so a new hero inherits a filing cabinet full of somebody else's
 * work. Nothing anywhere said whose.
 *
 * That is the whole feature: not a simulation of a retired character, not a ghost, not a mechanic.
 * One line naming the person the paperwork used to be about.
 *
 * ## Seniority, not recency
 *
 * "Predecessor" suggests the previous one, and the roster does keep a recency order. This uses the
 * highest level instead, and the reason is the same one that decides which of two overlapping eras
 * is current: recency moves. A player switching between two characters would see the citation swap
 * every time, which reads as the institution changing its mind rather than as a record. Seniority
 * holds still, and is what an institution would file by anyway.
 *
 * ## What it may say
 *
 * Only what the sheet holds — a name, a race, a class, a level. Nothing about what became of them,
 * because nothing knows: a character in the roster has not retired, died, or been dismissed, they
 * have simply not been loaded lately. A line claiming any of those would be inventing an ending for
 * somebody who is still on file.
 */

/**
 * Narrower than the sheet on purpose.
 *
 * The first version returned the race, the class and the level beside the name, on the reasoning
 * that a caller might want to lay the citation out itself. Nothing did — the document renders
 * `phrase` and the tests assert on `name` — so those three fields were an API promising a
 * flexibility no caller had asked for, and each one was a second place the citation could be
 * assembled and disagree with this one.
 *
 * `name` stays because selection is worth asserting separately from wording: a test proving the
 * right character was chosen should not fail when the sentence is rephrased.
 */
export interface Predecessor {
  readonly name: string;
  /** The file's sentence, in the institution's voice and addressed to nobody. */
  readonly phrase: string;
}

/**
 * The most senior character on file other than the one in hand, or null when there is nobody.
 *
 * Pure: it takes the roster rather than reading it, so a storage failure is the caller's problem and
 * an absent roster is simply nobody rather than an error. Ties resolve alphabetically, so two
 * characters at the same level cannot make the citation depend on key order.
 */
export function predecessorFor(
  roster: Record<string, CharacterSheet>,
  currentName: string,
): Predecessor | null {
  let best: CharacterSheet | null = null;

  for (const name of Object.keys(roster)) {
    // `hasOwn` rather than a bare read, the same guard the caseload tally carries: a roster is an
    // imported file, and a key inherited from Object.prototype returns a function rather than
    // undefined.
    if (!Object.hasOwn(roster, name)) continue;
    const sheet = roster[name];
    if (!sheet || sheet.Traits.Name === currentName) continue;
    if (!best
      || sheet.Traits.Level > best.Traits.Level
      || (sheet.Traits.Level === best.Traits.Level && sheet.Traits.Name < best.Traits.Name)) {
      best = sheet;
    }
  }

  if (!best) return null;
  const { Name, Race, Class, Level } = best.Traits;
  return {
    name: Name,
    // No verb for what happened to them, because nothing knows. They have not retired or died; they
    // have not been loaded lately, which is not a fate and must not be written as one.
    phrase: `This file continues one opened for ${Name}, ${Race} ${Class}, last recorded at level ${Level}.`,
  };
}
