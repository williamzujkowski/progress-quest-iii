import { DEFAULT_CHECKPOINT_INTERVAL_MS, MAX_PENDING_ELAPSED_MS, MAX_STORED_PAYLOAD_LENGTH } from '../data/limits';
import { useGameStore } from './gameStore';
import { activeCheckpointV1Schema, type ActiveCheckpointV1 } from './schemas';
import { diagnostics, isDOMExceptionNamed } from './diagnostics';
import { loadMostRecentRosterCharacter } from './saveManager';

export const ACTIVE_CHECKPOINT_KEY = 'progquest_active_session_v1';
export const ACTIVE_CHECKPOINT_LKG_KEY = 'progquest_active_session_lkg_v1';
// The shared payload cap, re-exported under the name this module's callers already use. The
// limit is not the checkpoint's own; every reader of local storage is held to the same one.
export const MAX_CHECKPOINT_SERIALIZED_LENGTH = MAX_STORED_PAYLOAD_LENGTH;

/**
 * How much longer than the debounce a quota retry waits.
 *
 * A multiple of the interval rather than a fixed span so tests can drive the retry without waiting
 * on a real clock. Thirty is far above the ordinary cadence on purpose: a store that is genuinely
 * full will keep failing, and there is nothing to gain by asking it at the debounce rate.
 */
const QUOTA_RETRY_FACTOR = 30;

/**
 * Failures worth attempting again, as against failures that have ended the matter.
 *
 * The two here are transient for different reasons, which is why the distinction is drawn on the
 * code rather than on some property of the write.
 *
 * A full store is transient in its *environment*: the quota is shared across the origin, so it can
 * be relieved by the player deleting something or by another site releasing space, without this tab
 * doing anything.
 *
 * An invalid session is transient in its *subject*. The engine keeps ticking, and a character that
 * momentarily fails the schema is very likely legal again by the next completed task — a few seconds
 * away, not a session away. Treating it as terminal meant one such moment ended persistence for the
 * rest of the session, with `repair()` an inert no-op, while the store went on accruing progress
 * that would never be written. The player is told once and then watches an hour evaporate.
 *
 * Everything else describes the target rather than a moment: storage that is unavailable, corrupt,
 * or claimed by another tab. Those are terminal, and the ones that have a way back offer a repair.
 */
const RETRYABLE_CODES: readonly CheckpointErrorCode[] = ['storage_full', 'invalid_schema'];

type CheckpointErrorCode =
  | 'invalid_schema'
  | 'storage_unavailable'
  | 'storage_corrupt'
  | 'storage_full'
  | 'storage_failed'
  | 'storage_conflict';

export type CheckpointResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: CheckpointErrorCode; message: string } };

export type CheckpointLoad =
  | { status: 'missing'; canPersist: true; expectedPrimaryRaw: null }
  | { status: 'loaded'; canPersist: true; checkpoint: ActiveCheckpointV1; expectedPrimaryRaw: string }
  | { status: 'recovered_lkg'; canPersist: false; canRepair: boolean; repairLabel: string; checkpoint: ActiveCheckpointV1; expectedPrimaryRaw: string | null; message: string }
  | { status: 'corrupt'; canPersist: false; canRepair: false; message: string }
  | { status: 'corrupt'; canPersist: false; canRepair: true; expectedPrimaryRaw: string; message: string }
  /**
   * Bytes a later build wrote, which this one can read but not understand.
   *
   * Repairable on the same terms as a corrupt payload: automatic writes stay blocked, and nothing is
   * overwritten unless the player says so. Withholding the offer never protected the newer
   * checkpoint — the bytes survive either way — it only removed the player's say, and with an empty
   * roster it meant nothing could ever be saved again with no way back short of clearing site data.
   *
   * The label names the consequence rather than the symptom, because this is the one repair whose
   * cost is a payload another build could still use.
   */
  | { status: 'unsupported'; canPersist: false; canRepair: true; repairLabel: string; expectedPrimaryRaw: string; message: string }
  | { status: 'unsupported' | 'unavailable'; canPersist: false; message: string };

function failure(code: CheckpointErrorCode, message: string): CheckpointResult<never> {
  return { ok: false, error: { code, message } };
}

function readRaw(storage: Pick<Storage, 'getItem'>, key: string): CheckpointResult<string | null> {
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return failure('storage_unavailable', 'Browser storage could not be read. Automatic checkpoints are paused.');
  }
}

