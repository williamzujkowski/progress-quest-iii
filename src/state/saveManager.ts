import { z } from './zod';
import type { CharacterSheet } from '../engine/types';
import { isDOMExceptionNamed } from './diagnostics';
import { carriesProtoKey, characterNameSchema, characterSheetSchema, type PersistedCharacterSheet } from './schemas';

const ROSTER_STORAGE_KEY = 'progquest_roster_v1';
const ROSTER_RECENCY_STORAGE_KEY = 'progquest_roster_recent_v1';
export const MAX_PQW_INPUT_LENGTH = 1_000_000;
export const MAX_ROSTER_ENTRIES = 100;
export const MAX_ROSTER_SERIALIZED_LENGTH = 500_000;
const rosterRecencySchema = z.array(characterNameSchema).max(MAX_ROSTER_ENTRIES);

export type SaveErrorCode =
  | 'input_too_large'
  | 'malformed_base64'
  | 'invalid_json'
  | 'invalid_schema'
  | 'storage_unavailable'
  | 'storage_corrupt'
  | 'storage_full'
  | 'roster_name_taken'
  | 'roster_too_large'
  | 'storage_failed';

export type SaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: SaveErrorCode; message: string } };

function saveFailure(code: SaveErrorCode, message: string): SaveResult<never> {
  return { ok: false, error: { code, message } };
}

/**
 * The save as a shareable string, or a refusal — never a file the importer will reject.
 *
 * This did not validate. So while a hero was in a state the checkpoint writer and the roster writer
 * both correctly refused, the export button and the error boundary's "download current save" both
 * succeeded, and handed the player a `.pqw` that `decodePQWSave` then turned away as
 * `invalid_schema`. The one path offering an escape from a broken save was the one that silently
 * produced a dead file, and nothing said so until the player tried to import it somewhere else —
 * by which time the session it came from is usually gone.
 *
 * Validated against `characterSheetSchema`, the same schema the importer applies, so the two cannot
 * drift into disagreeing about what a save is. Returning a result rather than throwing, because both
 * callers are player-facing and have somewhere to put the message.
 */
export function encodePQWSave(sheet: CharacterSheet): SaveResult<string> {
  const parsed = characterSheetSchema.safeParse(sheet);
  if (!parsed.success) {
    return saveFailure('invalid_schema', 'This character has invalid save data and cannot be exported. Nothing was changed.');
  }
  const jsonString = JSON.stringify(sheet);
  const bytes = new TextEncoder().encode(jsonString);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  // The importer's other gate, checked here for the same reason as the schema.
  //
  // `decodePQWSave` rejects anything past `MAX_PQW_INPUT_LENGTH` *before* it validates, so a sheet
  // could satisfy the schema, encode happily, and be refused on the way back in — which is the
  // defect this function was written to close, one gate further along. Measured by bisection: 3,658
  // inventory rows at 180-character names encodes `ok` and decodes `input_too_large`.
  //
  // Not reachable in play, and the check is cheap enough not to care: `generateItemReward` stops
  // adding distinct names once the bag holds 999, so a 72-hour soak plateaued at 1,014 rows and
  // 59 KB against a cap of a million characters.
  if (encoded.length > MAX_PQW_INPUT_LENGTH) {
    return saveFailure('input_too_large', 'This character is too large to export. Nothing was changed.');
  }
  return { ok: true, value: encoded };
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function decodePQWSave(pqwString: string): SaveResult<PersistedCharacterSheet> {
  if (pqwString.length > MAX_PQW_INPUT_LENGTH) {
    return saveFailure('input_too_large', 'Save data is too large to import.');
  }
  const cleanString = pqwString.replace(/\s/g, '');

  let jsonText: string;
  try {
    jsonText = decodeBase64Utf8(cleanString);
  } catch {
    return saveFailure('malformed_base64', 'Malformed base64 save string.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return saveFailure('invalid_json', 'Save file contains invalid JSON data.');
  }
  // Refused rather than dropped, for the reason `readableText` gives: a boundary that silently
  // edits what the player handed it and then persists the edit is the shape of a data loss.
  if (carriesProtoKey(parsed)) {
    return saveFailure('invalid_schema', 'Save data contains an unsupported field name.');
  }

  const result = characterSheetSchema.safeParse(parsed);
  if (!result.success) {
    const errorDetails = result.error.issues.map((error) => `${error.path.join('.')}: ${error.message}`).join(', ');
    return saveFailure('invalid_schema', `Invalid Character Sheet Schema: ${errorDetails}`);
  }

  return { ok: true, value: result.data };
}

function emptyRoster(): Record<string, CharacterSheet> {
  // ponytail: a null prototype preserves string-key storage without a Map serialization layer.
  return Object.create(null) as Record<string, CharacterSheet>;
}

function getStorage(): SaveResult<Storage> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return saveFailure('storage_unavailable', 'Browser storage is unavailable. Nothing was changed.');
    }
    return { ok: true, value: window.localStorage };
  } catch {
    return saveFailure('storage_unavailable', 'Browser storage is unavailable. Nothing was changed.');
  }
}

