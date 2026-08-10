// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { advanceGame } from '../../engine/transition';
import { MAX_PENDING_ELAPSED_MS, MAX_PERSISTED_DESCRIPTION_LENGTH, MAX_PERSISTED_ITEMS } from '../../data/limits';
import { createActivityEntries, useGameStore } from '../../state/gameStore';
import { activeCheckpointV1Schema } from '../../state/schemas';
import { diagnostics } from '../../state/diagnostics';
import { saveToRoster } from '../../state/saveManager';

// Checkpoints now carry the wall-clock time they were written, so that a reopened app can
// credit the time it was closed. Two captures of identical state are still identical game
// state, but they are not identical bytes unless the clock is pinned — so pin it here.
const FIXED_SAVED_AT = 1_700_000_000_000;
import {
  ACTIVE_CHECKPOINT_KEY,
  ACTIVE_CHECKPOINT_LKG_KEY,
  MAX_CHECKPOINT_SERIALIZED_LENGTH,
  captureActiveSession,
  loadActiveCheckpoint,
  repairActiveCheckpoint,
  restoreActiveSession,
  startSessionCheckpoints,
  writeActiveCheckpoint,
} from '../../state/sessionCheckpoint';

const originalState = useGameStore.getState();
const activityLog = (...messages: string[]) => createActivityEntries(messages, 0);
const activityMessages = () => useGameStore.getState().log.map(({ message }) => message);

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  useGameStore.setState(originalState, true);
  vi.restoreAllMocks();
});

