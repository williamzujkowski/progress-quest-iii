import { describe, expect, it } from 'vitest';
import { ERA_LINES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';
import { EMPTY_CASELOAD, type Caseload } from '../../state/caseload';
import { namedEras } from '../../state/namedEras';

/**
 * The file's own periods, said aloud by somebody who will not stop saying them.
 *
 * `namedEras` turns the dated register into "the Gnoll years, Acts 3 through 7" — two figures the
 * register already holds, with a name attached — and it reached a document and one console line.
 * Read as a document that is grand. Said at a kettle it is a bore, and the bore is the joke.
 *
 * Two things the lane may not do. It may not quote the ordinals: the service record prints the dated
 * phrase and prints it properly, and assembling those figures a second time is how two surfaces start
 * disagreeing about one period. And it may not address anybody — ADR 0011, because an act ordinal in
 * these ledgers may belong to a character retired several heroes ago, so the file may describe its
 * own periods but may not tell anyone they lived through them.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;

// Three matters: one spanning five acts, one spanning three, one confined to a single act.
//
// The middle one is load-bearing. With only a long span and a single-act matter, `namedEras` returns
// exactly one era and every way of picking from that list agrees — so a lane taking the last entry
// rather than the longest would have passed. Two nameable periods of different lengths is the
// smallest fixture that can tell those apart.
const CASELOAD: Caseload = {
  ...EMPTY_CASELOAD,
  targets: { 'Gnoll|2|hide': 31, 'Rat|1|tail': 12, 'Nit|1|tail': 4 },
  targetActs: {
    'Gnoll|2|hide': { first: 3, last: 7 },
    'Rat|1|tail': { first: 1, last: 3 },
    'Nit|1|tail': { first: 5, last: 5 },
  },
};

const linesOf = (memory: Parameters<typeof projectAmbient>[2], tasks = 3000) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task, memory)[0]);

const eraLines = (memory: Parameters<typeof projectAmbient>[2]) =>
  linesOf(memory).filter((entry) => entry?.sceneId.includes(':era'));

describe('the guild will not stop mentioning the Gnoll years', () => {
  it('reaches the lane, which every assertion below depends on', () => {
    expect(eraLines({ caseload: CASELOAD }).length).toBeGreaterThan(0);
  });

  it('names the longest period the file can name, not the most recent matter', () => {
    // `namedEras` sorts by span and the lane takes the head. A version taking the last entry names
    // the Rat instead — a real period, and the wrong one.
    expect(namedEras(CASELOAD).map(({ name }) => name)).toEqual(['Gnoll', 'Rat']);
    const spoken = eraLines({ caseload: CASELOAD });
    for (const entry of spoken) {
      expect(entry!.text, entry!.text).toContain('Gnoll');
      // The Rat names a real period and is the wrong one; the Nit names none at all.
      expect(entry!.text, entry!.text).not.toContain('Rat');
      expect(entry!.text, entry!.text).not.toContain('Nit');
    }
  });

  it('quotes no ordinal, so the dated phrase stays assembled in one place', () => {
    // `namedEras` also returns "the Gnoll years, Acts 3 through 7", which the service record renders.
    // A chatter line repeating those figures would be a second assembly of the same two numbers.
    for (const { text } of ERA_LINES) expect(text, text).not.toMatch(/\d|\bAct\b|\bActs\b/);
    for (const entry of eraLines({ caseload: CASELOAD })) {
      expect(entry!.text, entry!.text).not.toMatch(/Acts? \d/);
    }
  });

  it('addresses nobody, which is ADR 0011 rather than a preference', () => {
    // An act ordinal in these ledgers may belong to a character retired several heroes ago. The file
    // may describe its own periods; it may not tell anybody they lived through them.
    for (const { text } of ERA_LINES) {
      expect(text, text).not.toMatch(/\byou\b|\byour\b|\bhero\b/i);
    }
  });

  it('stays away when nothing spans more than one act, and when there is no caseload', () => {
    // One act is a period the way one day is an era. A caseload of single-act matters names nothing,
    // which is the ordinary state of a young file.
    const young: Caseload = { ...EMPTY_CASELOAD, targets: { 'Nit|1|tail': 4 }, targetActs: { 'Nit|1|tail': { first: 5, last: 5 } } };
    expect(namedEras(young)).toHaveLength(0);

    for (const memory of [{}, { caseload: EMPTY_CASELOAD }, { caseload: young }]) {
      const entries = linesOf(memory);
      expect(entries.filter(Boolean).length, JSON.stringify(memory)).toBeGreaterThan(2000);
      for (const entry of entries) {
        expect(entry?.sceneId, entry?.text).not.toContain(':era');
        expect(entry?.text, entry?.text).not.toContain('intervening');
      }
    }
  });
});
