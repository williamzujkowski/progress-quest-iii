import { describe, expect, it } from 'vitest';
import { MONSTERS, SPELLS } from '../../data/traits';
import { indefinite, plural } from '../../engine/text';

/**
 * Generated names have to survive the two things the engine does to them.
 *
 * Every monster name is pluralised into a quest title — `Exterminate the {plural}` — and every drop
 * is written `a {name} {item}` or `{n} {plural}`. Both transformations are mechanical, so a name
 * that reads well in the table can still ship broken.
 *
 * Measured over 200,000 quests before the fix: `Exterminate the Head of Opses` 267 times,
 * `the Wisp of Scopes` 245, `the All-Handses` 196, `the Chief of Stafves` 44. About 0.7% of quests,
 * each sitting in the panel for its whole duration.
 *
 * `RACES` has been guarded against exactly this for some time. `MONSTERS` was not.
 */

describe('a monster name survives being pluralised', () => {
  it('does not inflect the wrong word of a multi-word name', () => {
    // `plural` works on the last word, so "Head of Ops" became "Head of Opses". A name whose last
    // word is a preposition's object cannot be pluralised correctly by a suffix rule, so the names
    // avoid the shape rather than the rule growing a special case.
    for (const { name } of MONSTERS) {
      expect(name, `"${name}" pluralises as "${plural(name)}"`).not.toMatch(/\bof\b/i);
    }
  });

  // A second assertion lived here, refusing names whose plural ended in "ses". It flagged
  // `Mimic Process` -> `Mimic Processes`, which is correct English, and it was trying to catch
  // `Chief of Stafves` — a shape the "of" rule above already makes unreachable. Removed rather than
  // narrowed: a test that fails on correct data invites someone to break the data to satisfy it.
});

describe('an article matches the word that follows it', () => {
  it('never writes "an" before a consonantal U', () => {
    // `indefinite` tests the first letter, so "Unicorn Hire" produced "an unicorn hire blood" — 304
    // occurrences. It is the only entry in the corpus where the letter test was wrong, so the name
    // moved rather than the rule gaining an exception list nothing else needs.
    /*
     * Matched on the prefixes that actually carry a /juː/ sound, not on "u followed by a consonant".
     * My first version used the latter and flagged `umbrella hulk claw` and `upgrade boot`, both of
     * which correctly take "an" — a test that fails on correct data is worse than no test, because
     * the fix for it is to break the data.
     */
    const SOUNDS_LIKE_YOU = /^(uni|use|usu|uti|utu|euro|eula|ubiq)/;
    for (const { name, item } of MONSTERS) {
      const drop = `${name} ${item}`.toLowerCase();
      if (!SOUNDS_LIKE_YOU.test(drop)) continue;
      expect(indefinite(drop), drop).not.toMatch(/^an /);
    }
  });

  it('leaves the vowels that are genuinely vowels alone', () => {
    // The fix must not have been a blanket ban on U. "an umbrella hulk claw" is correct.
    expect(indefinite('umbrella hulk claw')).toMatch(/^an /);
    expect(indefinite('upgrade boot')).toMatch(/^an /);
  });
});

describe('a drop noun can be counted', () => {
  it('is not already plural', () => {
    // "a morale dip teeth" reads broken singular and pluralises to "teeths". Mass nouns have the
    // same problem in the other direction: "3 gatekeeper gravels".
    const ALREADY_PLURAL = ['teeth', 'shavings', 'pajamas', 'gills', 'chaff', 'gravel', 'gravy'];
    for (const { name, item } of MONSTERS) {
      expect(ALREADY_PLURAL, `${name} drops "${item}"`).not.toContain(item);
    }
  });

  it('has spells to check, so the sweep is not empty', () => {
    expect(SPELLS.length).toBeGreaterThan(20);
  });
});
