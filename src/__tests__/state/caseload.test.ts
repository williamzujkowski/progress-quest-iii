import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PERSISTED_DESCRIPTION_LENGTH, MAX_STORED_PAYLOAD_LENGTH } from '../../data/limits';
import type { GameTransitionRecord } from '../../engine/transition';
import {
  CASELOAD_STORAGE_KEY, EMPTY_CASELOAD, MAX_TRACKED_TARGETS,
  displayTarget, isEmpty, mergeRecords, mostLitigated, readCaseload, writeCaseload,
} from '../../state/caseload';

const fakeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    map,
  };
};

/** Only the two fields the tally reads; the rest of a snapshot is irrelevant to it. */
const closed = (kind?: string, target?: string): GameTransitionRecord => ({
  event: { type: 'quest_completed', description: 'something concluded' },
  post: { completedQuest: { ...(kind ? { kind } : {}), ...(target ? { target } : {}) } },
} as unknown as GameTransitionRecord);

const other = (): GameTransitionRecord => ({
  event: { type: 'level_gained', level: 4 },
  post: { completedQuest: { kind: 'fetch', target: 'Kickoff Meeting' } },
} as unknown as GameTransitionRecord);

afterEach(() => { vi.restoreAllMocks(); });

describe('caseload tally', () => {
  it('counts each kind the engine classified', () => {
    const tally = mergeRecords(EMPTY_CASELOAD, [
      closed('exterminate', 'Kickoff Meeting'), closed('exterminate', 'Interim Policy'), closed('placate', 'Duke'),
    ]);
    expect(tally.kinds).toEqual({ exterminate: 2, placate: 1 });
  });

  it('counts only quest completions, whatever else the snapshot carries', () => {
    // A snapshot describes the state after any event, so a level-up carries the quest that was
    // active at the time. Counting on the snapshot rather than the event would tally it twice.
    expect(mergeRecords(EMPTY_CASELOAD, [other(), other()])).toBe(EMPTY_CASELOAD);
  });

  it('returns the same object when nothing was filed', () => {
    // Identity is the signal the caller uses to skip a write and a render.
    const tally = mergeRecords(EMPTY_CASELOAD, [closed('fetch', 'Nit')]);
    expect(mergeRecords(tally, [other()])).toBe(tally);
    expect(mergeRecords(tally, [])).toBe(tally);
  });

  it('ignores a completion the engine did not classify', () => {
    // kind and target are both optional on the identity, and an unclassified quest is not a sixth
    // category. It is simply not evidence about the mix.
    expect(mergeRecords(EMPTY_CASELOAD, [closed(undefined, undefined)])).toBe(EMPTY_CASELOAD);
    expect(mergeRecords(EMPTY_CASELOAD, [closed('deliver', undefined)]).targets).toEqual({});
    expect(mergeRecords(EMPTY_CASELOAD, [closed(undefined, 'Kickoff Meeting')]).kinds).toEqual({});
  });

  it('ignores a kind the engine does not define', () => {
    expect(mergeRecords(EMPTY_CASELOAD, [closed('litigate', 'Kickoff Meeting')]).kinds).toEqual({});
  });

  it('names the most frequently filed against, breaking ties stably', () => {
    const tally = mergeRecords(EMPTY_CASELOAD, [
      closed('fetch', 'Kickoff Meeting'), closed('fetch', 'Kickoff Meeting'), closed('seek', 'Interim Policy'), closed('seek', 'Interim Policy'),
    ]);
    // Equal counts resolve alphabetically rather than by insertion, so a reload cannot change it.
    expect(mostLitigated(tally)).toEqual({ target: 'Interim Policy', count: 2 });
    expect(mostLitigated(EMPTY_CASELOAD)).toBeNull();
  });

  it('bounds the target map and keeps the most-filed when it overflows', () => {
    const records = Array.from({ length: MAX_TRACKED_TARGETS + 20 }, (_value, index) =>
      closed('fetch', `Target ${index}`));
    // One target filed far more often than any other must survive the trim.
    records.push(...Array.from({ length: 5 }, () => closed('fetch', 'Target 0')));

    const tally = mergeRecords(EMPTY_CASELOAD, records);
    expect(Object.keys(tally.targets)).toHaveLength(MAX_TRACKED_TARGETS);
    expect(tally.targets['Target 0']).toBe(6);
    expect(mostLitigated(tally)).toEqual({ target: 'Target 0', count: 6 });
  });

  it('is empty until something is filed', () => {
    expect(isEmpty(EMPTY_CASELOAD)).toBe(true);
    expect(isEmpty(mergeRecords(EMPTY_CASELOAD, [closed('seek', 'Amulet')]))).toBe(false);
  });

  it('tallies a target named after an inherited property like any other', () => {
    // An imported save picks this key. Reading the tally without hasOwn returns Object.prototype's
    // member rather than undefined, the nullish guard does not fire, and the count becomes NaN —
    // which the schema then refuses to persist, on every subsequent tick, silently.
    for (const inherited of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      const tally = mergeRecords(EMPTY_CASELOAD, [closed('exterminate', inherited), closed('exterminate', inherited)]);
      expect(tally.targets[inherited]).toBe(2);
    }
  });

  it('keeps persisting after a quest target named after an inherited property', () => {
    // The failure this guards is not the wrong number, it is the write that stops happening. A NaN
    // fails the schema on the way out, so the ledger goes unsaved for the rest of the session
    // while the caller retries it every tick — which is why this asserts through storage.
    const tally = mergeRecords(EMPTY_CASELOAD, [closed('fetch', 'constructor'), closed('fetch', 'Kickoff Meeting')]);
    const storage = fakeStorage();
    writeCaseload(storage, tally);
    expect(readCaseload(storage)).toEqual(tally);
  });
});