describe('active session checkpoint boundary', () => {
  it('requires character creation when no active session or roster exists', () => {
    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage });

    expect(controller.requiresCharacterCreation).toBe(true);
    controller.dispose();
  });

  it('starts the most recently saved roster character when no active session exists', () => {
    saveToRoster(createNewCharacter('Earlier Roster', 'Half Daemon', 'Robot Monk', 704));
    saveToRoster(createNewCharacter('Latest Roster', 'Off-Prem Elf', 'Vermineer', 705));

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage });

    expect(controller.requiresCharacterCreation).toBe(false);
    expect(useGameStore.getState().character.Traits.Name).toBe('Latest Roster');
    expect(activityMessages()).toEqual(['Loaded character Latest Roster from roster.']);
    controller.dispose();
  });

  it('restores the active checkpoint before considering the roster', () => {
    const active = createNewCharacter('Active Wins', 'Half Daemon', 'Robot Monk', 706);
    useGameStore.setState({ character: active });
    expect(writeActiveCheckpoint(localStorage, captureActiveSession(FIXED_SAVED_AT), null)).toMatchObject({ ok: true });
    saveToRoster(createNewCharacter('Roster Loses', 'Off-Prem Elf', 'Vermineer', 707));
    useGameStore.setState(originalState, true);

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage });

    expect(controller.requiresCharacterCreation).toBe(false);
    expect(useGameStore.getState().character.Traits.Name).toBe('Active Wins');
    controller.dispose();
  });

  it('blocks startup without replacing an unreadable roster', () => {
    vi.useFakeTimers();
    const corruptRoster = '{broken';
    localStorage.setItem('progquest_roster_v1', corruptRoster);

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1 });

    expect(controller.requiresCharacterCreation).toBe(true);
    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    expect(controller.getNotice()?.message).toContain('saved roster is unreadable');
    useGameStore.setState({ log: activityLog('The placeholder must not become authoritative.') });
    vi.runAllTimers();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBeNull();
    expect(localStorage.getItem('progquest_roster_v1')).toBe(corruptRoster);
    controller.dispose();
  });

  it('round-trips the complete deterministic session through a strict v1 envelope', () => {
    const character = createNewCharacter('Checkpoint', 'Off-Prem Elf', 'Vermineer', 701);
    character.Task.elapsedMs = 123;
    const rng = new RandomGenerator('checkpoint-rng');
    rng.random(99);
    useGameStore.setState({
      character,
      rng,
      isPaused: true,
      log: activityLog('Newest event', 'Older event'),
      progression: { experience: { currentSeconds: 7, maxSeconds: 11 }, completedTasks: 9, elapsedSeconds: 42 },
    });
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    expect(checkpoint.session.log).toEqual(['Newest event', 'Older event']);

    expect(writeActiveCheckpoint(localStorage, checkpoint, null)).toMatchObject({ ok: true });
    const loaded = loadActiveCheckpoint(localStorage);
    expect(loaded).toMatchObject({ status: 'loaded', checkpoint });

    useGameStore.getState().startSession({ source: 'creation', name: 'Replacement', race: 'Half Daemon', klass: 'Robot Monk', seed: 702 });
    if (loaded.status !== 'loaded') throw new Error('Expected a loaded checkpoint');
    restoreActiveSession(loaded.checkpoint, FIXED_SAVED_AT);
    const restored = useGameStore.getState();
    expect(restored.character).toEqual(character);
    expect(restored.rng.getState()).toEqual(rng.getState());
    expect(restored.isPaused).toBe(true);
    expect(activityMessages()).toEqual(['Newest event', 'Older event']);
    expect(restored.progression).toEqual({ experience: { currentSeconds: 7, maxSeconds: 11 }, completedTasks: 9, elapsedSeconds: 42 });
  });

  it('normalizes legacy remainder absence and rejects hostile scheduler debt', () => {
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    const { pendingElapsedMs: _pendingElapsedMs, ...legacySession } = checkpoint.session;

    expect(activeCheckpointV1Schema.parse({ ...checkpoint, session: legacySession }).session.pendingElapsedMs).toBe(0);
    for (const pendingElapsedMs of [-1, Number.NaN, Number.POSITIVE_INFINITY, MAX_PENDING_ELAPSED_MS + 1]) {
      expect(activeCheckpointV1Schema.safeParse({
        ...checkpoint,
        session: { ...checkpoint.session, pendingElapsedMs },
      }).success).toBe(false);
    }
  });

  it('recovers a valid last-known-good checkpoint without replacing corrupt primary bytes', () => {
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, '{broken');
    localStorage.setItem(ACTIVE_CHECKPOINT_LKG_KEY, JSON.stringify(checkpoint));
    const primary = localStorage.getItem(ACTIVE_CHECKPOINT_KEY);

    const result = loadActiveCheckpoint(localStorage);

    expect(result).toMatchObject({ status: 'recovered_lkg', checkpoint, canPersist: false });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(primary);
  });

  it('recovers an orphaned last-known-good checkpoint instead of treating it as a fresh session', () => {
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    const backupRaw = JSON.stringify(checkpoint);
    localStorage.setItem(ACTIVE_CHECKPOINT_LKG_KEY, backupRaw);

    const loaded = loadActiveCheckpoint(localStorage);

    expect(loaded).toMatchObject({ status: 'recovered_lkg', checkpoint, canPersist: false });
    vi.useFakeTimers();
    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1 });
    expect(controller.getNotice()).toMatchObject({ repairLabel: 'Adopt recovered checkpoint' });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBeNull();
    controller.repair();
    expect(controller.getNotice()).toMatchObject({
      kind: 'status',
      message: 'The recovered active session was adopted. Automatic checkpoints resumed.',
    });
    useGameStore.setState({ log: activityLog('Do not replace the orphan') });
    vi.runAllTimers();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).not.toBeNull();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_LKG_KEY)).toBe(backupRaw);
    controller.dispose();
  });

  it('blocks without authorizing repair when an orphaned LKG is corrupt', () => {
    localStorage.setItem(ACTIVE_CHECKPOINT_LKG_KEY, '{broken-backup');

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage });

    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    controller.repair();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_LKG_KEY)).toBe('{broken-backup');
    controller.dispose();
  });

  it('requires explicit repair before replacing an unreadable primary', () => {
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, '{broken');

    expect(writeActiveCheckpoint(localStorage, checkpoint, '{broken')).toMatchObject({ ok: false, error: { code: 'storage_corrupt' } });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe('{broken');
    expect(repairActiveCheckpoint(localStorage, checkpoint, '{broken')).toMatchObject({ ok: true });
    expect(loadActiveCheckpoint(localStorage)).toMatchObject({ status: 'loaded', checkpoint });
  });

  it('rotates a valid primary before writing its replacement', () => {
    const first = captureActiveSession(FIXED_SAVED_AT);
    const firstWrite = writeActiveCheckpoint(localStorage, first, null);
    if (!firstWrite.ok) throw new Error('Expected first checkpoint write');
    useGameStore.setState({ log: activityLog('Changed') });
    const second = captureActiveSession(FIXED_SAVED_AT);

    expect(writeActiveCheckpoint(localStorage, second, firstWrite.value.raw)).toMatchObject({ ok: true });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_LKG_KEY)).toBe(firstWrite.value.raw);
    expect(loadActiveCheckpoint(localStorage)).toMatchObject({ status: 'loaded', checkpoint: second });
  });

  it('blocks a stale tab instead of overwriting a changed primary', () => {
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, 'other-tab');

    expect(writeActiveCheckpoint(localStorage, checkpoint, null)).toMatchObject({ ok: false, error: { code: 'storage_conflict' } });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe('other-tab');
  });

  it('rejects unsupported, unknown, and invalid Alea state without mutating the session', () => {
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    const before = useGameStore.getState();
    for (const candidate of [
      { ...checkpoint, schemaVersion: 2 },
      { ...checkpoint, surprise: true },
      { ...checkpoint, session: { ...checkpoint.session, rngState: [0.1, 0.2, 0.3, -1] } },
      // The 32-bit alignment refine on its own. The counter is in range and the other two
      // fractions are exact multiples of 2^-32, so the only thing wrong with this state is that
      // Alea could not have produced 0.123456789 - which is what a fraction hand-edited or
      // round-tripped through a lossy encoder looks like. Without the isolated case the refine
      // could be deleted and every remaining negative case would still fail, for other reasons.
      { ...checkpoint, session: { ...checkpoint.session, rngState: [0.123456789, 0.5, 0.25, 1] } },
    ]) {
      localStorage.setItem(ACTIVE_CHECKPOINT_KEY, JSON.stringify(candidate));
      expect(loadActiveCheckpoint(localStorage).canPersist).toBe(false);
      expect(useGameStore.getState()).toBe(before);
    }
  });

  it('blocks automatic writes after a corrupt read and reports one redacted failure episode', () => {
    vi.useFakeTimers();
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, '{broken');
    const original = localStorage.getItem(ACTIVE_CHECKPOINT_KEY);
    const beforeDiagnostics = diagnostics.snapshot().length;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1 });

    useGameStore.setState({ log: activityLog('Must not overwrite') });
    vi.runAllTimers();

    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(original);
    expect(setItem.mock.calls.filter(([key]) => key === ACTIVE_CHECKPOINT_KEY)).toHaveLength(0);
    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: true });
    expect(diagnostics.snapshot().slice(beforeDiagnostics).filter(({ code }) => code === 'session_checkpoint_failed')).toHaveLength(1);
    expect(diagnostics.exportReport()).not.toContain('{broken');
    controller.dispose();
  });

  it('adopts the roster character when the checkpoint is unreadable, so repair cannot capture a stranger', () => {
    // The forward-compatibility break this guards is not hypothetical. `characterSheetSchema` is
    // `.strict()`, so adding one optional field to it — `GoldDecades` was the first — means a save
    // this build writes is refused by the build before it. A player holding a cached older bundle
    // reaches exactly this branch, and it used to hand them the store's hard-coded default.
    const hero = createNewCharacter('Veteran', 'Robot', 'Monk', new RandomGenerator('corrupt-fallback'));
    expect(saveToRoster(hero).ok).toBe(true);

    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    const fromANewerBuild = JSON.stringify({
      ...checkpoint,
      session: { ...checkpoint.session, character: { ...checkpoint.session.character, MoraleIndex: 4 } },
    });
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, fromANewerBuild);
    localStorage.setItem(ACTIVE_CHECKPOINT_LKG_KEY, fromANewerBuild);

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1 });

    // Both halves matter and either alone passes on a bug: the player must be looking at their own
    // character, AND the unreadable bytes must still be on disk for a build that can read them.
    expect(useGameStore.getState().character.Traits.Name).toBe('Veteran');
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(fromANewerBuild);
    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: true });

    // And repair now captures the adopted character rather than overwriting the save with a
    // level-1 default nobody created.
    controller.repair();
    const afterRepair = activeCheckpointV1Schema.safeParse(JSON.parse(localStorage.getItem(ACTIVE_CHECKPOINT_KEY) ?? '{}'));
    expect(afterRepair.success).toBe(true);
    expect(afterRepair.success && afterRepair.data.session.character.Traits.Name).toBe('Veteran');
    controller.dispose();
  });

  it('does not authorize repair for unsupported or unavailable checkpoint reads', () => {
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    const unsupportedRaw = JSON.stringify({ ...checkpoint, schemaVersion: 2 });
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, unsupportedRaw);
    const unsupported = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage });

    expect(unsupported.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    unsupported.repair();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(unsupportedRaw);
    unsupported.dispose();

    const denied = {
      getItem: () => { throw new DOMException('Denied', 'SecurityError'); },
      setItem: vi.fn(),
    } as unknown as Storage;
    const unavailable = startSessionCheckpoints({ storage: denied });
    expect(unavailable.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    unavailable.repair();
    expect(denied.setItem).not.toHaveBeenCalled();
    unavailable.dispose();
  });

  it('does not authorize repair when the primary is corrupt but the LKG read is unavailable', () => {
    let reads = 0;
    const setItem = vi.fn();
    const storage = {
      getItem: () => {
        reads += 1;
        if (reads === 1) return '{broken-primary';
        throw new DOMException('Denied', 'SecurityError');
      },
      setItem,
    } as unknown as Storage;

    const controller = startSessionCheckpoints({ storage });
    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    controller.repair();
    expect(setItem).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('keeps trying after the store fills, and clears the alert once a write lands', () => {
    // A full store is the one write failure that is transient by nature: the quota is shared across
    // the origin, so it can be relieved without this tab doing anything. Treating it as terminal
    // meant one spike ended persistence for the session, pagehide included.
    vi.useFakeTimers();
    const character = createNewCharacter('Persistent', 'Half Daemon', 'Robot Monk', 720);
    useGameStore.setState({ character, sessionGeneration: 1 });

    let full = true;
    const realSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (full && key === ACTIVE_CHECKPOINT_KEY) throw new DOMException('Full', 'QuotaExceededError');
      realSetItem.call(this, key, value);
    });

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1 });
    useGameStore.setState({ log: activityLog('Earned while the disk was full') });
    vi.advanceTimersByTime(5);

    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    expect(controller.getNotice()?.message).toContain('keep trying');
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBeNull();

    // The player frees space. Nothing else happens — no reload, no further store change.
    full = false;
    vi.advanceTimersByTime(1 * 30 + 5);

    const written = localStorage.getItem(ACTIVE_CHECKPOINT_KEY);
    expect(written).not.toBeNull();
    expect(activeCheckpointV1Schema.safeParse(JSON.parse(written ?? '{}')).success).toBe(true);
    // Clearing the alert is the half that makes the retry worth having.
    expect(controller.getNotice()).toMatchObject({ kind: 'status' });
    expect(setItem).toHaveBeenCalled();
    controller.dispose();
  });

  it('keeps trying after the session is momentarily invalid, and saves what accrued meanwhile', () => {
    /*
     * The other half of the same rule, and the one that made every import-reachable save bug
     * unrecoverable rather than merely annoying.
     *
     * An invalid session is transient in its subject rather than its environment: the engine keeps
     * ticking, and a character that momentarily fails the schema is legal again by the next
     * completed task. Treating it as terminal ended persistence for the whole session, with
     * `repair()` an inert no-op, while the store went on accruing progress that would never be
     * written — the player is told once, and then watches an hour evaporate.
     *
     * Retried at the ordinary interval rather than the quota's backed-off one, because what this is
     * waiting for is seconds away rather than a player freeing disk space.
     */
    vi.useFakeTimers();
    const character = createNewCharacter('Momentary', 'Half Daemon', 'Robot Monk', 720);
    useGameStore.setState({ character, sessionGeneration: 1 });

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1 });

    // Illegal only for an instant: a description three characters past the cap is exactly what the
    // engine's own ellipsis produces from a near-cap pending task.
    useGameStore.setState({
      character: { ...character, Task: { ...character.Task, description: 'x'.repeat(MAX_PERSISTED_DESCRIPTION_LENGTH + 3) } },
      log: activityLog('Earned while the sheet was illegal'),
    });
    vi.advanceTimersByTime(5);

    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    expect(controller.getNotice()?.message).toContain('keep trying');
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBeNull();

    // The next task arrives and the sheet is ordinary again. Nothing else happens — no reload, no
    // repair, no player action of any kind, because there is none available to take.
    useGameStore.setState({ character, log: activityLog('Earned after it passed') });
    vi.advanceTimersByTime(5);

    const written = localStorage.getItem(ACTIVE_CHECKPOINT_KEY);
    expect(written).not.toBeNull();
    expect(activeCheckpointV1Schema.safeParse(JSON.parse(written ?? '{}')).success).toBe(true);
    // Named for what actually recovered. A player sent to free disk space over a schema complaint
    // has been sent to the wrong place.
    expect(controller.getNotice()).toMatchObject({ kind: 'status' });
    expect(controller.getNotice()?.message).toContain('session is valid again');
    controller.dispose();
  });

  it('does not republish a notice the player is already looking at', () => {
    /*
     * The retry is right; telling the subscriber about it every interval is not. `App` subscribes
     * through `useSyncExternalStore` with `getNotice` as the snapshot, and React compares snapshots
     * by identity — so a fresh object with identical contents is a render for no reason.
     *
     * Measured before this: 3,600 publishes an hour against one distinct message, for as long as
     * the condition lasted.
     */
    vi.useFakeTimers();
    const character = createNewCharacter('Stuck', 'Half Daemon', 'Robot Monk', 720);
    useGameStore.setState({
      character: { ...character, Task: { ...character.Task, description: 'x'.repeat(MAX_PERSISTED_DESCRIPTION_LENGTH + 3) } },
      sessionGeneration: 1,
    });

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1 });
    let notifications = 0;
    const unsubscribe = controller.subscribe(() => { notifications += 1; });

    useGameStore.setState({ log: activityLog('Earned while the sheet stayed illegal') });
    vi.advanceTimersByTime(400);

    // The alert is raised once and then held. A handful of notifications rather than one, because
    // the store subscription also fires — what must not happen is one per retry.
    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    expect(notifications, `${notifications} notifications across 400 retries`).toBeLessThan(10);

    unsubscribe();
    controller.dispose();
  });

  it('disables further repair after an explicit repair write fails', () => {
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, '{broken');
    const original = localStorage.getItem(ACTIVE_CHECKPOINT_KEY);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage });
    expect(controller.getNotice()).toMatchObject({ canRepair: true });

    controller.repair();
    expect(controller.getNotice()).toMatchObject({ canRepair: false });
    controller.repair();

    expect(setItem).toHaveBeenCalledOnce();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(original);
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_LKG_KEY)).toBeNull();
    controller.dispose();
  });

  it('does not let a stale tab repair over a newer cross-tab checkpoint', () => {
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, '{broken');
    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, pagehideTarget: window });
    const newer = JSON.stringify(captureActiveSession(FIXED_SAVED_AT));
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, newer);

    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: true });
    controller.repair();

    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: false });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(newer);
    controller.dispose();
  });

  it('preserves primary bytes when either step of checkpoint rotation fails', () => {
    const first = captureActiveSession(FIXED_SAVED_AT);
    const firstWrite = writeActiveCheckpoint(localStorage, first, null);
    if (!firstWrite.ok) throw new Error('Expected first checkpoint write');
    useGameStore.setState({ log: activityLog('Replacement') });
    const replacement = captureActiveSession(FIXED_SAVED_AT);
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    setItem.mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(writeActiveCheckpoint(localStorage, replacement, firstWrite.value.raw)).toMatchObject({ ok: false, error: { code: 'storage_full' } });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(firstWrite.value.raw);

    setItem.mockImplementationOnce((key, value) => nativeSetItem.call(localStorage, key, value));
    setItem.mockImplementationOnce(() => { throw new Error('Primary failed'); });
    expect(writeActiveCheckpoint(localStorage, replacement, firstWrite.value.raw)).toMatchObject({ ok: false, error: { code: 'storage_failed' } });
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(firstWrite.value.raw);
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_LKG_KEY)).toBe(firstWrite.value.raw);
  });

  it('continues with the exact same next transition and Alea state after restore', () => {
    const character = createNewCharacter('Continuation', 'Half Daemon', 'Robot Monk', 703);
    character.Quest.history = [character.Quest.description];
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 10 };
    character.Task = { description: 'Executing rat...', durationMs: 100, elapsedMs: 75, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    character.PendingTasks = undefined;
    const rng = new RandomGenerator('continuation-rng');
    useGameStore.setState({ character, rng, isPaused: false, log: activityLog('Before'), progression: { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 } });
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);

    useGameStore.getState().tick(25);
    const uninterrupted = captureActiveSession(FIXED_SAVED_AT);
    restoreActiveSession(checkpoint, FIXED_SAVED_AT);
    useGameStore.getState().tick(25);

    expect(captureActiveSession(FIXED_SAVED_AT)).toEqual(uninterrupted);
  });

  it('preserves bounded catch-up remainder across pause and restore', () => {
    useGameStore.getState().startSession({ source: 'creation', name: 'Patient Continuation', race: 'Half Daemon', klass: 'Robot Monk', seed: 714 });
    useGameStore.getState().tick(Number.MAX_VALUE);
    expect(useGameStore.getState().progression.completedTasks).toBe(100);
    useGameStore.getState().togglePause();
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);

    expect(checkpoint.session.pendingElapsedMs).toBeGreaterThan(0);
    expect(checkpoint.session.pendingElapsedMs).toBeLessThanOrEqual(MAX_PENDING_ELAPSED_MS);
    expect(checkpoint.session.log).toHaveLength(50);
    useGameStore.getState().togglePause();
    useGameStore.getState().tick(1);
    const uninterrupted = captureActiveSession(FIXED_SAVED_AT);

    restoreActiveSession(checkpoint, FIXED_SAVED_AT);
    useGameStore.getState().togglePause();
    useGameStore.getState().tick(1);

    expect(captureActiveSession(FIXED_SAVED_AT)).toEqual(uninterrupted);
    expect(uninterrupted.session.progression.completedTasks).toBe(200);
  });

  it('resumes a mid-prologue checkpoint with identical queued work and RNG', () => {
    const character = createNewCharacter('Prologue Continuation', 'Half Daemon', 'Robot Monk', 709);
    const rng = new RandomGenerator('prologue-checkpoint-rng');
    const midPrologue = advanceGame({
      character,
      progression: { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 },
    }, 7000, rng);
    useGameStore.setState({ ...midPrologue.state, rng, isPaused: false, log: activityLog('Before prologue checkpoint') });
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);

    useGameStore.getState().tick(23_000);
    const uninterrupted = captureActiveSession(FIXED_SAVED_AT);
    restoreActiveSession(checkpoint, FIXED_SAVED_AT);
    useGameStore.getState().tick(23_000);

    expect(captureActiveSession(FIXED_SAVED_AT)).toEqual(uninterrupted);
    expect(uninterrupted.session.character.Task).toMatchObject({ description: 'Heading to the killing fields...', type: 'heading' });
    expect(uninterrupted.session.character.PendingTasks).toBeUndefined();
  });

  it('coalesces continuous changes and flushes the latest snapshot when hidden', () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const visibilityTarget = new EventTarget() as EventTarget & { hidden: boolean };
    visibilityTarget.hidden = false;
    const pagehideTarget = new EventTarget();
    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT, storage: localStorage, visibilityTarget, pagehideTarget, intervalMs: 1_000 });

    for (let index = 0; index < 20; index += 1) useGameStore.setState({ log: activityLog(`Event ${index}`) });
    vi.advanceTimersByTime(999);
    expect(setItem.mock.calls.filter(([key]) => key === ACTIVE_CHECKPOINT_KEY)).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(setItem.mock.calls.filter(([key]) => key === ACTIVE_CHECKPOINT_KEY)).toHaveLength(1);
    expect(loadActiveCheckpoint(localStorage)).toMatchObject({ status: 'loaded', checkpoint: { session: { log: ['Event 19'] } } });

    useGameStore.setState({ log: activityLog('Hidden latest') });
    visibilityTarget.hidden = true;
    visibilityTarget.dispatchEvent(new Event('visibilitychange'));
    expect(loadActiveCheckpoint(localStorage)).toMatchObject({ status: 'loaded', checkpoint: { session: { log: ['Hidden latest'] } } });

    useGameStore.setState({ log: activityLog('Pagehide latest') });
    pagehideTarget.dispatchEvent(new Event('pagehide'));
    expect(loadActiveCheckpoint(localStorage)).toMatchObject({ status: 'loaded', checkpoint: { session: { log: ['Pagehide latest'] } } });
    controller.dispose();
  });

  it('stamps a fresh savedAtMs on restore so the absence cannot be credited twice', () => {
    // An absence is credited by comparing now() against the savedAtMs on disk. If a restore
    // leaves the old stamp there, every subsequent boot measures its absence from the same
    // origin and re-credits time that has already been banked. Closing that window is the whole
    // reason the restore writes straight back instead of waiting for the debounce — and dispose()
    // deliberately does not flush, so a crash or a mobile tab eviction lands squarely in it.
    useGameStore.getState().startSession({ source: 'creation', name: 'Twice Counted', race: 'Half Daemon', klass: 'Robot Monk', seed: 715 });
    useGameStore.setState({ isPaused: false, pendingElapsedMs: 0 });
    expect(writeActiveCheckpoint(localStorage, captureActiveSession(FIXED_SAVED_AT), null).ok).toBe(true);

    const controller = startSessionCheckpoints({ now: () => FIXED_SAVED_AT + 5_000, storage: localStorage });

    expect(useGameStore.getState().pendingElapsedMs).toBe(5_000);
    // On disk, not just in memory: the next boot reads this and nothing else.
    expect(loadActiveCheckpoint(localStorage)).toMatchObject({
      status: 'loaded',
      checkpoint: { session: { savedAtMs: FIXED_SAVED_AT + 5_000 } },
    });
    controller.dispose();
  });
});

