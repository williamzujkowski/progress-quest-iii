// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import {
  MAX_ROSTER_ENTRIES,
  MAX_ROSTER_SERIALIZED_LENGTH,
  loadRoster,
  removeFromRoster,
  saveToRoster,
} from '../../state/saveManager';

/**
 * A crafted roster value used to be unrecoverable, and it cost about four kilobytes.
 *
 * The per-entry case was fixed once already: one unreadable character hid every valid one beside
 * it, and because `removeFromRoster` reads before it deletes, the only cleanup control in the app
 * could not clear the thing blocking it. The entry cap then preserved that failure exactly, one
 * level up — it refused the *whole map* on the hundred-and-first key, so a hundred junk entries
 * hid a real character and blocked Delete just the same.
 *
 * Neither size guard fires: the payload is far under `MAX_ROSTER_SERIALIZED_LENGTH` and under
 * `MAX_STORED_PAYLOAD_LENGTH`, which is what made it cheap. A legitimate player cannot reach the
 * state, because `saveToRoster` refuses to write past the cap — it needs one attacker-controlled
 * write, which a shared origin, a kiosk browser, or a future build bug all supply.
 *
 * The invariant under test is the one this file's own doc comment states: there must always be an
 * in-app way back.
 */

const ROSTER_KEY = 'progquest_roster_v1';

afterEach(() => localStorage.clear());

const hero = (name: string) => createNewCharacter(name, 'Half Daemon', 'Robot Monk', new RandomGenerator(name));

/** One real character, then enough junk keys to carry the map past the cap. */
const wedged = (junkCount: number) => {
  const real = hero('Survivor');
  const entries: Record<string, unknown> = { Survivor: real };
  for (let index = 0; index < junkCount; index += 1) entries[`junk${index}`] = { not: 'a character' };
  const raw = JSON.stringify(entries);
  localStorage.setItem(ROSTER_KEY, raw);
  return { real, raw };
};

describe('a roster carried past its cap still has a way back', () => {
  it('is the cheap payload it looks like, so no size guard is doing this work', () => {
    const { raw } = wedged(MAX_ROSTER_ENTRIES + 1);

    // Stated so a future reader does not assume the length guard covers this. It does not, and
    // that is the whole reason the entry cap was load-bearing.
    expect(raw.length).toBeLessThan(MAX_ROSTER_SERIALIZED_LENGTH / 10);
  });

  it('still shows the characters that parse', () => {
    const { real } = wedged(MAX_ROSTER_ENTRIES + 1);

    const loaded = loadRoster();

    expect(loaded.ok, loaded.ok ? '' : loaded.error.message).toBe(true);
    expect(loaded.ok && Object.keys(loaded.value)).toContain(real.Traits.Name);
  });

  it('lets the player delete the entries that are blocking it', () => {
    // The property that was missing. Delete reads before it deletes, so a read that refused the
    // whole map made the only cleanup control in the app unable to clear what was blocking it.
    wedged(MAX_ROSTER_ENTRIES + 1);

    const removed = removeFromRoster('junk0');

    expect(removed.ok, removed.ok ? '' : removed.error.message).toBe(true);
    const after = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.hasOwn(after, 'junk0')).toBe(false);
    expect(Object.hasOwn(after, 'Survivor'), 'deleting junk took the real character with it').toBe(true);
  });

  it('keeps every unreadable entry it did not delete, rather than quietly dropping them', () => {
    /*
     * The other half of the guarantee, and the reason this is not simply a truncating read: the
     * bag is what every writer serialises, so an entry dropped here would survive exactly until the
     * player's next save and then be gone. Recovering from a bad roster must not silently delete
     * what it could not parse.
     */
    wedged(MAX_ROSTER_ENTRIES + 1);

    expect(removeFromRoster('junk0').ok).toBe(true);
    const after = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '{}') as Record<string, unknown>;

    expect(Object.keys(after)).toHaveLength(MAX_ROSTER_ENTRIES + 1);
    expect(Object.hasOwn(after, `junk${MAX_ROSTER_ENTRIES}`), 'an entry past the cap was dropped').toBe(true);
  });

  it('still refuses to create a character past the cap', () => {
    // The cap is unchanged where it is a policy about the player's own roster. What changed is that
    // it no longer decides whether a roster can be read at all.
    const roster: Record<string, unknown> = {};
    for (let index = 0; index < MAX_ROSTER_ENTRIES; index += 1) {
      const filler = hero(`Filler ${index}`);
      roster[filler.Traits.Name] = filler;
    }
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));

    const saved = saveToRoster(hero('One Too Many'));

    expect(saved.ok).toBe(false);
    expect(!saved.ok && saved.error.code).toBe('roster_too_large');
  });
});