interface RosterRead {
  readonly roster: Record<string, CharacterSheet>;
  /**
   * Entries this build could not parse, kept verbatim.
   *
   * They are not returned to callers as characters — nothing can be done with a sheet that fails
   * the schema — but every writer serialises them back out, so the bytes survive. A save this
   * build cannot read is not necessarily a save that is gone: `characterSheetSchema` is `.strict()`,
   * so a character written by a *newer* build fails here purely for carrying a field this one has
   * never heard of, and dropping it would turn a version skew into a deletion.
   */
  readonly unreadable: Record<string, unknown>;
}

/**
 * Reads the roster, skipping entries it cannot parse rather than failing the whole map.
 *
 * It used to return on the first bad entry. One unreadable character therefore hid every valid one
 * beside it, and because `removeFromRoster` reads before it deletes, the only cleanup control in
 * the app could not clear the thing that was blocking it — so no character could ever be saved
 * again, with no in-app way back.
 *
 * The entry cap preserved that failure verbatim after the per-entry case was fixed: it counted
 * unreadable entries toward the limit and refused the whole map on the hundred-and-first key. So a
 * crafted value of about four kilobytes — well under both size guards, so neither fires — hid every
 * real character and blocked Delete, the only control that could have cleared it.
 *
 * The cap now counts characters rather than keys. An unreadable entry is not a character; it is
 * precisely the thing the player needs to remove, and letting it fill the count is what turned junk
 * into a wedge. A roster holding more than `MAX_ROSTER_ENTRIES` real characters is still refused
 * whole, unchanged, because that is a decision about how large a roster this build will read and
 * not a question of recovering from a bad one.
 *
 * `readLedger` in `ledgerStorage.ts` already faces this and fails closed to empty. A roster is a
 * map of independent records; one corrupt value is not evidence about the others.
 */
function readRoster(storage: Storage): SaveResult<RosterRead> {
  let raw: string | null;
  try {
    raw = storage.getItem(ROSTER_STORAGE_KEY);
  } catch {
    return saveFailure('storage_unavailable', 'Browser storage could not be read. Nothing was changed.');
  }
  if (raw === null) return { ok: true, value: { roster: emptyRoster(), unreadable: emptyRoster() } };
  if (raw.length > MAX_ROSTER_SERIALIZED_LENGTH) {
    return saveFailure('storage_corrupt', 'The saved roster is too large to process. Nothing was changed.');
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      // Still a whole-map failure: this is not one bad record among good ones, it is not a map.
      return saveFailure('storage_corrupt', 'The saved roster is unreadable. Nothing was changed.');
    }

    const validRoster = emptyRoster();
    const unreadable: Record<string, unknown> = emptyRoster();
    for (const [key, value] of Object.entries(parsed)) {
      const check = characterSheetSchema.safeParse(value);
      // A key that disagrees with the name inside it is corruption of the same kind, and is kept
      // for the same reason — this build cannot use the entry, and cannot prove it is worthless.
      //
      // The `__proto__` check applies to the sheet, never to the key. At this level the key is a
      // character *name*, and a hero called `__proto__` is a legitimate save that round-trips as an
      // ordinary own key — `emptyRoster()` is `Object.create(null)` precisely so it can. Inside the
      // sheet the same string is an unknown field, which is the thing `.strict()` fails to refuse.
      if (!check.success || key !== check.data.Traits.Name || carriesProtoKey(value)) {
        unreadable[key] = value;
        continue;
      }
      // The cap counts characters, not keys. An unreadable entry is not a character — it is the
      // thing the player needs to delete — so letting it fill the count is what turned junk into a
      // wedge. Real characters past the cap are still refused wholesale, which is the existing
      // decision and is unchanged.
      if (Object.keys(validRoster).length >= MAX_ROSTER_ENTRIES) {
        return saveFailure('storage_corrupt', 'The saved roster has too many characters. Nothing was changed.');
      }
      validRoster[key] = check.data;
    }
    return { ok: true, value: { roster: validRoster, unreadable } };
  } catch {
    return saveFailure('storage_corrupt', 'The saved roster is unreadable. Nothing was changed.');
  }
}