describe('caseload persistence', () => {
  it('round-trips through storage', () => {
    const tally = mergeRecords(EMPTY_CASELOAD, [closed('deliver', 'Bursar'), closed('deliver', 'Bursar')]);
    const storage = fakeStorage();
    writeCaseload(storage, tally);
    expect(readCaseload(storage)).toEqual(tally);
  });

  it('degrades to no casework rather than failing', () => {
    expect(readCaseload(undefined)).toEqual(EMPTY_CASELOAD);
    expect(readCaseload(fakeStorage())).toEqual(EMPTY_CASELOAD);
    expect(readCaseload(fakeStorage({ [CASELOAD_STORAGE_KEY]: 'not json' }))).toEqual(EMPTY_CASELOAD);
    expect(readCaseload(fakeStorage({ [CASELOAD_STORAGE_KEY]: '{"kinds":{"litigate":3}}' }))).toEqual(EMPTY_CASELOAD);
    expect(readCaseload(fakeStorage({ [CASELOAD_STORAGE_KEY]: '{"kinds":{"fetch":-1}}' }))).toEqual(EMPTY_CASELOAD);
    expect(readCaseload({ getItem: () => { throw new Error('denied'); } })).toEqual(EMPTY_CASELOAD);
  });

  it('loads a partially-filled tally rather than demanding every kind', () => {
    // zod treats an enum-keyed record as exhaustive; partialRecord is what makes a young tally
    // loadable at all.
    expect(readCaseload(fakeStorage({ [CASELOAD_STORAGE_KEY]: '{"kinds":{"fetch":3},"targets":{}}' })))
      // `targetActs` defaults in rather than being absent, which is what lets every ledger
      // written before the dated register keep loading without a migration.
      .toEqual({ kinds: { fetch: 3 }, targets: {}, targetActs: {} });
  });

  it('bounds a hostile target map on the way in', () => {
    // A file can hold more targets than the merge path would ever produce.
    const targets = Object.fromEntries(
      Array.from({ length: MAX_TRACKED_TARGETS + 100 }, (_value, index) => [`Target ${index}`, index + 1]),
    );
    const loaded = readCaseload(fakeStorage({
      [CASELOAD_STORAGE_KEY]: JSON.stringify({ kinds: {}, targets }),
    }));
    expect(Object.keys(loaded.targets)).toHaveLength(MAX_TRACKED_TARGETS);
    // The trim keeps the most-filed, so the highest count must survive it.
    expect(mostLitigated(loaded)?.count).toBe(MAX_TRACKED_TARGETS + 100);
  });

  it('refuses an over-long payload before parsing it', () => {
    const oversized = `{"padding":"${'x'.repeat(MAX_STORED_PAYLOAD_LENGTH)}"}`;
    const parse = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new Error('parse must not be reached for an oversized payload');
    });

    expect(readCaseload(fakeStorage({ [CASELOAD_STORAGE_KEY]: oversized }))).toEqual(EMPTY_CASELOAD);
    expect(parse).not.toHaveBeenCalled();
  });

  it('rejects a target name longer than the persistence envelope allows', () => {
    const long = 'T'.repeat(MAX_PERSISTED_DESCRIPTION_LENGTH + 1);
    expect(mergeRecords(EMPTY_CASELOAD, [closed('fetch', long)]).targets).toEqual({});
  });

  it('never lets a write interrupt play', () => {
    expect(() => writeCaseload({ setItem: () => { throw new Error('full'); } }, EMPTY_CASELOAD)).not.toThrow();
    expect(() => writeCaseload(undefined, EMPTY_CASELOAD)).not.toThrow();
  });
});