function parseCheckpoint(raw: string): CheckpointResult<ActiveCheckpointV1> & { unsupported?: boolean } {
  if (raw.length > MAX_CHECKPOINT_SERIALIZED_LENGTH) {
    return failure('storage_corrupt', 'The saved session is too large to process. Automatic checkpoints are paused.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure('storage_corrupt', 'The saved session is unreadable. Automatic checkpoints are paused.');
  }
  if (typeof parsed === 'object' && parsed !== null && 'schemaVersion' in parsed && parsed.schemaVersion !== 1) {
    return { ...failure('storage_corrupt', 'This saved session uses an unsupported version. Automatic checkpoints are paused.'), unsupported: true };
  }
  const result = activeCheckpointV1Schema.safeParse(parsed);
  return result.success
    ? { ok: true, value: result.data }
    : failure('storage_corrupt', 'The saved session is unreadable. Automatic checkpoints are paused.');
}

function writeError(error: unknown): CheckpointResult<never> {
  if (isDOMExceptionNamed(error, 'QuotaExceededError')) {
    return failure('storage_full', 'Browser storage is full. Automatic checkpoints are paused.');
  }
  return failure('storage_failed', 'Browser storage could not save the active session. Automatic checkpoints are paused.');
}

function serializeCheckpoint(checkpoint: ActiveCheckpointV1): CheckpointResult<string> {
  const parsed = activeCheckpointV1Schema.safeParse(checkpoint);
  if (!parsed.success) return failure('invalid_schema', 'The active session is invalid and was not checkpointed.');
  try {
    const raw = JSON.stringify(parsed.data);
    return raw.length <= MAX_CHECKPOINT_SERIALIZED_LENGTH
      ? { ok: true, value: raw }
      : failure('invalid_schema', 'The active session is too large and was not checkpointed.');
  } catch {
    return failure('invalid_schema', 'The active session could not be serialized and was not checkpointed.');
  }
}

export function captureActiveSession(nowMs: number = Date.now()): ActiveCheckpointV1 {
  const state = useGameStore.getState();
  return {
    schemaVersion: 1,
    session: {
      character: structuredClone(state.character),
      rngState: [...state.rng.getState()],
      progression: structuredClone(state.progression),
      pendingElapsedMs: state.pendingElapsedMs,
      savedAtMs: nowMs,
      isPaused: state.isPaused,
      log: state.log.slice(0, 50).map(({ message }) => message),
    },
  };
}

/**
 * Time the app was closed, converted once into elapsed milliseconds the engine can spend.
 *
 * Pure so the awkward cases are testable without a clock: a checkpoint written before this
 * field existed credits nothing, a rolled-back or future clock credits nothing rather than
 * negative or absurd time, and the total is capped by the same ceiling live accrual uses so a
 * long absence cannot hand the engine an unbounded backlog.
 */
export function creditClosedElapsed(
  session: Pick<ActiveCheckpointV1['session'], 'pendingElapsedMs' | 'savedAtMs' | 'isPaused'>,
  nowMs: number,
): number {
  // A paused session asked for time to stop. Honour that across a close as well as a tab switch.
  if (session.isPaused) return session.pendingElapsedMs;
  if (session.savedAtMs === undefined || !Number.isFinite(nowMs)) return session.pendingElapsedMs;
  const closedMs = Math.max(0, nowMs - session.savedAtMs);
  return Math.min(MAX_PENDING_ELAPSED_MS, session.pendingElapsedMs + closedMs);
}

/** Deadpan and approximate on purpose: an exact figure would imply the absence was supervised. */
export function describeAbsence(closedMs: number): string {
  const minutes = Math.floor(closedMs / 60_000);
  if (minutes < 1) return 'A brief absence was filed and required no processing.';
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const span = days >= 1
    ? `${days} day${days === 1 ? '' : 's'}`
    : hours >= 1
      ? `${hours} hour${hours === 1 ? '' : 's'}`
      : `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `Absence of ${span} filed. Progress continued regardless.`;
}

export function restoreActiveSession(checkpoint: ActiveCheckpointV1, nowMs: number = Date.now()): void {
  const parsed = activeCheckpointV1Schema.parse(checkpoint);
  const pendingElapsedMs = creditClosedElapsed(parsed.session, nowMs);
  const creditedMs = pendingElapsedMs - parsed.session.pendingElapsedMs;
  useGameStore.getState().restoreSession({
    ...parsed.session,
    pendingElapsedMs,
    // A line in the feed, not a modal. It reports what already happened and blocks nothing;
    // the progress applies whether or not anyone reads it.
    log: creditedMs > 0 ? [describeAbsence(creditedMs), ...parsed.session.log].slice(0, 50) : parsed.session.log,
  });
}

export function loadActiveCheckpoint(storage: Pick<Storage, 'getItem'>): CheckpointLoad {
  const primary = readRaw(storage, ACTIVE_CHECKPOINT_KEY);
  if (!primary.ok) return { status: 'unavailable', canPersist: false, message: primary.error.message };
  if (primary.value === null) {
    const orphanedBackup = readRaw(storage, ACTIVE_CHECKPOINT_LKG_KEY);
    if (!orphanedBackup.ok) return { status: 'unavailable', canPersist: false, message: orphanedBackup.error.message };
    if (orphanedBackup.value === null) return { status: 'missing', canPersist: true, expectedPrimaryRaw: null };
    const parsedBackup = parseCheckpoint(orphanedBackup.value);
    if (parsedBackup.ok) {
      return {
        status: 'recovered_lkg',
        canPersist: false,
        canRepair: true,
        repairLabel: 'Adopt recovered checkpoint',
        checkpoint: parsedBackup.value,
        expectedPrimaryRaw: null,
        message: 'Recovered an orphaned last known good session. Automatic checkpoints are paused until you adopt it.',
      };
    }
    return parsedBackup.unsupported
      ? { status: 'unsupported', canPersist: false, message: parsedBackup.error.message }
      : { status: 'corrupt', canPersist: false, canRepair: false, message: parsedBackup.error.message };
  }

  const parsed = parseCheckpoint(primary.value);
  if (parsed.ok) return { status: 'loaded', canPersist: true, checkpoint: parsed.value, expectedPrimaryRaw: primary.value };

  const backup = readRaw(storage, ACTIVE_CHECKPOINT_LKG_KEY);
  if (!backup.ok) return { status: 'unavailable', canPersist: false, message: backup.error.message };
  if (backup.ok && backup.value !== null) {
    const parsedBackup = parseCheckpoint(backup.value);
    if (parsedBackup.ok) {
      return {
        status: 'recovered_lkg',
        canPersist: false,
        canRepair: !parsed.unsupported,
        repairLabel: 'Replace unreadable checkpoint',
        checkpoint: parsedBackup.value,
        expectedPrimaryRaw: primary.value,
        message: 'Recovered the last known good session. Automatic checkpoints are paused until you replace the unreadable checkpoint.',
      };
    }
  }
  return parsed.unsupported
    ? {
      status: 'unsupported',
      canPersist: false,
      canRepair: true,
      repairLabel: 'Discard newer checkpoint',
      expectedPrimaryRaw: primary.value,
      message: parsed.error.message,
    }
    : { status: 'corrupt', canPersist: false, canRepair: true, expectedPrimaryRaw: primary.value, message: parsed.error.message };
}

export function writeActiveCheckpoint(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  checkpoint: ActiveCheckpointV1,
  expectedPrimaryRaw: string | null,
): CheckpointResult<{ raw: string }> {
  const serialized = serializeCheckpoint(checkpoint);
  if (!serialized.ok) return serialized;
  const current = readRaw(storage, ACTIVE_CHECKPOINT_KEY);
  if (!current.ok) return current;
  if (current.value !== expectedPrimaryRaw) {
    return failure('storage_conflict', 'Another tab changed the saved session. Automatic checkpoints are paused in this tab.');
  }
  if (current.value !== null) {
    const parsedCurrent = parseCheckpoint(current.value);
    if (!parsedCurrent.ok) return parsedCurrent;
  }
  try {
    if (current.value !== null) storage.setItem(ACTIVE_CHECKPOINT_LKG_KEY, current.value);
    storage.setItem(ACTIVE_CHECKPOINT_KEY, serialized.value);
    return { ok: true, value: { raw: serialized.value } };
  } catch (error) {
    return writeError(error);
  }
}

export function repairActiveCheckpoint(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  checkpoint: ActiveCheckpointV1,
  expectedPrimaryRaw: string | null,
): CheckpointResult<{ raw: string }> {
  const serialized = serializeCheckpoint(checkpoint);
  if (!serialized.ok) return serialized;
  const current = readRaw(storage, ACTIVE_CHECKPOINT_KEY);
  if (!current.ok) return current;
  if (current.value !== expectedPrimaryRaw) {
    return failure('storage_conflict', 'Another tab changed the saved session. Automatic checkpoints are paused in this tab.');
  }
  try {
    storage.setItem(ACTIVE_CHECKPOINT_KEY, serialized.value);
    return { ok: true, value: { raw: serialized.value } };
  } catch (error) {
    return writeError(error);
  }
}

export interface CheckpointNotice {
  kind: 'status' | 'alert';
  message: string;
  canRepair: boolean;
  repairLabel?: string;
}

export interface SessionCheckpointController {
  readonly requiresCharacterCreation: boolean;
  getNotice: () => CheckpointNotice | null;
  subscribe: (listener: () => void) => () => void;
  repair: () => void;
  dispose: () => void;
}

interface VisibilityTarget {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: EventListener): void;
  removeEventListener(type: 'visibilitychange', listener: EventListener): void;
}

interface LifecycleTarget {
  addEventListener(type: 'pagehide' | 'storage', listener: EventListener): void;
  removeEventListener(type: 'pagehide' | 'storage', listener: EventListener): void;
}

interface SessionCheckpointOptions {
  storage?: Storage;
  visibilityTarget?: VisibilityTarget;
  pagehideTarget?: LifecycleTarget;
  intervalMs?: number;
  /** The one place wall-clock enters. Injectable so tests can pin that boundary. */
  now?: () => number;
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function startSessionCheckpoints({
  storage = defaultStorage(),
  visibilityTarget = typeof document === 'undefined' ? undefined : document,
  pagehideTarget = typeof window === 'undefined' ? undefined : window,
  intervalMs = DEFAULT_CHECKPOINT_INTERVAL_MS,
  // Injectable so tests can pin the boundary where wall-clock enters. Everything downstream of
  // this call takes elapsed milliseconds, never a clock.
  now = () => Date.now(),
}: SessionCheckpointOptions = {}): SessionCheckpointController {
  const listeners = new Set<() => void>();
  let notice: CheckpointNotice | null = null;
  let canPersist = false;
  let dirty = false;
  let expectedPrimaryRaw: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failureRecorded = false;
  let repairAllowed = false;
  let requiresCharacterCreation = false;
  let repairSuccessMessage = 'The active-session checkpoint was replaced. Automatic checkpoints resumed.';
  // Whether a retryable failure is currently outstanding, so a later success knows to clear the
  // alert. Without it the player is told storage is full, or the session invalid, for the rest of
  // the session once it plainly is neither.
  let deferred: CheckpointErrorCode | null = null;

  const publish = (next: CheckpointNotice | null) => {
    notice = next;
    for (const listener of listeners) listener();
  };
  // One episode per controller, whether it ends persistence or only defers it. A retrying quota
  // failure would otherwise record on every attempt and bury everything else in the report.
  const recordFailure = (operation: 'read' | 'write') => {
    if (failureRecorded) return;
    failureRecorded = true;
    diagnostics.record({ code: 'session_checkpoint_failed', severity: 'warning', subsystem: 'storage', operation, outcome: 'failed', source: 'session-checkpoint' });
  };
  /**
   * Stops persisting, and says whether there is a way back.
   *
   * The label is a parameter rather than a constant because the two repairable cases are different
   * offers. An unreadable checkpoint offers to replace bytes nobody can read; a checkpoint another
   * tab has taken over offers to take it back. Wording them identically would ask the player to
   * approve one thing and get the other.
   */
  const block = (message: string, operation: 'read' | 'write' = 'write', repairLabel?: string) => {
    canPersist = false;
    repairAllowed = repairLabel !== undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    recordFailure(operation);
    publish({ kind: 'alert', message, canRepair: repairAllowed, ...(repairLabel === undefined ? {} : { repairLabel }) });
  };
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!dirty || !canPersist || storage === undefined) return;
    const result = writeActiveCheckpoint(storage, captureActiveSession(now()), expectedPrimaryRaw);
    if (!result.ok) {
      // A retryable failure stays armed rather than ending persistence — see `RETRYABLE_CODES` for
      // why each of the two is a moment rather than a verdict. Treating either as terminal meant a
      // single spike ended persistence for the session, the `pagehide` flush included, so closing
      // the tab lost everything since the spike and only a reload recovered, which lost it too.
      //
      // The two wait differently, because what they are waiting for differs. A full store is backed
      // off well beyond the ordinary cadence: it will keep failing, and there is nothing to gain by
      // asking at the debounce rate. An invalid session is waiting on the next completed task, which
      // is seconds away, so it retries at the ordinary interval and catches the moment it passes.
      if (RETRYABLE_CODES.includes(result.error.code)) {
        deferred = result.error.code;
        recordFailure('write');
        publish({ kind: 'alert', message: `${result.error.message} It will keep trying.`, canRepair: false });
        timer = setTimeout(flush, intervalMs * (result.error.code === 'storage_full' ? QUOTA_RETRY_FACTOR : 1));
        return;
      }
      block(result.error.message);
      return;
    }
    expectedPrimaryRaw = result.value.raw;
    dirty = false;
    // Clearing the alert is the half that makes the retry worth having: without it the player is
    // told storage is full, or the session invalid, for the rest of the session once it plainly is
    // neither. Which of the two recovered is worth saying, because they name different culprits and
    // a player who freed disk space to fix a schema complaint has been sent to the wrong place.
    if (deferred !== null) {
      const recovered = deferred === 'storage_full' ? 'Browser storage recovered.' : 'The active session is valid again.';
      deferred = null;
      publish({ kind: 'status', message: `${recovered} Automatic checkpoints resumed.`, canRepair: false });
    }
  };
  const schedule = () => {
    dirty = true;
    if (canPersist && timer === undefined) timer = setTimeout(flush, intervalMs);
  };

  if (storage === undefined) {
    block('Browser storage is unavailable. Automatic checkpoints are paused.', 'read');
  } else {
    const loaded = loadActiveCheckpoint(storage);
    if (loaded.status === 'loaded') {
      restoreActiveSession(loaded.checkpoint, now());
      expectedPrimaryRaw = loaded.expectedPrimaryRaw;
      canPersist = true;
      // Write straight back with a fresh timestamp. Without this, a reload before the first
      // debounced save would find the same savedAtMs still on disk and credit the same absence
      // a second time.
      //
      // Marked dirty by hand because the store subscription below is not attached yet, so the
      // set() inside restoreActiveSession notified nobody and flush would otherwise decline as
      // a no-op. The claim is true regardless of who observed it: the store now differs from
      // what is on disk.
      dirty = true;
      flush();
    } else if (loaded.status === 'missing') {
      const mostRecentRosterCharacter = loadMostRecentRosterCharacter(storage);
      if (!mostRecentRosterCharacter.ok) {
        requiresCharacterCreation = true;
        block(`${mostRecentRosterCharacter.error.message} Automatic checkpoints are paused.`, 'read');
      } else if (mostRecentRosterCharacter.value) {
        canPersist = true;
        useGameStore.getState().startSession({ source: 'roster', character: mostRecentRosterCharacter.value });
      } else {
        canPersist = true;
        requiresCharacterCreation = true;
      }
    } else if (loaded.status === 'recovered_lkg') {
      restoreActiveSession(loaded.checkpoint, now());
      expectedPrimaryRaw = loaded.expectedPrimaryRaw;
      repairAllowed = loaded.canRepair;
      if (loaded.expectedPrimaryRaw === null) repairSuccessMessage = 'The recovered active session was adopted. Automatic checkpoints resumed.';
      publish({ kind: 'alert', message: loaded.message, canRepair: loaded.canRepair, ...(loaded.canRepair ? { repairLabel: loaded.repairLabel } : {}) });
      diagnostics.record({ code: 'session_checkpoint_recovered', severity: 'warning', subsystem: 'storage', operation: 'recover', outcome: 'recovered', source: 'session-checkpoint' });
    } else {
      // Both repairable statuses need the bytes they would replace, so the write refuses if another
      // tab moved them first.
      if ((loaded.status === 'corrupt' || loaded.status === 'unsupported') && 'expectedPrimaryRaw' in loaded && loaded.canRepair) {
        expectedPrimaryRaw = loaded.expectedPrimaryRaw;
      }

      // An unreadable checkpoint used to leave the store holding its hard-coded default character,
      // because this branch was the only one that did not consult the roster. The player saw a
      // level-1 stranger, and `repairActiveCheckpoint` captures whatever is in the store — so the
      // button offered to them wrote that stranger over their real save, and the still-readable
      // last-known-good copy went the same way on the next ordinary flush.
      //
      // So adopt the roster's most recent character the way the `missing` branch does. What the
      // player sees is then theirs, and what repair would capture is theirs too.
      //
      // Only where the bytes were read and could not be understood — a corrupt payload, or one a
      // later build wrote. `unavailable` means the read itself threw, so asking the same storage
      // for the roster would only throw again, and it keeps its original behaviour untouched.
      const rosterCharacter = loaded.status === 'corrupt' || loaded.status === 'unsupported'
        ? loadMostRecentRosterCharacter(storage)
        : null;
      if (rosterCharacter?.ok && rosterCharacter.value) {
        useGameStore.getState().startSession({ source: 'roster', character: rosterCharacter.value });
      } else if (rosterCharacter) {
        requiresCharacterCreation = true;
      }

      // Blocked whether or not a character was adopted: the unreadable checkpoint may be newer
      // than the roster copy, and a build that cannot parse it is not evidence that it is
      // worthless. Persisting over it would decide that on the player's behalf.
      // No exception for an empty roster, tempting as it is: the unreadable bytes would then be
      // overwritten by whoever the player creates next, and a payload this build cannot parse is
      // not a payload that is gone. Restoring it is a later build's job, and the existing
      // "blocks automatic writes after a corrupt read" test is the guarantee that says so.
      // Different labels, because the two repairs cost different things. Replacing bytes nobody can
      // read loses nothing; discarding a checkpoint a later build wrote loses something that build
      // could still have used, and a player agreeing to it deserves to be told which they are doing.
      // `unavailable` stays unrepairable: the read itself threw, so asking the same storage again
      // would only throw again.
      const repairOffer = loaded.status === 'corrupt' && loaded.canRepair
        ? 'Replace unreadable checkpoint'
        : loaded.status === 'unsupported' && 'repairLabel' in loaded && loaded.canRepair
          ? loaded.repairLabel
          : undefined;
      block(loaded.message, 'read', repairOffer);
    }
  }

  const unsubscribeStore = useGameStore.subscribe(schedule);
  const handleVisibility = () => {
    if (visibilityTarget?.hidden) flush();
  };
  const handlePagehide = () => flush();
  const handleStorage = (event: Event) => {
    if (!(event instanceof StorageEvent) || event.key !== ACTIVE_CHECKPOINT_KEY) return;
    if (event.newValue === expectedPrimaryRaw) return;

    // Refusing to write is right: this tab's view of the checkpoint is stale, and overwriting
    // blindly would discard whatever the other tab has been doing. What was missing is a way out.
    // The tab kept simulating forever with nothing persisted and no way to reclaim the save short
    // of a reload — the hero levelling on screen the whole time, none of it keepable.
    //
    // So the newer bytes become this tab's baseline. That is what makes the offer real: repair is a
    // compare-and-set against `expectedPrimaryRaw`, and against the value this tab last wrote it
    // could only ever fail. Adopting the baseline lets the player choose which tab wins.
    //
    // Whichever tab they act in takes over, and the other one receives this same event and this
    // same offer. Symmetric on purpose — there is no correct answer to which tab is the real one,
    // only the one the player is looking at.
    expectedPrimaryRaw = event.newValue;
    repairSuccessMessage = 'This tab now owns the saved session. Automatic checkpoints resumed.';
    block(
      'Another tab changed the saved session. Automatic checkpoints are paused in this tab.',
      'write',
      'Continue in this tab',
    );
  };
  visibilityTarget?.addEventListener('visibilitychange', handleVisibility);
  pagehideTarget?.addEventListener('pagehide', handlePagehide);
  pagehideTarget?.addEventListener('storage', handleStorage);

  return {
    requiresCharacterCreation,
    getNotice: () => notice,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    repair: () => {
      if (storage === undefined || !repairAllowed) return;
      const result = repairActiveCheckpoint(storage, captureActiveSession(now()), expectedPrimaryRaw);
      if (!result.ok) {
        block(result.error.message);
        return;
      }
      expectedPrimaryRaw = result.value.raw;
      canPersist = true;
      dirty = false;
      failureRecorded = false;
      repairAllowed = false;
      publish({ kind: 'status', message: repairSuccessMessage, canRepair: false });
    },
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
      unsubscribeStore();
      visibilityTarget?.removeEventListener('visibilitychange', handleVisibility);
      pagehideTarget?.removeEventListener('pagehide', handlePagehide);
      pagehideTarget?.removeEventListener('storage', handleStorage);
      listeners.clear();
    },
  };
}
