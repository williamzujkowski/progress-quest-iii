import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../data/traits';
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

    /*
     * Stated as a property of the table, because that is where the fix lives.
     *
     * The loop this replaces read `if (!SOUNDS_LIKE_YOU.test(drop)) continue;` and then asserted.
     * Zero of the 232 monsters match — `Unicorn Hire` was the only one that ever did, and it was
     * renamed away — so every iteration hit the `continue`, the test executed no assertions at all,
     * and it would have passed with `indefinite` deleted outright while still reading in the report
     * as a guarantee about consonantal U.
     *
     * Rewritten as an emptiness claim rather than a conditional sweep, it says the true thing and
     * cannot go quiet: a drop noun that sounds like "you" must not be in the table, and adding one
     * fails here by name rather than by silence.
     */
    const offenders = MONSTERS
      .map(({ name, item }) => `${name} ${item}`.toLowerCase())
      .filter((drop) => SOUNDS_LIKE_YOU.test(drop));
    expect(offenders, 'the article rule is a letter test, so these have to be kept out of the table').toEqual([]);

    /*
     * And the limitation itself, recorded rather than assumed.
     *
     * `indefinite` still answers "an unicorn hire blood". That is deliberate — the note above says
     * the name moved rather than the rule gaining an exception list nothing else needs — so pinning
     * it is what keeps the guard above honest. If someone teaches the rule about /juː/, this fails,
     * and the emptiness claim can then be relaxed on purpose instead of by accident.
     */
    expect(indefinite('unicorn hire blood')).toBe('an unicorn hire blood');
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

  it('has drops to check, so the sweep is not empty', () => {
    // Pointed at the table this file actually sweeps. It used to assert `SPELLS.length`, and there
    // is no spell sweep here — `SPELLS` was imported for that line alone, so the guard against a
    // vacuous sweep was itself measuring the wrong thing and could not have caught the empty one
    // above it.
    expect(MONSTERS.length).toBeGreaterThan(20);
    expect(MONSTERS.every(({ item }) => item.length > 0)).toBe(true);
  });
});