describe('against the engine rather than a fixture', () => {
  it('tallies quests the real engine classifies and closes', async () => {
    // The fixtures above assert the fold; this asserts the fold is being handed what it expects.
    // The kind lives on the snapshot rather than the event, which is exactly the sort of coupling
    // that a hand-built record would keep passing after the engine stopped honouring it.
    const { RandomGenerator } = await import('../../engine/prng');
    const { createNewCharacter } = await import('../../engine/sim');
    const { levelUpTime } = await import('../../engine/math');
    const { advanceGame } = await import('../../engine/transition');

    const rng = new RandomGenerator('caseload-engine');
    let state = {
      character: createNewCharacter('Docket', 'Half Daemon', 'Robot Monk', rng),
      progression: { experience: { currentSeconds: 0, maxSeconds: levelUpTime(1) }, completedTasks: 0, elapsedSeconds: 0 },
    };

    let tally = EMPTY_CASELOAD;
    for (let step = 0; step < 3 * 60 * 60 * 20; step += 1) {
      const result = advanceGame(state, 50, rng);
      state = result.state;
      tally = mergeRecords(tally, result.records);
    }

    const totalByKind = Object.values(tally.kinds).reduce((sum, count) => sum + count, 0);
    expect(totalByKind).toBeGreaterThan(0);
    // More than one kind, or the classification is not reaching the tally in any useful way.
    expect(Object.keys(tally.kinds).length).toBeGreaterThan(1);
    expect(mostLitigated(tally)).not.toBeNull();
    expect(Object.keys(tally.targets).length).toBeLessThanOrEqual(MAX_TRACKED_TARGETS);
  });
});

describe('naming a target that is filed under a composite key', () => {
  it('shows the name out of the engine key rather than the key', () => {
    // The engine identifies an extermination target as name|level|item, which keeps two monsters
    // of the same name apart and is not a sentence. Verified against real engine output:
    // "Nagging Bot|2|collar" is what actually lands in the tally.
    expect(displayTarget('Nagging Bot|2|collar')).toBe('Nagging Bot');
    expect(displayTarget('Status Worm|2|trode')).toBe('Status Worm');
  });

  it('leaves a plain name alone', () => {
    // Not every quest kind sets a composite target, and a name with no delimiter must survive.
    expect(displayTarget('Kickoff Meeting')).toBe('Kickoff Meeting');
  });

  it('falls back to the key rather than rendering nothing', () => {
    // A leading delimiter would otherwise produce an empty label, which reads as a broken panel.
    expect(displayTarget('|2|collar')).toBe('|2|collar');
    expect(displayTarget('')).toBe('');
  });
});