describe('the serialized payload cap', () => {
  // MAX_CHECKPOINT_SERIALIZED_LENGTH guards both directions and neither was exercised. The two
  // sibling ledgers each cover their cap; this is the module that decides whether a session can
  // restore at all, so it was the wrong one to leave unexercised.

  const oversizedSession = () => {
    useGameStore.getState().startSession({ source: 'creation', name: 'Overstuffed', race: 'Half Daemon', klass: 'Robot Monk', seed: 11 });
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    // Schema-valid and over the cap at the same time, which is the only combination that reaches
    // the guard: an invalid checkpoint is refused earlier by safeParse for a different reason.
    // MAX_PERSISTED_ITEMS is 5,000 and an item name may be 200 characters, so the inventory alone
    // can carry about 1.1 MB while satisfying every bound the schema states.
    checkpoint.session.character.Inventory = Array.from({ length: MAX_PERSISTED_ITEMS }, (_unused, index) => ({
      name: `${index}`.padEnd(200, 'x'),
      qty: 1,
    }));
    return checkpoint;
  };

  it('refuses to write a checkpoint that serializes past the cap, and writes nothing at all', () => {
    const checkpoint = oversizedSession();
    expect(activeCheckpointV1Schema.safeParse(checkpoint).success).toBe(true);
    expect(JSON.stringify(checkpoint).length).toBeGreaterThan(MAX_CHECKPOINT_SERIALIZED_LENGTH);

    const written: string[] = [];
    const storage = { getItem: () => null, setItem: (key: string) => { written.push(key); } };

    const result = writeActiveCheckpoint(storage, checkpoint, null);
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid_schema', message: 'The active session is too large and was not checkpointed.' },
    });
    // The refusal has to happen before the last-known-good copy is touched. A guard that rejected
    // the write after rotating LKG would spend the recovery copy on a checkpoint it then refused.
    expect(written).toEqual([]);
  });

  /**
   * A checkpoint that serializes to exactly `target` bytes, built by padding one inventory item.
   *
   * Needed because the write guard's boundary is otherwise unpinned: with only an oversized case
   * and an ordinary case, flipping `<=` to `<` passes every test. Item names are plain `x`, so no
   * JSON escaping perturbs the length while it is being tuned.
   */
  const checkpointOfExactly = (target: number) => {
    useGameStore.getState().startSession({ source: 'creation', name: 'Exact', race: 'Half Daemon', klass: 'Robot Monk', seed: 13 });
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    const inventory: { name: string; qty: number }[] = [];
    checkpoint.session.character.Inventory = inventory;
    checkpoint.session.log = [];
    const length = () => JSON.stringify(checkpoint).length;

    // Index-prefixed and padded to a fixed 200: the schema requires inventory names to be unique,
    // so identical filler fails that refinement rather than the size guard being measured. padEnd
    // never truncates, so every name is exactly 200 characters whatever the index, which is what
    // makes the per-item cost below a constant rather than an estimate.
    const filler = (index: number) => ({ name: `${index}`.padEnd(200, 'x'), qty: 1 });

    // Two costs, not one: the first element joins an empty array, every later element also pays
    // for the comma in front of it. Measuring only the first and multiplying overstates nothing
    // and understates by exactly one byte per item, which is a few kilobytes at this scale.
    const base = length();
    inventory.push(filler(0));
    const firstItem = length() - base;
    inventory.push(filler(1));
    const perItem = length() - base - firstItem;
    inventory.length = 0;

    // Solved rather than searched. Re-serializing after every push walks a structure that grows
    // toward a megabyte, so the obvious loop is quadratic — it passed alone and then timed out at
    // five seconds once the suite ran it under load.
    const count = Math.ceil((target - base - firstItem - 900) / perItem) + 1;
    expect(count).toBeLessThanOrEqual(MAX_PERSISTED_ITEMS);
    for (let index = 0; index < count; index += 1) inventory.push(filler(index));
    expect(length()).toBe(base + firstItem + (count - 1) * perItem);

    // Whatever is left is under 900, so one log entry finishes the job inside a description's own
    // 1,000-character cap. Its shape cost is measured, not assumed.
    const before = length();
    checkpoint.session.log = [''];
    checkpoint.session.log = ['x'.repeat(target - before - (length() - before))];
    return checkpoint;
  };

  it('writes a checkpoint of exactly the cap, and refuses one a single byte over', () => {
    // Pins <= against <, the same way the read path's exact-length case pins > against >=.
    const exact = checkpointOfExactly(MAX_CHECKPOINT_SERIALIZED_LENGTH);
    expect(JSON.stringify(exact).length).toBe(MAX_CHECKPOINT_SERIALIZED_LENGTH);
    expect(activeCheckpointV1Schema.safeParse(exact).success).toBe(true);
    expect(writeActiveCheckpoint({ getItem: () => null, setItem: () => {} }, exact, null).ok).toBe(true);

    const over = checkpointOfExactly(MAX_CHECKPOINT_SERIALIZED_LENGTH + 1);
    expect(JSON.stringify(over).length).toBe(MAX_CHECKPOINT_SERIALIZED_LENGTH + 1);
    expect(writeActiveCheckpoint({ getItem: () => null, setItem: () => {} }, over, null).ok).toBe(false);
  });

  it('writes a checkpoint that sits just under the cap', () => {
    // The negative above only proves something is refused; without this it would still pass if the
    // guard refused every write.
    useGameStore.getState().startSession({ source: 'creation', name: 'Ordinary', race: 'Half Daemon', klass: 'Robot Monk', seed: 12 });
    const checkpoint = captureActiveSession(FIXED_SAVED_AT);
    expect(JSON.stringify(checkpoint).length).toBeLessThan(MAX_CHECKPOINT_SERIALIZED_LENGTH);
    expect(writeActiveCheckpoint(localStorage, checkpoint, null).ok).toBe(true);
  });

  it('refuses an over-long stored payload before parsing it, and degrades rather than throwing', () => {
    const oversized = `{"padding":"${'x'.repeat(MAX_CHECKPOINT_SERIALIZED_LENGTH)}"}`;
    const parse = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new Error('parse must not be reached for an oversized payload');
    });

    const load = loadActiveCheckpoint({ getItem: (key) => (key === ACTIVE_CHECKPOINT_KEY ? oversized : null) });

    expect(load).toEqual({
      status: 'corrupt',
      canPersist: false,
      canRepair: true,
      expectedPrimaryRaw: oversized,
      message: 'The saved session is too large to process. Automatic checkpoints are paused.',
    });
    // The cap exists so that an enormous payload is never handed to the parser. Asserting the
    // status alone would still pass if the guard ran after JSON.parse had already walked 1 MB.
    expect(parse).not.toHaveBeenCalled();
  });

  it('applies the cap to the last known good copy as well as the primary', () => {
    // The recovery path calls parseCheckpoint a second time on a different key. A guard placed on
    // only the primary read would leave the backup as an unbounded parse.
    const oversized = `{"padding":"${'x'.repeat(MAX_CHECKPOINT_SERIALIZED_LENGTH)}"}`;
    const load = loadActiveCheckpoint({ getItem: (key) => (key === ACTIVE_CHECKPOINT_LKG_KEY ? oversized : null) });
    expect(load).toMatchObject({ status: 'corrupt', canPersist: false, canRepair: false });
  });

  it('admits a payload of exactly the cap', () => {
    // Pins > against >=. A payload at exactly the limit is allowed through the size guard and then
    // refused by the parser instead, so the two rejections carry different messages. Without this
    // the boundary could drift by one character in either direction unnoticed.
    const exact = 'x'.repeat(MAX_CHECKPOINT_SERIALIZED_LENGTH);
    expect(exact.length).toBe(MAX_CHECKPOINT_SERIALIZED_LENGTH);
    expect(loadActiveCheckpoint({ getItem: (key) => (key === ACTIVE_CHECKPOINT_KEY ? exact : null) })).toMatchObject({
      status: 'corrupt',
      message: 'The saved session is unreadable. Automatic checkpoints are paused.',
    });
  });
});