/**
 * What gets written back: the valid characters plus whatever could not be read.
 *
 * Every writer serialises the map it was handed, so without this an unreadable entry would survive
 * exactly until the player's next save and then be gone. Valid entries win a key collision — if a
 * character is saved under a name an unreadable entry holds, the one that parses is the real one.
 */
function serializableRoster(read: RosterRead): Record<string, unknown> {
  return { ...read.unreadable, ...read.roster };
}

function writeFailure(error: unknown, action: string): SaveResult<never> {
  if (isDOMExceptionNamed(error, 'QuotaExceededError')) {
    return saveFailure('storage_full', `Browser storage is full, so it could not ${action}. Nothing was changed.`);
  }
  return saveFailure('storage_failed', `Browser storage could not ${action}. Nothing was changed.`);
}

function recencyWriteFailure(error: unknown, action: string): SaveResult<never> {
  if (isDOMExceptionNamed(error, 'QuotaExceededError')) {
    return saveFailure('storage_full', `The character was ${action}, but browser storage is full and could not update roster recency. Try again after freeing space.`);
  }
  return saveFailure('storage_failed', `The character was ${action}, but browser storage could not update roster recency. Try again.`);
}

function readRosterRecency(storage: Storage, roster: Record<string, CharacterSheet>): SaveResult<string[]> {
  let raw: string | null;
  try {
    raw = storage.getItem(ROSTER_RECENCY_STORAGE_KEY);
  } catch {
    return saveFailure('storage_unavailable', 'Browser storage could not read roster recency. Nothing was changed.');
  }
  if (raw === null) return { ok: true, value: Object.keys(roster) };
  if (raw.length > MAX_ROSTER_SERIALIZED_LENGTH) {
    return saveFailure('storage_corrupt', 'The saved roster recency is too large to process. Nothing was changed.');
  }
  try {
    const parsed = rosterRecencySchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success
      ? { ok: true, value: [...new Set(parsed.data)] }
      : saveFailure('storage_corrupt', 'The saved roster recency is unreadable. Nothing was changed.');
  } catch {
    return saveFailure('storage_corrupt', 'The saved roster recency is unreadable. Nothing was changed.');
  }
}

export function loadRoster(storageOverride?: Storage): SaveResult<Record<string, CharacterSheet>> {
  const storage: SaveResult<Storage> = storageOverride ? { ok: true, value: storageOverride } : getStorage();
  if (!storage.ok) return storage;
  const loaded = readRoster(storage.value);
  return loaded.ok ? { ok: true, value: loaded.value.roster } : loaded;
}

export function loadMostRecentRosterCharacter(storage?: Storage): SaveResult<CharacterSheet | null> {
  const availableStorage: SaveResult<Storage> = storage ? { ok: true, value: storage } : getStorage();
  if (!availableStorage.ok) return availableStorage;
  const loaded = readRoster(availableStorage.value);
  if (!loaded.ok) return loaded;
  const recency = readRosterRecency(availableStorage.value, loaded.value.roster);
  if (!recency.ok) return recency;
  for (const name of recency.value.toReversed()) {
    const character = loaded.value.roster[name];
    if (Object.hasOwn(loaded.value.roster, name) && character) return { ok: true, value: character };
  }
  return { ok: true, value: Object.values(loaded.value.roster).at(-1) ?? null };
}

/**
 * Adds a character that is not already in the roster.
 *
 * `saveToRoster` replaces by name, which is right for the caller it was written for: saving the
 * character you are playing is meant to overwrite the earlier copy of that same character. It is
 * wrong for an import, where a name collision means two different characters and replacing one
 * destroys progress that cannot be re-earned. The two operations were the same call, so the
 * destructive reading was the default and nothing at the call site said so.
 *
 * Refusing is the whole function. A caller that genuinely wants to replace can still say so by
 * calling `saveToRoster`, but it now has to say it.
 */
