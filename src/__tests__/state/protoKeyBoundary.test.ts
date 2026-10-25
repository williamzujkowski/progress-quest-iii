// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { decodePQWSave } from '../../state/saveManager';
import { loadRoster, saveToRoster } from '../../state/saveManager';
import { readCaseload } from '../../state/caseload';
import { captureActiveSession, loadActiveCheckpoint, writeActiveCheckpoint } from '../../state/sessionCheckpoint';
import { activeCheckpointV1Schema, carriesProtoKey, characterSheetSchema } from '../../state/schemas';
import { z } from '../../state/zod';

/**
 * The one unknown key `.strict()` accepts, and the four doors it could walk through.
 *
 * `docs/contracts/state-and-save.md` promises that unknown fields "fail closed instead of being
 * silently discarded". That was true of every key except `__proto__`: zod skips it before collecting
 * unrecognised keys, so `.strict()` never sees it and a payload carrying it parsed `ok` with the key
 * quietly removed.
 *
 * No pollution followed, because zod builds a fresh object rather than assigning into one — which is
 * exactly why this needs a test rather than a bug report. The guarantee rested on an internal detail
 * of a dependency instead of on the check the contract describes, and a zod refactor toward
 * `Object.keys` plus a spread would have changed the answer without failing any gate.
 *
 * The first case below pins the dependency's behaviour so the reason this guard exists stays visible
 * if zod ever fixes it upstream. zod 4.6 did: `.strict()` now refuses `__proto__` like any other
 * unknown key. The boundary guards stay, now belt-and-braces, so the contract still rests on this
 * repo's own check rather than on a dependency's internals. The rest are the boundaries.
 */

const PROTO = '"__proto__":{"evil":1}';

afterEach(() => localStorage.clear());

const hero = () => createNewCharacter('Prototype', 'Half Daemon', 'Robot Monk', new RandomGenerator('proto'));
const hero2 = () => createNewCharacter('Clean', 'Half Daemon', 'Robot Monk', new RandomGenerator('clean'));