describe('a tab another tab took over', () => {
  it('offers to take the session back, and the offer works', () => {
    // Refusing to write was always right — this tab's view is stale and overwriting blindly would
    // discard the other tab's play. What was missing is a way out: the tab kept simulating forever
    // with nothing persisted and no way to reclaim the save short of a reload.
    vi.useFakeTimers();
    const mine = createNewCharacter('Watched', 'Half Daemon', 'Robot Monk', 730);
    useGameStore.setState({ character: mine });
    const first = writeActiveCheckpoint(localStorage, captureActiveSession(FIXED_SAVED_AT), null);
    if (!first.ok) throw new Error('Expected a first checkpoint');

    const controller = startSessionCheckpoints({
      now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1, pagehideTarget: window,
    });

    // Another tab writes its own session.
    useGameStore.setState({ character: createNewCharacter('Other Tab', 'Off-Prem Elf', 'Vermineer', 731) });
    const theirs = JSON.stringify(captureActiveSession(FIXED_SAVED_AT));
    useGameStore.setState({ character: mine });
    localStorage.setItem(ACTIVE_CHECKPOINT_KEY, theirs);
    window.dispatchEvent(new StorageEvent('storage', { key: ACTIVE_CHECKPOINT_KEY, newValue: theirs }));

    expect(controller.getNotice()).toMatchObject({ kind: 'alert', canRepair: true, repairLabel: 'Continue in this tab' });

    // Still refuses to write on its own, which is the half that must not change.
    useGameStore.setState({ log: activityLog('Earned while silenced') });
    vi.runAllTimers();
    expect(localStorage.getItem(ACTIVE_CHECKPOINT_KEY)).toBe(theirs);

    // And the offer is real rather than decorative: taking it back writes this tab's character and
    // resumes ordinary checkpoints.
    controller.repair();
    const reclaimed = activeCheckpointV1Schema.safeParse(JSON.parse(localStorage.getItem(ACTIVE_CHECKPOINT_KEY) ?? '{}'));
    expect(reclaimed.success).toBe(true);
    expect(reclaimed.success && reclaimed.data.session.character.Traits.Name).toBe('Watched');
    expect(controller.getNotice()).toMatchObject({ kind: 'status', canRepair: false });

    useGameStore.setState({ log: activityLog('Earned after reclaiming') });
    vi.runAllTimers();
    const after = activeCheckpointV1Schema.safeParse(JSON.parse(localStorage.getItem(ACTIVE_CHECKPOINT_KEY) ?? '{}'));
    expect(after.success && after.data.session.log[0]).toBe('Earned after reclaiming');
    controller.dispose();
  });

  it('says nothing when the other tab wrote what this one already had', () => {
    // The listener fires on every write to the key, including this tab's own. Treating an identical
    // value as a conflict would silence a tab that nothing had taken over.
    const controller = startSessionCheckpoints({
      now: () => FIXED_SAVED_AT, storage: localStorage, intervalMs: 1, pagehideTarget: window,
    });
    const same = localStorage.getItem(ACTIVE_CHECKPOINT_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: ACTIVE_CHECKPOINT_KEY, newValue: same }));

    expect(controller.getNotice()).not.toMatchObject({ repairLabel: 'Continue in this tab' });
    controller.dispose();
  });
});