export function importToRoster(sheet: CharacterSheet): SaveResult<Record<string, CharacterSheet>> {
  const storage = getStorage();
  if (!storage.ok) return storage;

  const loaded = readRoster(storage.value);
  if (!loaded.ok) return loaded;

  // Own-property only: a character named `constructor` must not read as already present.
  if (Object.hasOwn(loaded.value.roster, sheet.Traits.Name)) {
    // A name collision is only destructive when the two characters differ. Re-importing a save of
    // the character already stored — the common case, since exporting and re-importing your own
    // backup is what the feature is for — replaces the entry with itself and loses nothing.
    //
    // Warning there would be a false alarm, and false alarms are how a confirmation stops being
    // read. Both sides are compared through the same schema so key order cannot make identical
    // characters look different.
    const stored = characterSheetSchema.safeParse(loaded.value.roster[sheet.Traits.Name]);
    const incoming = characterSheetSchema.safeParse(sheet);
    const unchanged = stored.success && incoming.success
      && JSON.stringify(stored.data) === JSON.stringify(incoming.data);

    if (!unchanged) {
      return saveFailure(
        'roster_name_taken',
        `This browser already holds a different character called ${sheet.Traits.Name}. Nothing was changed.`,
      );
    }
  }

  return saveToRoster(sheet);
}

export function saveToRoster(sheet: CharacterSheet): SaveResult<Record<string, CharacterSheet>> {
  const candidate = characterSheetSchema.safeParse(sheet);
  if (!candidate.success) {
    return saveFailure('invalid_schema', 'This character has invalid save data and was not saved. Nothing was changed.');
  }
  const storage = getStorage();
  if (!storage.ok) return storage;
  const loaded = readRoster(storage.value);
  if (!loaded.ok) return loaded;
  const recency = readRosterRecency(storage.value, loaded.value.roster);
  if (!recency.ok) return recency;

  try {
    const roster = loaded.value.roster;
    roster[candidate.data.Traits.Name] = candidate.data;
    const persisted = serializableRoster(loaded.value);
    if (Object.keys(persisted).length > MAX_ROSTER_ENTRIES) {
      return saveFailure('roster_too_large', 'The roster already contains the maximum number of characters. Nothing was changed.');
    }
    const serialized = JSON.stringify(persisted);
    if (serialized.length > MAX_ROSTER_SERIALIZED_LENGTH) {
      return saveFailure('roster_too_large', 'The roster is too large to save. Nothing was changed.');
    }
    const nextRecency = rosterRecencySchema.safeParse([
      ...recency.value.filter((name) => name !== candidate.data.Traits.Name && Object.hasOwn(roster, name)),
      candidate.data.Traits.Name,
    ]);
    if (!nextRecency.success) return saveFailure('storage_failed', 'Roster recency could not be updated safely. Nothing was changed.');
    const serializedRecency = JSON.stringify(nextRecency.data);
    storage.value.setItem(ROSTER_STORAGE_KEY, serialized);
    try {
      storage.value.setItem(ROSTER_RECENCY_STORAGE_KEY, serializedRecency);
    } catch (error) {
      // ponytail: LocalStorage cannot transact two keys, so expose the accurate partial result for a safe retry.
      return recencyWriteFailure(error, 'saved');
    }
    return { ok: true, value: roster };
  } catch (error) {
    return writeFailure(error, 'save this character');
  }
}

export function removeFromRoster(characterName: string): SaveResult<Record<string, CharacterSheet>> {
  const storage = getStorage();
  if (!storage.ok) return storage;
  const loaded = readRoster(storage.value);
  if (!loaded.ok) return loaded;
  const recency = readRosterRecency(storage.value, loaded.value.roster);
  if (!recency.ok) return recency;

  try {
    const roster = loaded.value.roster;
    delete roster[characterName];
    // Deletes from the unreadable side too: the player asked for this name to be gone, and an
    // entry they cannot see is still one they asked to remove.
    const { [characterName]: _removed, ...keptUnreadable } = loaded.value.unreadable;
    const serialized = JSON.stringify(serializableRoster({ roster, unreadable: keptUnreadable }));
    const nextRecency = rosterRecencySchema.safeParse(recency.value.filter((name) => name !== characterName && Object.hasOwn(roster, name)));
    if (!nextRecency.success) return saveFailure('storage_failed', 'Roster recency could not be updated safely. Nothing was changed.');
    const serializedRecency = JSON.stringify(nextRecency.data);
    storage.value.setItem(ROSTER_STORAGE_KEY, serialized);
    try {
      storage.value.setItem(ROSTER_RECENCY_STORAGE_KEY, serializedRecency);
    } catch (error) {
      // ponytail: LocalStorage cannot transact two keys, so expose the accurate partial result for a safe retry.
      return recencyWriteFailure(error, 'removed');
    }
    return { ok: true, value: roster };
  } catch (error) {
    return writeFailure(error, 'remove this character');
  }
}
