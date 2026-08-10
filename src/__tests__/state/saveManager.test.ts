// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRIME_STATS } from '../../data/traits';
import { MAX_FINITE_CHARACTER_LEVEL } from '../../engine/math';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { advanceGame } from '../../engine/transition';
import {
  MAX_PQW_INPUT_LENGTH,
  MAX_ROSTER_ENTRIES,
  MAX_ROSTER_SERIALIZED_LENGTH,
  decodePQWSave,
  encodePQWSave,
  loadMostRecentRosterCharacter,
  loadRoster,
  removeFromRoster,
  importToRoster,
  saveToRoster,
} from '../../state/saveManager';
import { characterSheetSchema, MAX_CHARACTER_NAME_LENGTH } from '../../state/schemas';
import { useGameStore } from '../../state/gameStore';

afterEach(() => {
  localStorage.clear();
});

function encodeTestValue(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('importing a character that is already in the roster', () => {
  // The gap this closes: saveToRoster's replace-by-name is correct for saving the character you
  // are playing, and the import path reached the same call, where a name collision means two
  // different characters instead of one. It was tested only for save-over-self, so the
  // destructive reading had no coverage at all.

  it('refuses rather than replacing, and leaves the stored character byte-identical', () => {
    const existing = createNewCharacter('Krg', 'Half Daemon', 'Robot Monk', 900);
    existing.Traits.Level = 300;
    expect(saveToRoster(existing)).toMatchObject({ ok: true });
    const before = localStorage.getItem('progquest_roster_v1');

    const incoming = createNewCharacter('Krg', 'Off-Prem Elf', 'Vermineer', 901);
    const result = importToRoster(incoming);

    expect(result).toMatchObject({ ok: false, error: { code: 'roster_name_taken' } });
    // Byte-identical, not merely "still a Krg": a partial write would satisfy a shallower check.
    expect(localStorage.getItem('progquest_roster_v1')).toBe(before);
    expect(loadRoster()).toMatchObject({ ok: true, value: { Krg: { Traits: { Level: 300 } } } });
  });

  it('re-imports an identical save of the stored character without refusing', () => {
    // Exporting your own character and importing the backup is what the feature is for, and it
    // replaces the entry with itself. Refusing there would be a false alarm, and a confirmation
    // that fires when nothing is at stake is one people learn to click through.
    const character = createNewCharacter('Krg', 'Half Daemon', 'Robot Monk', 905);
    expect(saveToRoster(character)).toMatchObject({ ok: true });

    expect(importToRoster(character)).toMatchObject({ ok: true });
  });

  it('still refuses when the stored character differs only slightly', () => {
    // The boundary the case above must not widen: same name, one field apart, still two different
    // characters and still a destructive replace.
    const stored = createNewCharacter('Krg', 'Half Daemon', 'Robot Monk', 906);
    stored.Traits.Level = 40;
    expect(saveToRoster(stored)).toMatchObject({ ok: true });

    const incoming = createNewCharacter('Krg', 'Half Daemon', 'Robot Monk', 906);
    incoming.Traits.Level = 39;
    expect(importToRoster(incoming)).toMatchObject({ ok: false, error: { code: 'roster_name_taken' } });
  });

  it('inserts when the name is free', () => {
    // Without this the refusal above would pass on a function that refused everything.
    const first = createNewCharacter('Borgfang', 'Half Daemon', 'Robot Monk', 902);
    expect(saveToRoster(first)).toMatchObject({ ok: true });

    const second = createNewCharacter('Gorzog', 'Off-Prem Elf', 'Vermineer', 903);
    expect(importToRoster(second)).toMatchObject({ ok: true });
    expect(loadRoster()).toMatchObject({ ok: true, value: { Borgfang: {}, Gorzog: {} } });
  });

  it('imports a character whose name matches an Object.prototype member', () => {
    // What this does and does not prove. It asserts the behaviour — a character called
    // constructor imports into an empty roster — and that is worth pinning.
    //
    // It does not distinguish `Object.hasOwn` from `in`, and the first version of this comment
    // wrongly claimed it did. readRoster builds the roster with Object.create(null), so there is
    // no prototype for `in` to walk and both readings agree. The guard uses Object.hasOwn anyway,
    // because it stays correct if that null prototype is ever lost, but a test cannot demonstrate
    // that while the prototype is absent.
    const inherited = createNewCharacter('constructor', 'Half Daemon', 'Robot Monk', 904);
    expect(importToRoster(inherited)).toMatchObject({ ok: true });
  });
});

/**
 * The encoded string, or a loud failure.
 *
 * `encodePQWSave` returns a result now: it validates against the same schema the importer applies,
 * so the export button cannot hand a player a file that `decodePQWSave` will refuse. Tests that
 * encode a legal sheet unwrap it here; the one that encodes an illegal one asserts the refusal
 * directly.
 */
const encodedOf = (sheet: Parameters<typeof encodePQWSave>[0]): string => {
  const result = encodePQWSave(sheet);
  if (!result.ok) throw new Error(`expected a legal sheet to encode: ${result.error.message}`);
  return result.value;
};

describe('Save Manager & Serialization', () => {
  it('encodes and decodes a character sheet to base64 .pqw format cleanly', () => {
    const originalChar = createNewCharacter('Base64Hero', 'Provisioned Ghosted Candidate', 'Interim Lunatic', 9999);
    const encoded = encodedOf(originalChar);

    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodePQWSave(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.Traits.Name).toBe('Base64Hero');
    expect(decoded.value.Traits.Race).toBe('Provisioned Ghosted Candidate');
    expect(decoded.value.Traits.Class).toBe('Interim Lunatic');
    expect(decoded.value.Stats.STR).toBe(originalChar.Stats.STR);
    expect(decoded.value.Quest).toEqual(originalChar.Quest);
    expect(decoded.value.Plot).toEqual(originalChar.Plot);
    expect(decoded.value.PendingTasks).toEqual(originalChar.PendingTasks);
  });

  it('preserves and resumes a partly consumed prologue through PQW and roster storage', () => {
    const character = createNewCharacter('MidpointHero', 'Provisioned Ghosted Candidate', 'Interim Lunatic', 9_997);
    const progression = { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 };
    const midpoint = advanceGame({ character, progression }, 7000, new RandomGenerator('unused-prologue-rng')).state;
    expect(midpoint.character.Task).toMatchObject({ type: 'prologue', elapsedMs: 5000 });

    const decoded = decodePQWSave(encodedOf(midpoint.character));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    saveToRoster(midpoint.character);
    const roster = loadRoster();
    expect(roster.ok).toBe(true);
    if (!roster.ok) return;
    const rosterCharacter = roster.value.MidpointHero;
    expect(rosterCharacter).toEqual(midpoint.character);

    const expected = advanceGame(midpoint, 23_000, new RandomGenerator('same-prologue-continuation'));
    for (const restored of [decoded.value, rosterCharacter]) {
      if (!restored) throw new Error('Expected the midpoint character in the roster');
      const resumed = advanceGame({ character: restored, progression: midpoint.progression }, 23_000, new RandomGenerator('same-prologue-continuation'));
      expect(resumed).toEqual(expected);
    }
  });

  it('preserves Unicode character names with the standards-based UTF-8 codec', () => {
    const originalChar = createNewCharacter('Éowyn 🛡️', 'Provisioned Ghosted Candidate', 'Interim Lunatic', 9998);

    const decoded = decodePQWSave(encodedOf(originalChar));

    expect(decoded).toMatchObject({ ok: true, value: { Traits: { Name: 'Éowyn 🛡️' } } });
  });

  it('returns a typed error for malformed base64', () => {
    expect(decodePQWSave('%%%INVALID_BASE64%%%')).toMatchObject({
      ok: false,
      error: { code: 'malformed_base64' },
    });
  });

  it('rejects base64 that decodes to malformed UTF-8', () => {
    const malformedUtf8 = btoa(String.fromCharCode(0xc3, 0x28));

    expect(decodePQWSave(malformedUtf8)).toMatchObject({
      ok: false,
      error: { code: 'malformed_base64' },
    });
  });

  it('returns a typed schema error for incomplete JSON', () => {
    const invalidJson = JSON.stringify({ Traits: { Name: 'Broken' } });
    const encoded = btoa(unescape(encodeURIComponent(invalidJson)));

    expect(decodePQWSave(encoded)).toMatchObject({
      ok: false,
      error: { code: 'invalid_schema' },
    });
  });

  it('rejects oversized input before attempting to decode it', () => {
    const decode = vi.spyOn(globalThis, 'atob');
    try {
      expect(decodePQWSave(' '.repeat(MAX_PQW_INPUT_LENGTH + 1))).toMatchObject({
        ok: false,
        error: { code: 'input_too_large' },
      });
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it('rejects syntactically valid saves with unreasonable collection sizes', () => {
    const character = createNewCharacter('Crowded', 'Off-Prem Elf', 'Vermineer', 303);
    character.Inventory = Array.from({ length: 5_001 }, (_, index) => ({ name: `Item ${index}`, qty: 1 }));

    // Refused on the way out as well as on the way in. This used to encode happily and be caught by
    // the importer, which is the whole defect: the file existed, looked like a save, and was dead.
    expect(encodePQWSave(character)).toMatchObject({ ok: false, error: { code: 'invalid_schema' } });
  });

  it('rejects unknown keys at every object boundary in the modern PQW v0 profile', () => {
    const character = createNewCharacter('StrictV0', 'Half Daemon', 'Robot Monk', 305);
    character.Spells = [{ name: 'Strictly Speaking', level: 1 }];
    character.Task.loot = { type: 'fixed', item: 'paperwork' };
    const candidates: unknown[] = [
      { ...character, version: 1 },
      { ...character, Traits: { ...character.Traits, Alias: 'Absolutely not' } },
      { ...character, Stats: { ...character.Stats, Luck: 99 } },
      { ...character, Equip: { ...character.Equip, Cape: 'Regrettable' } },
      { ...character, Inventory: [{ ...character.Inventory[0], taxable: true }] },
      { ...character, Spells: [{ ...character.Spells[0], tasteful: false }] },
      { ...character, Plot: { ...character.Plot, spoilers: true } },
      { ...character, Quest: { ...character.Quest, dignity: 0 } },
      { ...character, Task: { ...character.Task, overtime: true } },
      { ...character, Task: { ...character.Task, loot: { ...character.Task.loot, cursed: true } } },
      { ...character, Task: { ...character.Task, loot: { type: 'random', audited: false } } },
      { ...character, PendingTasks: [{ ...character.PendingTasks?.[0], improvised: true }] },
    ];

    for (const candidate of candidates) {
      expect(decodePQWSave(encodeTestValue(candidate))).toMatchObject({
        ok: false,
        error: { code: 'invalid_schema' },
      });
    }
  });

  it('rejects invalid progress and task relationships while accepting completed boundaries', () => {
    const character = createNewCharacter('RelationalV0', 'Half Daemon', 'Robot Monk', 306);
    const invalid: unknown[] = [
      { ...character, Quest: { ...character.Quest, maxProgress: 0 } },
      { ...character, Quest: { ...character.Quest, currentProgress: 6, maxProgress: 5 } },
      { ...character, Plot: { ...character.Plot, maxProgress: 0 } },
      { ...character, Plot: { ...character.Plot, currentProgress: 11, maxProgress: 10 } },
      { ...character, Task: { ...character.Task, elapsedMs: character.Task.durationMs + 1 } },
    ];

    for (const candidate of invalid) {
      expect(decodePQWSave(encodeTestValue(candidate))).toMatchObject({
        ok: false,
        error: { code: 'invalid_schema' },
      });
    }

    expect(decodePQWSave(encodeTestValue({
      ...character,
      Quest: { ...character.Quest, currentProgress: 5, maxProgress: 5 },
      Plot: { ...character.Plot, currentProgress: 10, maxProgress: 10 },
      Task: { ...character.Task, elapsedMs: character.Task.durationMs },
    }))).toMatchObject({ ok: true });
  });

  it('requires positive HP and MP maxima while retaining finite fractional compatibility', () => {
    const character = createNewCharacter('VitalV0', 'Half Daemon', 'Robot Monk', 307);

    for (const Stats of [
      { ...character.Stats, 'HP Max': 0 },
      { ...character.Stats, 'MP Max': -1 },
    ]) {
      expect(decodePQWSave(encodeTestValue({ ...character, Stats }))).toMatchObject({
        ok: false,
        error: { code: 'invalid_schema' },
      });
    }

    expect(decodePQWSave(encodeTestValue({
      ...character,
      Stats: { ...character.Stats, 'HP Max': 0.5, 'MP Max': 1.5 },
    }))).toMatchObject({ ok: true });
  });

  it('rejects non-finite numeric values at the direct schema boundary', () => {
    const character = createNewCharacter('FiniteV0', 'Half Daemon', 'Robot Monk', 308);

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(characterSheetSchema.safeParse({
        ...character,
        Stats: { ...character.Stats, STR: value },
      }).success).toBe(false);
    }
  });

  it('requires every prime stat to be a positive integer', () => {
    const character = createNewCharacter('PrimeV0', 'Half Daemon', 'Robot Monk', 309);

    for (const stat of PRIME_STATS) {
      for (const value of [0, -1, 1.5]) {
        expect(characterSheetSchema.safeParse({
          ...character,
          Stats: { ...character.Stats, [stat]: value },
        }).success).toBe(false);
      }
    }

    expect(characterSheetSchema.safeParse({
      ...character,
      Stats: { ...character.Stats, ...Object.fromEntries(PRIME_STATS.map((stat) => [stat, 1])) },
    }).success).toBe(true);
  });

  it('rejects duplicate exact inventory identities without normalizing accepted labels', () => {
    const character = createNewCharacter('InventoryV0', 'Half Daemon', 'Robot Monk', 310);

    for (const Inventory of [
      [{ name: 'Gold', qty: 0 }, { name: 'Nit tail', qty: 1 }, { name: 'Nit tail', qty: 2 }],
      [{ name: 'Gold', qty: 0 }, { name: '', qty: 1 }, { name: '', qty: 2 }],
    ]) {
      expect(decodePQWSave(encodeTestValue({ ...character, Inventory }))).toMatchObject({
        ok: false,
        error: { code: 'invalid_schema' },
      });
    }

    expect(decodePQWSave(encodeTestValue({
      ...character,
      Inventory: [{ name: 'Gold', qty: 0 }, { name: '', qty: 1 }, { name: 'nit tail', qty: 1 }, { name: 'Nit tail', qty: 1 }],
    }))).toMatchObject({ ok: true });
  });

  it('keeps an accepted high-level save loadable with finite runtime progression', () => {
    const character = createNewCharacter('Overflow', 'Off-Prem Elf', 'Vermineer', 304);
    character.Traits.Level = MAX_FINITE_CHARACTER_LEVEL + 1;

    const decoded = decodePQWSave(encodedOf(character));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    useGameStore.getState().startSession({ source: 'import', character: decoded.value });
    expect(useGameStore.getState().progression.experience.maxSeconds).toBe(Number.MAX_VALUE);
  });

  it('keeps generated character output compatible with the save contract', () => {
    const character = createNewCharacter('ContractHero', 'Half Daemon', 'Robot Monk', 404);
    expect(characterSheetSchema.safeParse(character).success).toBe(true);
  });

  it('accepts old sheets without a queue and rejects malformed pending sequences', () => {
    const character = createNewCharacter('SequenceContractHero', 'Half Daemon', 'Robot Monk', 408);
    const { PendingTasks: _pendingTasks, ...oldSheet } = character;
    const step = character.PendingTasks?.[0];
    if (!step) throw new Error('Expected the canonical prologue queue');

    expect(characterSheetSchema.safeParse(oldSheet).success).toBe(true);
    for (const PendingTasks of [
      [],
      [step],
      [{ ...step, elapsedMs: 1 }],
      [{ ...step, type: 'kill' }],
      [{ ...step, loot: { type: 'random' } }],
      Array.from({ length: 101 }, () => step),
      [
        { description: 'Loading', durationMs: 1000, elapsedMs: 0, type: 'act_marker' },
        step,
      ],
      [
        step,
        { description: 'Loading', durationMs: 1000, elapsedMs: 0, type: 'act_marker' },
        { description: 'Loading again', durationMs: 1000, elapsedMs: 0, type: 'act_marker' },
      ],
      [
        { ...step, type: 'cinematic' },
        { description: 'Loading', durationMs: 1000, elapsedMs: 0, type: 'act_marker' },
      ],
    ]) {
      expect(characterSheetSchema.safeParse({ ...character, PendingTasks }).success).toBe(false);
    }
    expect(characterSheetSchema.safeParse({ ...character, Task: { ...character.Task, type: 'kill' } }).success).toBe(false);
  });

  it('validates explicit fixed and random task loot without accepting blank items', () => {
    const character = createNewCharacter('LootContractHero', 'Half Daemon', 'Robot Monk', 405);

    expect(characterSheetSchema.safeParse({
      ...character,
      Task: { ...character.Task, loot: { type: 'random' } },
    }).success).toBe(true);
    expect(characterSheetSchema.safeParse({
      ...character,
      Task: { ...character.Task, loot: { type: 'fixed', item: '' } },
    }).success).toBe(false);
  });

  it('accepts optional typed quest metadata while preserving legacy quest saves', () => {
    const character = createNewCharacter('QuestMetadataHero', 'Half Daemon', 'Robot Monk', 406);
    const withMetadata = {
      ...character,
      Quest: {
        ...character.Quest,
        kind: 'exterminate' as const,
        target: 'Swamp Ticket|1|lilypad',
        targetIndex: 84,
        history: ['Old quest', character.Quest.description],
      },
    };

    expect(characterSheetSchema.safeParse(withMetadata).success).toBe(true);
    expect(characterSheetSchema.safeParse(character).success).toBe(true);
  });

  it('rejects quest metadata outside the bounded contract', () => {
    const character = createNewCharacter('InvalidQuestMetadata', 'Half Daemon', 'Robot Monk', 407);

    expect(characterSheetSchema.safeParse({
      ...character,
      Quest: { ...character.Quest, kind: 'unknown' },
    }).success).toBe(false);
    expect(characterSheetSchema.safeParse({
      ...character,
      Quest: { ...character.Quest, targetIndex: -1 },
    }).success).toBe(false);
    expect(characterSheetSchema.safeParse({
      ...character,
      Quest: { ...character.Quest, target: '' },
    }).success).toBe(false);
  });

  it('saves, loads, and removes character sheets from local storage roster', () => {
    const char1 = createNewCharacter('RosterHero1', 'Half Daemon', 'Robot Monk', 101);
    const char2 = createNewCharacter('RosterHero2', 'Off-Prem Elf', 'Vermineer', 202);

    saveToRoster(char1);
    saveToRoster(char2);

    const loaded = loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value['RosterHero1']).toBeDefined();
    expect(loaded.value['RosterHero2']).toBeDefined();

    removeFromRoster('RosterHero1');
    const updated = loadRoster();
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value['RosterHero1']).toBeUndefined();
    expect(updated.value['RosterHero2']).toBeDefined();
  });

  it('rejects a roster with too many entries before validating every sheet', () => {
    const roster = Object.fromEntries(Array.from({ length: MAX_ROSTER_ENTRIES + 1 }, (_, index) => [
      `Hero${index}`,
      createNewCharacter(`Hero${index}`, 'Half Daemon', 'Robot Monk', index + 1),
    ]));
    const raw = JSON.stringify(roster);
    expect(raw.length).toBeLessThan(MAX_ROSTER_SERIALIZED_LENGTH);
    localStorage.setItem('progquest_roster_v1', raw);

    expect(loadRoster()).toMatchObject({
      ok: false,
      error: { code: 'storage_corrupt' },
    });
  });

  it('rejects an oversized roster before parsing it', () => {
    const oversized = ' '.repeat(MAX_ROSTER_SERIALIZED_LENGTH + 1);
    localStorage.setItem('progquest_roster_v1', oversized);

    expect(loadRoster()).toMatchObject({
      ok: false,
      error: { code: 'storage_corrupt' },
    });
  });

  it('returns a typed failure when browser storage rejects a write', () => {
    const character = createNewCharacter('QuotaHero', 'Half Daemon', 'Robot Monk', 505);
    const existing = createNewCharacter('ExistingQuotaHero', 'Off-Prem Elf', 'Vermineer', 504);
    const originalRoster = JSON.stringify({ ExistingQuotaHero: existing });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    try {
      expect(saveToRoster(character)).toMatchObject({
        ok: false,
        error: { code: 'storage_full' },
      });
      expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
    } finally {
      setItem.mockRestore();
    }
  });

  it('returns a typed failure when the browser storage capability is denied', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    if (!descriptor) throw new Error('Expected a configurable localStorage property in jsdom.');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => { throw new DOMException('Denied', 'SecurityError'); },
    });

    try {
      expect(loadRoster()).toMatchObject({
        ok: false,
        error: { code: 'storage_unavailable' },
      });
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor);
    }
  });

  it('distinguishes a denied roster read from corrupt roster data', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new DOMException('Denied', 'SecurityError');
    });

    try {
      expect(loadRoster()).toMatchObject({
        ok: false,
        error: { code: 'storage_unavailable' },
      });
    } finally {
      getItem.mockRestore();
    }
  });

  it('preserves corrupt roster bytes instead of overwriting them', () => {
    const character = createNewCharacter('Preserver', 'Half Daemon', 'Robot Monk', 606);
    const corruptRoster = '{not-json';
    localStorage.setItem('progquest_roster_v1', corruptRoster);

    expect(saveToRoster(character)).toMatchObject({
      ok: false,
      error: { code: 'storage_corrupt' },
    });
    expect(localStorage.getItem('progquest_roster_v1')).toBe(corruptRoster);
  });

  it('treats an existing empty roster string as corrupt and preserves it', () => {
    const character = createNewCharacter('EmptyPreserver', 'Half Daemon', 'Robot Monk', 607);
    localStorage.setItem('progquest_roster_v1', '');

    expect(saveToRoster(character)).toMatchObject({
      ok: false,
      error: { code: 'storage_corrupt' },
    });
    expect(localStorage.getItem('progquest_roster_v1')).toBe('');
  });

  it('skips a roster entry whose storage key does not match the character name, and keeps it on disk', () => {
    const character = createNewCharacter('ActualName', 'Half Daemon', 'Robot Monk', 608);
    const mismatchedRoster = JSON.stringify({ Alias: character });
    localStorage.setItem('progquest_roster_v1', mismatchedRoster);

    // A key disagreeing with the name inside it is corruption this build cannot resolve, but it is
    // not evidence the entry is worthless — so it is skipped, not surfaced and not destroyed.
    expect(loadRoster()).toMatchObject({ ok: true });
    expect(Object.keys((loadRoster() as { value: Record<string, unknown> }).value)).toEqual([]);
    expect(localStorage.getItem('progquest_roster_v1')).toBe(mismatchedRoster);
  });

  it('skips an unreadable roster entry without hiding the valid ones or blocking a save', () => {
    // This is the shape a version skew takes: characterSheetSchema is .strict(), so a character
    // written by a newer build fails here purely for a field this one has never heard of.
    const alice = createNewCharacter('Alice', 'Half Daemon', 'Robot Monk', 610);
    const carol = createNewCharacter('Carol', 'Off-Prem Elf', 'Vermineer', 611);
    const broken = { Traits: { Name: 'Broken' } };
    const originalRoster = JSON.stringify({ Alice: alice, Broken: broken, Carol: carol });
    localStorage.setItem('progquest_roster_v1', originalRoster);

    const loaded = loadRoster();
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && Object.keys(loaded.value).sort()).toEqual(['Alice', 'Carol']);

    // The half that is easy to get wrong. Every writer re-serialises what it was handed, so
    // skipping alone would delete the unreadable character on the player's next save.
    const dave = createNewCharacter('Dave', 'Off-Prem Elf', 'Vermineer', 612);
    expect(saveToRoster(dave).ok).toBe(true);
    const persisted: Record<string, unknown> = JSON.parse(localStorage.getItem('progquest_roster_v1') ?? '{}');
    expect(Object.keys(persisted).sort()).toEqual(['Alice', 'Broken', 'Carol', 'Dave']);
    expect(persisted.Broken).toEqual(broken);

    // And the entry the player cannot see is still one they can ask to remove.
    expect(removeFromRoster('Broken').ok).toBe(true);
    expect(Object.keys(JSON.parse(localStorage.getItem('progquest_roster_v1') ?? '{}')).sort())
      .toEqual(['Alice', 'Carol', 'Dave']);
  });

  it('returns a generic typed failure when storage rejects a write for another reason', () => {
    const character = createNewCharacter('WriteFailure', 'Half Daemon', 'Robot Monk', 609);
    const existing = createNewCharacter('ExistingWriteHero', 'Off-Prem Elf', 'Vermineer', 608);
    const originalRoster = JSON.stringify({ ExistingWriteHero: existing });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Synthetic write failure');
    });

    expect(saveToRoster(character)).toMatchObject({
      ok: false,
      error: { code: 'storage_failed' },
    });
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
    setItem.mockRestore();
  });

  it('preserves the previous roster when deleting fails', () => {
    const existing = createNewCharacter('DeletePreserver', 'Off-Prem Elf', 'Vermineer', 612);
    const originalRoster = JSON.stringify({ DeletePreserver: existing });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Synthetic delete failure');
    });

    expect(removeFromRoster('DeletePreserver')).toMatchObject({
      ok: false,
      error: { code: 'storage_failed' },
    });
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
    setItem.mockRestore();
  });

  it('preserves the previous roster when serialization fails', () => {
    const existing = createNewCharacter('Existing', 'Off-Prem Elf', 'Vermineer', 610);
    const incoming = createNewCharacter('Incoming', 'Half Daemon', 'Robot Monk', 611);
    const originalRoster = JSON.stringify({ Existing: existing });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new TypeError('Synthetic serialization failure');
    });

    expect(saveToRoster(incoming)).toMatchObject({
      ok: false,
      error: { code: 'storage_failed' },
    });
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
    stringify.mockRestore();
  });

  it('stores prototype-like character names as ordinary roster keys', () => {
    const character = createNewCharacter('__proto__', 'Half Daemon', 'Robot Monk', 505);

    saveToRoster(character);

    const loaded = loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(Object.hasOwn(loaded.value, '__proto__')).toBe(true);
    expect(loaded.value['__proto__']?.Traits.Name).toBe('__proto__');
  });

  it('round-trips and removes constructor as an ordinary own roster key', () => {
    const character = createNewCharacter('constructor', 'Half Daemon', 'Robot Monk', 506);

    expect(saveToRoster(character)).toMatchObject({ ok: true });
    expect(Object.hasOwn(JSON.parse(localStorage.getItem('progquest_roster_v1') ?? '{}'), 'constructor')).toBe(true);

    const loaded = loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(Object.getPrototypeOf(loaded.value)).toBeNull();
    expect(loaded.value['constructor']?.Traits.Name).toBe('constructor');

    expect(removeFromRoster('constructor')).toMatchObject({ ok: true, value: {} });
    expect(Object.hasOwn(JSON.parse(localStorage.getItem('progquest_roster_v1') ?? '{}'), 'constructor')).toBe(false);
  });

  it('replaces an exact duplicate name with the latest complete sheet', () => {
    const first = createNewCharacter('Same Name', 'Half Daemon', 'Robot Monk', 507);
    const replacement = createNewCharacter('Same Name', 'Off-Prem Elf', 'Vermineer', 508);

    saveToRoster(first);
    expect(saveToRoster(replacement)).toMatchObject({ ok: true });

    const loaded = loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(Object.keys(loaded.value)).toEqual(['Same Name']);
    expect(loaded.value['Same Name']).toEqual(replacement);
  });

  it('returns the most recently saved roster character, including an updated identity', () => {
    const first = createNewCharacter('First Saved', 'Half Daemon', 'Robot Monk', 520);
    const second = createNewCharacter('Second Saved', 'Off-Prem Elf', 'Vermineer', 521);
    const updatedFirst = createNewCharacter('First Saved', 'Provisioned Ghosted Candidate', 'Interim Lunatic', 522);

    saveToRoster(first);
    saveToRoster(second);
    saveToRoster(updatedFirst);

    expect(loadMostRecentRosterCharacter()).toEqual({ ok: true, value: updatedFirst });
  });

  it('tracks recency independently of numeric-like roster names', () => {
    const named = createNewCharacter('Named First', 'Half Daemon', 'Robot Monk', 523);
    const numeric = createNewCharacter('2', 'Off-Prem Elf', 'Vermineer', 524);

    saveToRoster(named);
    saveToRoster(numeric);

    expect(loadMostRecentRosterCharacter()).toEqual({ ok: true, value: numeric });
  });

  it('restores the most recent remaining character after deleting the latest save', () => {
    const first = createNewCharacter('First', 'Half Daemon', 'Robot Monk', 525);
    const second = createNewCharacter('Second', 'Off-Prem Elf', 'Vermineer', 526);
    const updatedFirst = createNewCharacter('First', 'Provisioned Ghosted Candidate', 'Interim Lunatic', 527);
    const latest = createNewCharacter('Latest', 'Half Daemon', 'Robot Monk', 528);

    saveToRoster(first);
    saveToRoster(second);
    saveToRoster(updatedFirst);
    saveToRoster(latest);
    removeFromRoster('Latest');

    expect(loadMostRecentRosterCharacter()).toEqual({ ok: true, value: updatedFirst });
  });

  it('reports a partial failure when roster recency cannot be persisted', () => {
    const character = createNewCharacter('Partially Saved', 'Half Daemon', 'Robot Monk', 529);
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'progquest_roster_recent_v1') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      nativeSetItem.call(this, key, value);
    });

    try {
      const result = saveToRoster(character);
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'storage_full' },
      });
      expect(result).not.toMatchObject({ ok: true });
      expect(loadRoster()).toMatchObject({ ok: true, value: { 'Partially Saved': character } });
    } finally {
      setItem.mockRestore();
    }
  });

  it('recovers stale history after a partial delete at the roster limit', () => {
    for (let index = 0; index < MAX_ROSTER_ENTRIES; index += 1) {
      expect(saveToRoster(createNewCharacter(`Full Roster ${index}`, 'Half Daemon', 'Robot Monk', 600 + index))).toMatchObject({ ok: true });
    }
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'progquest_roster_recent_v1') throw new Error('Synthetic recency failure');
      nativeSetItem.call(this, key, value);
    });
    expect(removeFromRoster('Full Roster 99')).toMatchObject({ ok: false, error: { code: 'storage_failed' } });
    setItem.mockRestore();

    const replacement = createNewCharacter('Roster Replacement', 'Off-Prem Elf', 'Vermineer', 700);
    expect(saveToRoster(replacement)).toMatchObject({ ok: true });
    expect(loadMostRecentRosterCharacter()).toEqual({ ok: true, value: replacement });
  });

  it('keeps names that differ only by case as distinct roster identities', () => {
    saveToRoster(createNewCharacter('Hero', 'Half Daemon', 'Robot Monk', 509));
    saveToRoster(createNewCharacter('hero', 'Off-Prem Elf', 'Vermineer', 510));

    const loaded = loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(Object.keys(loaded.value)).toEqual(['Hero', 'hero']);
  });

  it('keeps existing object-shaped roster JSON compatible across the next save', () => {
    const legacyOne = createNewCharacter('Existing One', 'Half Daemon', 'Robot Monk', 511);
    const legacyTwo = createNewCharacter('Existing Two', 'Off-Prem Elf', 'Vermineer', 512);
    const originalRoster = JSON.stringify({ 'Existing One': legacyOne, 'Existing Two': legacyTwo });
    localStorage.setItem('progquest_roster_v1', originalRoster);

    const loaded = loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(Object.getPrototypeOf(loaded.value)).toBeNull();
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);

    const next = createNewCharacter('Next Save', 'Half Daemon', 'Robot Monk', 513);
    expect(saveToRoster(next)).toMatchObject({ ok: true });
    expect(Object.keys(JSON.parse(localStorage.getItem('progquest_roster_v1') ?? '{}'))).toEqual([
      'Existing One',
      'Existing Two',
      'Next Save',
    ]);
  });

  it('accepts a character name at the persisted length boundary', () => {
    const boundaryName = 'N'.repeat(MAX_CHARACTER_NAME_LENGTH);

    expect(saveToRoster(createNewCharacter(boundaryName, 'Half Daemon', 'Robot Monk', 514))).toMatchObject({ ok: true });
    expect(loadRoster()).toMatchObject({ ok: true, value: { [boundaryName]: { Traits: { Name: boundaryName } } } });
  });

  it('rejects an overlength character name without changing existing roster bytes', () => {
    const existing = createNewCharacter('ExistingName', 'Off-Prem Elf', 'Vermineer', 506);
    const originalRoster = JSON.stringify({ ExistingName: existing });
    localStorage.setItem('progquest_roster_v1', originalRoster);

    const overlength = createNewCharacter('N'.repeat(MAX_CHARACTER_NAME_LENGTH + 1), 'Half Daemon', 'Robot Monk', 515);

    expect(saveToRoster(overlength)).toMatchObject({
      ok: false,
      error: { code: 'invalid_schema' },
    });
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
  });

  it('validates the complete sheet before a roster write and preserves existing bytes on failure', () => {
    const existing = createNewCharacter('ExistingValidSheet', 'Off-Prem Elf', 'Vermineer', 516);
    const originalRoster = JSON.stringify({ ExistingValidSheet: existing });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    const invalid = createNewCharacter('InvalidProgressSheet', 'Half Daemon', 'Robot Monk', 517);
    invalid.Quest.maxProgress = 0;

    expect(saveToRoster(invalid)).toMatchObject({
      ok: false,
      error: { code: 'invalid_schema' },
    });
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
  });
});
