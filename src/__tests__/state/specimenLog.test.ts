import { describe, expect, it, vi } from 'vitest';
import type { GameTransitionEvent } from '../../engine/transition';
import { MAX_PERSISTED_DESCRIPTION_LENGTH } from '../../data/limits';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { levelUpTime } from '../../engine/math';
import { advanceGame } from '../../engine/transition';
import {
  EMPTY_SPECIMEN_LOG, MAX_TRACKED_SPECIMENS, SPECIMEN_STORAGE_KEY,
  isEmpty, mergeSpecimens, readSpecimenLog, specimenIdentity, writeSpecimenLog,
} from '../../state/specimenLog';

const fakeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
};

const gained = (name: string, quantity = 1) => ({ type: 'item_gained' as const, name, quantity });
const equipped = (slot: string, name: string) => ({ type: 'equipment_gained' as const, slot, name } as never);

describe('specimen identity', () => {
  it('ignores quantity and time, as CONTEXT.md requires', () => {
    expect(specimenIdentity(gained('bent fork', 1))).toBe(specimenIdentity(gained('bent fork', 40)));
  });

  it('treats the same name in two slots as two findings', () => {
    expect(specimenIdentity(equipped('Helm', 'Boilerplate'))).not.toBe(specimenIdentity(equipped('Shield', 'Boilerplate')));
  });

  it('reports nothing for an event that acquires nothing', () => {
    expect(specimenIdentity({ type: 'level_gained', level: 3 } as never)).toBeNull();
  });
});

describe('specimen log', () => {
  it('counts variety, not volume', () => {
    const log = mergeSpecimens(EMPTY_SPECIMEN_LOG, [gained('nit tail'), gained('nit tail'), gained('bent fork')]);
    expect(log.specimens).toHaveLength(2);
    expect(isEmpty(EMPTY_SPECIMEN_LOG)).toBe(true);
  });

  it('returns the same object when nothing was new', () => {
    // The signal a caller uses to skip a write and a render, and a specimen is new only once.
    const log = mergeSpecimens(EMPTY_SPECIMEN_LOG, [gained('nit tail')]);
    expect(mergeSpecimens(log, [gained('nit tail')])).toBe(log);
    expect(mergeSpecimens(log, [])).toBe(log);
    // And for a batch that carries no acquisition at all, which is most of them. This is the case
    // the early return exists for: the ledger used to build a three-hundred-entry index before
    // discovering there was nothing to look up, which measured 6.5 us of a 6.9 us tick.
    expect(mergeSpecimens(log, [{ type: 'level_gained', level: 4 } as GameTransitionEvent])).toBe(log);
    expect(mergeSpecimens(log, [{ type: 'gold_received', amount: 7 } as GameTransitionEvent])).toBe(log);
  });

  it('refuses an identity longer than the schema will store', () => {
    // Untested until now, and found by mutation while moving the line: removing the length bound
    // changed nothing that any assertion could see. It matters because the schema caps a stored
    // specimen at `MAX_PERSISTED_DESCRIPTION_LENGTH`, so an over-long one is not merely ugly — it
    // makes the whole ledger fail validation on write, quietly, for the rest of the session.
    const log = { specimens: ['item:nit tail'] };
    const overlong = 'x'.repeat(MAX_PERSISTED_DESCRIPTION_LENGTH + 1);

    expect(mergeSpecimens(log, [gained(overlong)])).toBe(log);
    // And one that fits is still taken, so the bound is a bound rather than a refusal.
    expect(mergeSpecimens(log, [gained('bent fork')]).specimens).toContain('item:bent fork');
  });

  it('refuses to forget once it is full', () => {
    // Dropping an older specimen for a newer one would break the only claim this makes - "ever
    // seen" - so a full log stops recording rather than rotating.
    const many = Array.from({ length: MAX_TRACKED_SPECIMENS + 50 }, (_v, index) => gained(`specimen ${index}`));
    const log = mergeSpecimens(EMPTY_SPECIMEN_LOG, many);
    expect(log.specimens).toHaveLength(MAX_TRACKED_SPECIMENS);
    expect(log.specimens).toContain('item:specimen 0');
    expect(log.specimens).not.toContain(`item:specimen ${MAX_TRACKED_SPECIMENS + 49}`);
  });

  it('round-trips and degrades to nothing rather than failing', () => {
    const log = mergeSpecimens(EMPTY_SPECIMEN_LOG, [gained('bent fork'), equipped('Helm', 'Boilerplate')]);
    const storage = fakeStorage();
    writeSpecimenLog(storage, log);
    expect(readSpecimenLog(storage)).toEqual(log);

    expect(readSpecimenLog(undefined)).toEqual(EMPTY_SPECIMEN_LOG);
    expect(readSpecimenLog(fakeStorage({ [SPECIMEN_STORAGE_KEY]: 'not json' }))).toEqual(EMPTY_SPECIMEN_LOG);
    expect(readSpecimenLog(fakeStorage({ [SPECIMEN_STORAGE_KEY]: '{"specimens":[""]}' }))).toEqual(EMPTY_SPECIMEN_LOG);
    expect(readSpecimenLog({ getItem: () => { throw new Error('denied'); } })).toEqual(EMPTY_SPECIMEN_LOG);
  });

  it('does not let a hostile file inflate the count with duplicates', () => {
    // The count is the one number this reports, so a file claiming the same specimen twice must
    // not read as two.
    const loaded = readSpecimenLog(fakeStorage({
      [SPECIMEN_STORAGE_KEY]: JSON.stringify({ specimens: ['item:fork', 'item:fork', 'item:spoon'] }),
    }));
    expect(loaded.specimens).toEqual(['item:fork', 'item:spoon']);
  });

  it('refuses an over-long payload before parsing it', () => {
    const parse = vi.spyOn(JSON, 'parse').mockImplementation(() => { throw new Error('unreached'); });
    const oversized = `{"padding":"${'x'.repeat(1_000_001)}"}`;
    expect(readSpecimenLog(fakeStorage({ [SPECIMEN_STORAGE_KEY]: oversized }))).toEqual(EMPTY_SPECIMEN_LOG);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('fills from real play', () => {
    // Driven through the engine: only it decides what is acquired, and a fixture would be
    // asserting my own idea of what an acquisition looks like.
    const rng = new RandomGenerator('specimens');
    let state = {
      character: createNewCharacter('Collector', 'Half Daemon', 'Incident Paladin', rng),
      progression: { experience: { currentSeconds: 0, maxSeconds: levelUpTime(1) }, completedTasks: 0, elapsedSeconds: 0 },
    };
    let log = EMPTY_SPECIMEN_LOG;
    for (let step = 0; step < 2 * 60 * 60 * 20; step += 1) {
      const result = advanceGame(state, 50, rng);
      state = result.state;
      log = mergeSpecimens(log, result.records.map(({ event }) => event));
    }
    expect(log.specimens.length).toBeGreaterThan(1);
    expect(log.specimens.some((entry) => entry.startsWith('equipment:'))).toBe(true);
    expect(new Set(log.specimens).size).toBe(log.specimens.length);
  });
});