describe('a __proto__ key is refused, not dropped', () => {
  it('is refused by zod strict mode too, since zod 4.6', () => {
    // Recorded rather than assumed. Until zod 4.6 this was the one key `.strict()` let through;
    // it failed here when zod fixed it, as this case was written to. If it ever passes `true`
    // again, the guards below are once more the only thing standing there.
    const strict = z.object({ a: z.string() }).strict();

    expect(strict.safeParse(JSON.parse('{"a":"x","zzz":1}')).success, 'an ordinary unknown key').toBe(false);
    expect(strict.safeParse(JSON.parse(`{"a":"x",${PROTO}}`)).success, '__proto__').toBe(false);
    // And it really is an own enumerable key on the parsed object, not something JSON.parse discards.
    expect(Object.keys(JSON.parse(`{"a":"x",${PROTO}}`))).toContain('__proto__');
  });

  it('finds the key at any depth, because JSON allows it at any depth', () => {
    expect(carriesProtoKey(JSON.parse(`{${PROTO}}`))).toBe(true);
    expect(carriesProtoKey(JSON.parse(`{"a":{"b":{${PROTO}}}}`))).toBe(true);
    expect(carriesProtoKey(JSON.parse(`{"a":[1,{${PROTO}}]}`))).toBe(true);
    expect(carriesProtoKey(JSON.parse('{"a":{"b":[1,2]},"c":null}'))).toBe(false);
    expect(carriesProtoKey(hero())).toBe(false);
  });

  it('refuses an imported save that carries it', () => {
    const sheet = JSON.parse(JSON.stringify(hero())) as Record<string, unknown>;
    const raw = JSON.stringify(sheet).replace(/^\{/, `{${PROTO},`);
    // zod 4.6+ refuses it at the schema too; the boundary below must refuse it regardless.
    expect(characterSheetSchema.safeParse(JSON.parse(raw)).success).toBe(false);

    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(raw)));

    const decoded = decodePQWSave(encoded);
    expect(decoded.ok).toBe(false);
    expect(!decoded.ok && decoded.error.code).toBe('invalid_schema');
  });

  it('refuses a roster sheet that carries it, without touching the rest', () => {
    /*
     * Inside the sheet, never at the key.
     *
     * My first version put `__proto__` at the roster's top level and expected the whole map to be
     * refused — which broke `saveManager.test.ts`'s "stores prototype-like character names as
     * ordinary roster keys". That test is right: at this level the key is a character *name*, and a
     * hero called `__proto__` is a legitimate save. `emptyRoster()` is `Object.create(null)`
     * precisely so it round-trips. The hole is one level down, where the same string is an unknown
     * field that `.strict()` does not refuse.
     */
    const tampered = JSON.stringify(hero()).replace(/^\{/, `{${PROTO},`);
    const raw = `{"Prototype":${tampered},"Clean":${JSON.stringify(hero2())}}`;
    localStorage.setItem('progquest_roster_v1', raw);

    const loaded = loadRoster();

    expect(loaded.ok, loaded.ok ? '' : loaded.error.message).toBe(true);
    if (!loaded.ok) return;
    expect(Object.hasOwn(loaded.value, 'Prototype'), 'a tampered sheet was offered as a character').toBe(false);
    expect(Object.hasOwn(loaded.value, 'Clean'), 'one bad sheet hid a good one').toBe(true);
    expect(localStorage.getItem('progquest_roster_v1'), 'the read rewrote the stored bytes').toBe(raw);
  });

  it('keeps a character legitimately named __proto__ working', () => {
    // The property the narrower guard exists to preserve, asserted here too so the reason is
    // visible from this file rather than only from the suite that would break.
    // Written through the app's own writer rather than a literal: `{ __proto__: value }` invokes
    // the prototype setter instead of creating an own key, so hand-building the roster here would
    // have stored `{}` and proved nothing.
    const named = createNewCharacter('__proto__', 'Half Daemon', 'Robot Monk', new RandomGenerator('named'));
    expect(saveToRoster(named)).toMatchObject({ ok: true });
    expect(Object.hasOwn(JSON.parse(localStorage.getItem('progquest_roster_v1') ?? '{}'), '__proto__')).toBe(true);

    const loaded = loadRoster();

    expect(loaded.ok).toBe(true);
    expect(loaded.ok && Object.hasOwn(loaded.value, '__proto__')).toBe(true);
  });

  it('refuses a checkpoint that carries it', () => {
    /*
     * Built from a real capture rather than hand-written.
     *
     * My first version stored `{"schemaVersion":1,"__proto__":{…}}` and passed with the guard
     * removed — the envelope was refused for missing `session`, so the test proved nothing about
     * the key. The payload has to be one the schema otherwise accepts, or this is a test about
     * required fields wearing the wrong name.
     */
    const written = writeActiveCheckpoint(localStorage, captureActiveSession(1_700_000_000_000), null);
    expect(written.ok, 'expected a valid checkpoint to tamper with').toBe(true);
    const valid = localStorage.getItem('progquest_active_session_v1') ?? '';
    expect(activeCheckpointV1Schema.safeParse(JSON.parse(valid)).success, 'baseline must be valid').toBe(true);

    const tampered = valid.replace(/^\{/, `{${PROTO},`);
    // zod 4.6+ refuses it at the schema too; the boundary below must refuse it regardless.
    expect(activeCheckpointV1Schema.safeParse(JSON.parse(tampered)).success).toBe(false);
    localStorage.setItem('progquest_active_session_v1', tampered);

    const loaded = loadActiveCheckpoint(localStorage);
    expect(loaded.status).toBe('corrupt');
    // Not the version branch: `schemaVersion` is present and supported, so the refusal is the key.
    expect(loaded).not.toMatchObject({ unsupported: true });
  });

  it('fails a ledger closed to empty rather than accepting it', () => {
    // Ledgers already fail closed to empty for anything unreadable; this joins that path rather
    // than inventing a second one.
    localStorage.setItem('progquest_caseload_v1', `{"kinds":{"exterminate":900},${PROTO}}`);

    expect(readCaseload(localStorage).kinds.exterminate ?? 0).toBe(0);
  });

  it('leaves Object.prototype alone throughout, which it already did', () => {
    // Stated so the scope of the fix is not overread: there was never live pollution here, and this
    // asserts the fix did not introduce any either.
    expect((Object.prototype as unknown as Record<string, unknown>)['evil']).toBeUndefined();
  });
});
