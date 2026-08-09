import { describe, expect, it } from 'vitest';
import { EXHIBIT_LINES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';
import { EMPTY_COMMENDATIONS, finestExhibit, type Commendations } from '../../state/commendations';

/**
 * A benchmark from a ledger that outlives everyone citing it.
 *
 * Equipment is never sold — it vanishes by being overwritten, a better breastplate replacing the one
 * in the slot — and `commendations.exhibit` is the only thing anywhere that remembers it existed.
 * That ledger spans every character the file has held, so the guild is citing a standard set by
 * somebody who may not be the hero, in a slot that may hold something else entirely now.
 *
 * What the lane may not say is what became of it. The ledger records a name, a slot and a quality,
 * and nothing about where the thing is or who wore it — the same restraint the predecessor citation
 * keeps, for the same reason: a line inventing an ending is inventing a fact.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;

const ledger = (exhibit: Commendations['exhibit']): Commendations => ({ ...EMPTY_COMMENDATIONS, exhibit });

// Two entries so selection is worth asserting. The Gauntlets are finer and must win, and every base
// noun here comes from its own slot's vocabulary — the analyser reads a different table per slot, so
// a Hauberk noun filed under Gauntlets resolves to nothing at all.
const LEDGER = ledger({
  Gauntlets: { name: '+9 Bonded Signing Authority', label: 'legendary', quality: 40 },
  Helm: { name: '+1 Lapsed Lanyard', label: 'questionable', quality: 2 },
});

const linesOf = (memory: Parameters<typeof projectAmbient>[2], tasks = 3000) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task, memory)[0]);

const exhibitLines = (memory: Parameters<typeof projectAmbient>[2]) =>
  linesOf(memory).filter((entry) => entry?.sceneId.includes(':exhibit'));

describe('the finest thing on file, resolved', () => {
  it('picks the highest quality across slots, not whichever slot came first', () => {
    // `EQUIP_SLOTS` puts Helm before Gauntlets, so a version ranking by key order would pick the
    // lanyard — an ordering fact rather than an observation about the ledger.
    expect(finestExhibit(LEDGER)).toEqual({ slot: 'Gauntlets', base: 'Signing Authority' });
  });

  it('skips an entry whose base noun the analyser cannot read, rather than quoting the raw name', () => {
    // The same rule `fileLoadout` follows: an item with no catalogued noun has no bare noun to
    // quote, and handing the generated string to a chatter line would put an assessor's mark in a
    // bank asserted to carry no figures.
    const unreadable = ledger({ Weapon: { name: '+7 Nonesuch Contrivance', label: 'legendary', quality: 99 } });
    expect(finestExhibit(unreadable)).toBeNull();

    const mixed = ledger({ ...unreadable.exhibit, Helm: { name: '+1 Lapsed Lanyard', label: 'questionable', quality: 2 } });
    expect(finestExhibit(mixed)?.base).toBe('Lanyard');
  });

  it('is null for a fresh ledger, which is every ledger until something is equipped', () => {
    expect(finestExhibit(EMPTY_COMMENDATIONS)).toBeNull();
  });
});

describe('the guild cites a standard nobody can produce', () => {
  it('reaches the lane, which every assertion below depends on', () => {
    expect(exhibitLines({ commendations: LEDGER }).length).toBeGreaterThan(0);
  });

  it('quotes the bare noun and the slot it was set in', () => {
    const spoken = exhibitLines({ commendations: LEDGER });
    expect(spoken.some((entry) => entry!.text.includes('Signing Authority'))).toBe(true);
    for (const entry of spoken) {
      expect(entry!.text, entry!.text).not.toMatch(/\{exhibit(Slot)?\}/);
      // The assessor's mark must never survive into a line. This is the failure the bare noun exists
      // to prevent, and it would be invisible without a name carrying one.
      expect(entry!.text, entry!.text).not.toContain('+9');
      expect(entry!.text, entry!.text).not.toContain('Lanyard');
    }
    expect(spoken.some((entry) => entry!.text.includes('Gauntlets'))).toBe(true);
  });

  it('says nothing about what became of it, because the ledger does not know', () => {
    // It may still be worn, it may have been overwritten, and it may have belonged to a character
    // three heroes ago. The ledger records a name, a slot and a quality — no fate and no owner — so
    // a line claiming any of those would be asserting state nothing computed.
    for (const { text } of EXHIBIT_LINES) {
      expect(text, text).not.toMatch(/\blost\b|\bdestroyed\b|\bretired\b|\bgone\b|\bsold\b|\bno longer exists\b/i);
      expect(text, text).not.toMatch(/\bbelonged\b|\bwore\b|\bhero\b|\bformer\b|\bpredecessor\b/i);
    }
  });

  it('states no figure, including the quality it ranked by', () => {
    for (const { text } of EXHIBIT_LINES) expect(text, text).not.toMatch(/\d/);
  });

  it('falls back on an empty ledger and on no ledger at all', () => {
    for (const memory of [{}, { commendations: EMPTY_COMMENDATIONS }]) {
      const entries = linesOf(memory);
      expect(entries.filter(Boolean).length, JSON.stringify(memory)).toBeGreaterThan(2000);
      for (const entry of entries) {
        expect(entry?.sceneId, entry?.text).not.toContain(':exhibit');
        // The placeholders would read as sentences about a thing called "record" in a "slot".
        expect(entry?.text, entry?.text).not.toMatch(/the record\.|finest slot/);
      }
    }
  });
});
