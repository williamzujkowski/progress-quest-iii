import { describe, expect, it } from 'vitest';
import { EMPTY_CASELOAD, MAX_TRACKED_TARGETS, describeSpan, mergeRecords, readCaseload, writeCaseload } from '../../state/caseload';
import type { GamePresentationSnapshot, GameTransitionEvent, GameTransitionRecord } from '../../engine/transition';

/**
 * The dated register. ADR 0011 settles what a date is here — the act ordinal, because there is no
 * wall clock a projection asserted byte-stable under a throwing `Date.now` spy could reach for — and
 * why it is global.
 */

const closure = (act: number, target: string): GameTransitionRecord => ({
  event: { type: 'quest_completed', description: `Close the matter of ${target}` } as GameTransitionEvent,
  post: {
    hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
    act,
    completedTask: 'kill',
    nextTask: 'kill',
    completedTasks: 100 + act,
    elapsedSeconds: 4000,
    completedQuest: { kind: 'exterminate', target },
  } as GamePresentationSnapshot,
});

describe('the register dates what the docket counts', () => {
  it('opens on the first closure and follows the last', () => {
    const filed = mergeRecords(EMPTY_CASELOAD, [closure(2, 'Gnoll|2|collar'), closure(5, 'Gnoll|2|collar'), closure(6, 'Gnoll|2|collar')]);

    expect(filed.targetActs['Gnoll|2|collar']).toEqual({ first: 2, last: 6 });
    expect(filed.targets['Gnoll|2|collar'], 'and the count it sits beside still counts').toBe(3);
  });

  it('never walks backwards, however the batch is ordered', () => {
    // A batch can carry records from more than one act, and a ledger carried across characters can
    // meet a hero who is further back than the file is. `first` is written once and `last` only
    // moves forward, which is what keeps the register a statement about the past rather than a
    // status that could be lost.
    const forward = mergeRecords(EMPTY_CASELOAD, [closure(3, 'Imp'), closure(9, 'Imp')]);
    const backward = mergeRecords(forward, [closure(1, 'Imp')]);

    expect(backward.targetActs['Imp']).toEqual({ first: 3, last: 9 });
  });

  it('leaves no date behind for a target the bound dropped', () => {
    // The two maps are bounded by the same rule, so they have to be bounded by the same decision. A
    // span outliving its count is a date for something the file no longer says happened.
    const records = Array.from({ length: MAX_TRACKED_TARGETS + 12 }, (_unused, index) =>
      // Descending counts, so the low-numbered targets are the ones the bound keeps.
      Array.from({ length: MAX_TRACKED_TARGETS + 12 - index }, () => closure(index + 1, `Target ${index}`))).flat();
    const filed = mergeRecords(EMPTY_CASELOAD, records);

    expect(Object.keys(filed.targets).length).toBeLessThanOrEqual(MAX_TRACKED_TARGETS);
    expect(Object.keys(filed.targetActs).toSorted()).toEqual(Object.keys(filed.targets).toSorted());
  });

  it('survives a round trip through storage, and a ledger that predates it', () => {
    const filed = mergeRecords(EMPTY_CASELOAD, [closure(2, 'Gnoll'), closure(7, 'Gnoll')]);
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };

    writeCaseload(storage, filed);
    expect(readCaseload(storage).targetActs['Gnoll']).toEqual({ first: 2, last: 7 });

    // A file on disk is chosen by whoever holds the disk, so it can carry more spans than the merge
    // path would ever produce, and spans for targets it does not even count. The bound is applied on
    // the way in for the same reason it already is for the counts — and applied *after* the counts
    // are bounded, or the two disagree about which fifty targets the file is about.
    store.set('progquest_caseload_v1', JSON.stringify({
      kinds: { fetch: 3 },
      targets: Object.fromEntries(Array.from({ length: MAX_TRACKED_TARGETS + 15 }, (_unused, index) => [`Target ${index}`, index + 1])),
      targetActs: {
        ...Object.fromEntries(Array.from({ length: MAX_TRACKED_TARGETS + 15 }, (_unused, index) => [`Target ${index}`, { first: 1, last: index + 1 }])),
        'Never Counted': { first: 3, last: 4 },
      },
    }));
    const hostile = readCaseload(storage);
    expect(Object.keys(hostile.targets).length).toBeLessThanOrEqual(MAX_TRACKED_TARGETS);
    expect(Object.keys(hostile.targetActs).toSorted()).toEqual(Object.keys(hostile.targets).toSorted());
    expect(hostile.targetActs['Never Counted']).toBeUndefined();

    // Every ledger already on disk is one of these: counts, no spans. It has to keep loading, and it
    // has to say nothing about dates rather than invent one.
    store.set('progquest_caseload_v1', JSON.stringify({ kinds: { fetch: 3 }, targets: { Gnoll: 3 } }));
    const older = readCaseload(storage);
    expect(older.targets['Gnoll']).toBe(3);
    expect(older.targetActs).toEqual({});
    expect(describeSpan(older.targetActs['Gnoll'])).toBeNull();
  });
});

describe('the register addresses nobody', () => {
  it('speaks of the file rather than of the reader', () => {
    // The load-bearing constraint of ADR 0011. The register is global — the same decision the counts
    // already carry — so an act ordinal in it may belong to a character retired several heroes ago.
    // A line saying "you last fought this in Act 7" is a claim about a person who may never have
    // been there; a line saying the file records it is true whoever is reading.
    for (const span of [{ first: 1, last: 1 }, { first: 2, last: 9 }, { first: 0, last: 4 }]) {
      const said = describeSpan(span) as string;
      expect(said, said).toMatch(/^The file /);
      expect(said.toLowerCase(), said).not.toMatch(/\byou\b|\byour\b|\bwe\b|\bour\b|\bhero\b/);
    }
  });

  it('does not claim a span when there was only ever one act', () => {
    // "Opens in Act 4 and last records this in Act 4" reads as a stretch of time that did not occur.
    expect(describeSpan({ first: 4, last: 4 })).toBe('The file records this only in Act 4.');
    expect(describeSpan({ first: 4, last: 9 })).toBe('The file opens in Act 4 and last records this in Act 9.');
  });

  it('says nothing at all when there is no date', () => {
    expect(describeSpan(undefined)).toBeNull();
  });
});
