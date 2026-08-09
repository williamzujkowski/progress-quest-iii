import { describe, expect, it } from 'vitest';
import { SPECIMEN_LINES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';
import { EMPTY_SPECIMEN_LOG, itemSpecimens, type SpecimenLog } from '../../state/specimenLog';

/**
 * The collection record, which reached two surfaces as a count.
 *
 * A count is the least interesting thing about a collection. What the specimen log actually knows is
 * that somewhere in it is a rubber duck — everything the hero has ever held, once each, across every
 * character the file has held — and nobody had ever said so.
 *
 * The register is a lost-property office that is certain of its records and useless about its
 * shelves, which is exactly true of the ledger: it stores identities and no locations, quantities or
 * dates. A line implying it could produce the thing would be a line about a feature it does not have.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;

const log = (specimens: string[]): SpecimenLog => ({ specimens });

// Equipment first, so a lane that took the head of the raw list would quote an assessor's mark.
const MIXED = log(['equipment:Weapon:+3 Sharp Rock', 'item:rubber duck', 'item:Off-Books Tally of Compliance']);

const linesOf = (memory: Parameters<typeof projectAmbient>[2], tasks = 3000) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task, memory)[0]);

const specimenLines = (memory: Parameters<typeof projectAmbient>[2]) =>
  linesOf(memory).filter((entry) => entry?.sceneId.includes(':specimen'));

describe('the archive is asked after one thing at a time', () => {
  it('reaches the lane, which every assertion below depends on', () => {
    expect(specimenLines({ specimens: MIXED }).length).toBeGreaterThan(0);
  });

  it('asks only after inventory, never after a generated equipment name', () => {
    // An equipment specimen is keyed on its full generated name — `+3 Sharp Rock` — and the chatter
    // is asserted to quote no figures. Inventory names carry no assessor's mark, so they need no
    // resolving; equipment would, and the joke wants a paperclip rather than a hauberk anyway.
    expect(itemSpecimens(MIXED)).toEqual(['rubber duck', 'Off-Books Tally of Compliance']);

    for (const entry of specimenLines({ specimens: MIXED })) {
      expect(entry!.text, entry!.text).not.toContain('Sharp Rock');
      expect(entry!.text, entry!.text).not.toMatch(/\+\d|\bequipment:/);
      expect(entry!.text, entry!.text).not.toContain('{specimen}');
      expect(entry!.text, entry!.text).not.toContain('the article');
    }
    expect(specimenLines({ specimens: MIXED }).some((entry) => entry!.text.includes('rubber duck'))).toBe(true);
  });

  it('strips the prefix without rewriting the name', () => {
    // `item:rubber duck` is `rubber duck` everywhere else, lower case and all. Boring items are
    // lower case and generated ones are title case, and the lines use a definite article so both
    // read correctly without the bank guessing between "a" and "an".
    for (const entry of specimenLines({ specimens: MIXED })) {
      expect(entry!.text, entry!.text).not.toContain('item:');
    }
    for (const { text } of SPECIMEN_LINES) expect(text, text).toMatch(/the \{specimen\}/i);
  });

  it('claims nothing the ledger does not record', () => {
    // Identities only — no locations, no quantities, no dates. A line offering to fetch the thing,
    // or saying when it was seen, would describe a feature this ledger deliberately lacks.
    for (const { text } of SPECIMEN_LINES) {
      expect(text, text).not.toMatch(/\d/);
      expect(text, text).not.toMatch(/\bshelf [A-Z0-9]|\blast (?:seen|held) on\b|\bwe can (?:fetch|retrieve)\b/i);
    }
  });

  it('survives an empty collection instead of throwing on the draw', () => {
    // A live crash, not a hypothetical: `stableChoice` throws on a length of zero rather than
    // returning an index, so the substitution has to be guarded *before* the draw. A `?? 'article'`
    // after it would never have been reached. A fresh save has held nothing, which makes this the
    // ordinary first state rather than an edge.
    for (const memory of [{}, { specimens: EMPTY_SPECIMEN_LOG }, { specimens: log(['equipment:Weapon:+3 Sharp Rock']) }]) {
      const entries = linesOf(memory);
      expect(entries.filter(Boolean).length, JSON.stringify(memory)).toBeGreaterThan(2000);
      for (const entry of entries) {
        expect(entry?.sceneId, entry?.text).not.toContain(':specimen');
        expect(entry?.text, entry?.text).not.toContain('article');
      }
    }
  });

  it('asks after one thing per scene rather than a different one per clause', () => {
    // Two lines quote `{specimen}` more than once between them; a scene that redrew per occurrence
    // would be asking after two objects in one breath.
    const asked = specimenLines({ specimens: log(['item:paperclip', 'item:rubber duck', 'item:egg timer']) });
    expect(asked.length).toBeGreaterThan(0);
    for (const entry of asked) {
      const named = ['paperclip', 'rubber duck', 'egg timer'].filter((name) => entry!.text.includes(name));
      expect(named.length, entry!.text).toBe(1);
    }
  });
});
