import { create } from 'zustand';
import { soundFX } from './audio';
import { describeDecisionReason, describeGameEvent, soundCueForGameEvent } from './gameEventAdapter';
import { RandomGenerator, type PRNGSeed } from '../engine/prng';
import { createNewCharacter } from '../engine/sim';
import { levelUpTime } from '../engine/math';
import { advanceGame, type GameTransitionEvent } from '../engine/transition';
import type { CharacterSheet, ProgressionState, StatsMap } from '../engine/types';
import { MAX_PENDING_ELAPSED_MS, MAX_SOCIAL_ENTRIES, MAX_WORLD_NOTICES } from '../data/limits';
import { projectWorld, type WorldNotice } from './worldContext';
import { projectAmbient, projectSocialBatch, type SocialEntry } from './socialProjection';
import { scheduleChatter, NEW_CADENCE, type ChatterCadence } from './chatterSchedule';
import { fileLoadout } from '../engine/loadoutFiling';
import { mergeEvents, mergeExhibit, readCommendations, writeCommendations, type Commendations } from './commendations';
import { mergeRecords, readCaseload, writeCaseload, type Caseload } from './caseload';
import { EMPTY_DIGEST, accumulateDigest, describeDigest, type AbsenceDigest } from './absenceDigest';
import { mergeSpecimens, readSpecimenLog, writeSpecimenLog, type SpecimenLog } from './specimenLog';
import { loadRoster, saveToRoster } from './saveManager';
import { predecessorFor } from './predecessor';

/**
 * The ledger store, or nothing when the browser refuses to hand it over.
 *
 * The *property access* throws `SecurityError` when storage is blocked — Chrome's "block all
 * cookies", a sandboxed iframe, Firefox with `dom.storage.enabled=false`. Reading it is not the
 * dangerous part; touching it is.
 *
 * Written once because it was written three times and then, in the tick handler, not at all. Those
 * three unguarded call sites stopped the game dead: the throw happened before `set()`, so the store
 * never advanced, every later tick recomputed the same differing ledger and threw again, and
 * `startGameClock` caught it and discarded the banked time. No crash, no error boundary — the hero
 * simply never moved, while the only thing on screen said storage was unavailable, which reads as a
 * save problem rather than a stopped game. Measured: 395 of 400 ticks threw, level 1 after
 * thirty-three simulated minutes.
 */
const ledgerStore = (): Storage | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

// Read once at module load, the same way the roster is read: a ledger that cannot be read is
// simply an empty one, never a reason for the game not to start.
const initialCommendations = readCommendations(ledgerStore());

const initialSpecimens = readSpecimenLog(ledgerStore());

const initialCaseload = readCaseload(ledgerStore());

/**
 * Every character on file, for the surfaces that describe the institution rather than the hero.
 *
 * Read the same way the ledgers above are, and held here for the same reason: `loadRoster` is not an
 * accessor. It reads up to 500 KB, parses it, and runs the character schema over every entry, so a
 * component calling it in a render body puts a full roster validation behind whatever happened to
 * re-render it. Refreshed when a session starts or is restored, which is when the set of characters
 * on file can have changed under this tab.
 *
 * A failed read is an empty roster, never a reason for anything not to render — the same contract
 * the ledgers have.
 */
const readRosterForSession = (): Record<string, CharacterSheet> => {
  const loaded = loadRoster();
  return loaded.ok ? loaded.value : {};
};

// What is believed to be on disk. Seeded with the ledgers just read, so an untouched session
// never rewrites an identical copy.
let lastPersistedCommendations = initialCommendations;
let lastPersistedCaseload = initialCaseload;
let lastPersistedSpecimens = initialSpecimens;

// What the current catch-up drain has produced so far. Module-level rather than store state
// because nothing renders it until it is finished and nothing persists it at all: it exists for
// exactly as long as one backlog takes to work through.
let drainDigest: AbsenceDigest = EMPTY_DIGEST;

// How much had happened when the guild last spoke. Module-level for the same reason the drain digest
// is: nothing renders it and nothing persists it. A reload therefore starts the channel quiet, which
// is what rejoining a channel feels like.
let chatterCadence: ChatterCadence = NEW_CADENCE;

type StartSessionRequest =
  | { source: 'creation'; name: string; race: string; klass: string; seed: PRNGSeed; stats?: StatsMap }
  | { source: 'import' | 'roster'; character: CharacterSheet };

export interface GameStore {
  character: CharacterSheet;
  log: ActivityEntry[];
  worldNotices: WorldNotice[];
  socialEntries: SocialEntry[];
  commendations: Commendations;
  caseload: Caseload;
  specimens: SpecimenLog;
  /** Everyone on file, refreshed at a session boundary rather than at a render. */
  roster: Record<string, CharacterSheet>;
  nextActivityId: number;
  sessionGeneration: number;
  isPaused: boolean;
  rng: RandomGenerator;
  progression: ProgressionState;
  pendingElapsedMs: number;
  
  // Actions
  tick: (elapsedMs: number) => void;
  togglePause: () => void;
  startSession: (request: StartSessionRequest) => void;
  restoreSession: (session: {
    character: CharacterSheet;
    rngState: [number, number, number, number];
    progression: ProgressionState;
    pendingElapsedMs: number;
    isPaused: boolean;
    log: string[];
  }) => void;
}

export interface ActivityEntry {
  readonly id: number;
  readonly message: string;
  /** Optional and supplemental: the chronological line stands on its own without it. */
  readonly reason?: string;
}

export function createActivityEntries(messages: readonly string[], firstId: number): ActivityEntry[] {
  return messages.map((message, index) => ({ id: firstId + index, message }));
}

function createProgression(level: number): ProgressionState {
  return {
    experience: { currentSeconds: 0, maxSeconds: levelUpTime(level) },
    completedTasks: 0,
    elapsedSeconds: 0,
  };
}

function playEventSound(event: GameTransitionEvent): void {
  const cue = soundCueForGameEvent(event);
  if (cue === 'level_up') void soundFX.playLevelUp();
  else if (cue === 'quest_complete') void soundFX.playQuestComplete();
  else if (cue === 'market') void soundFX.playSellLoot();
}

function retainWholeSocialScenes(entries: readonly SocialEntry[]): SocialEntry[] {
  const retained: SocialEntry[] = [];
  for (let start = 0; start < entries.length;) {
    const sceneId = entries[start]?.sceneId;
    let end = start + 1;
    while (end < entries.length && entries[end]?.sceneId === sceneId) end += 1;
    if (retained.length + end - start > MAX_SOCIAL_ENTRIES) break;
    retained.push(...entries.slice(start, end));
    start = end;
  }
  return retained;
}

/**
 * Banks the character being replaced, when it already has a roster entry.
 *
 * All progress since the player's last explicit save lives only in the active checkpoint — the
 * `save_requested` events the engine emits are log lines, and nothing persists on them. So loading
 * another character used to discard everything the current one had earned: the next flush wrote the
 * newcomer over the checkpoint, and the outgoing session survived only in the last-known-good copy
 * until the flush after that. Delete asks for confirmation; this destroyed more and asked nothing.
 *
 * Restricted to characters already in the roster, which is not a hedge but the condition that makes
 * this safe. It updates an entry rather than adding one, so it cannot hit the roster cap, cannot
 * surprise the player with saves they never asked for, and cannot fail for a reason that would have
 * to block the switch.
 *
 * `sessionGeneration` is the guard against the boot path. `startSessionCheckpoints` calls
 * `startSession` while the store still holds its hard-coded default, and the default is named Krg —
 * so without this a player who had saved a character called Krg would have it overwritten by a
 * level-1 stranger every time the app started. Generation is zero until a session is established
 * and non-zero forever after, which is exactly the distinction needed.
 *
 * Best effort throughout: a failure here must never stop the player switching characters. The
 * checkpoint controller already surfaces storage problems through its own notice.
 */
function preserveOutgoingCharacter(state: Pick<GameStore, 'character' | 'sessionGeneration'>): void {
  if (state.sessionGeneration === 0) return;

  const roster = loadRoster();
  if (!roster.ok || !Object.hasOwn(roster.value, state.character.Traits.Name)) return;

  saveToRoster(state.character);
}

export const useGameStore = create<GameStore>((set, get) => {
  const initialRng = new RandomGenerator('default-seed');
  const initialChar = createNewCharacter('Krg', 'Sub-Subprocessor', 'Robot Monk', initialRng);

  return {
    character: initialChar,
    log: createActivityEntries([`Welcome to Progress Quest III! ${initialChar.Traits.Name} the ${initialChar.Traits.Race} ${initialChar.Traits.Class} sets out on an adventure.`], 0),
    worldNotices: [],
    socialEntries: [],
    commendations: initialCommendations,
    caseload: initialCaseload,
    specimens: initialSpecimens,
    roster: readRosterForSession(),
    nextActivityId: 1,
    sessionGeneration: 0,
    isPaused: false,
    rng: initialRng,
    progression: createProgression(initialChar.Traits.Level),
    pendingElapsedMs: 0,

    togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

    startSession: (request: StartSessionRequest) => {
      // Whoever was mid-catch-up is gone. A digest describes one absence by one character, and
      // carrying a partial one across would report another session's work as this one's. The
      // chatter gap goes for the same reason: it was measured against a counter that is no longer
      // this character's.
      drainDigest = EMPTY_DIGEST;
      chatterCadence = NEW_CADENCE;
      const { nextActivityId, sessionGeneration } = get();
      preserveOutgoingCharacter(get());
      let character: CharacterSheet;
      let rng: RandomGenerator;
      let message: string;

      if (request.source === 'creation') {
        rng = new RandomGenerator(request.seed);
        const generated = createNewCharacter(request.name, request.race, request.klass, rng);
        character = request.stats ? { ...generated, Stats: { ...request.stats } } : generated;
        message = `Character ${request.name} created!`;
      } else {
        character = structuredClone(request.character);
        rng = new RandomGenerator(JSON.stringify(character));
        // A hero caught mid-duel brings the continuation with them.
        //
        // The checkpoint schema requires a nemesis cursor's `replayRngState` to equal the session's
        // RNG state, and seeding from the character's own JSON cannot land on it — so a character
        // holding a cursor imported and loaded cleanly and was then unwritable for as long as the
        // duel lasted, with the checkpoint refused on every tick.
        //
        // Adopting the cursor's state rather than dropping the cursor, because the cursor is already
        // self-contained: `replayNemesisRound` sets the generator from this same field before every
        // round. So this parks the generator exactly where the next round will start it anyway, and
        // the duel resumes where it left off instead of being silently discarded on load.
        const cursor = character.PendingTasks?.find((entry) => entry.type === 'nemesis_cursor');
        if (cursor?.type === 'nemesis_cursor') rng.setState(cursor.replayRngState);
        message = `Loaded character ${character.Traits.Name} from ${request.source === 'import' ? 'save data' : 'roster'}.`;
      }

      set({
        // Refreshed here rather than at a render: `preserveOutgoingCharacter` above may just have
        // banked the outgoing hero, so the set of characters on file is different from the one this
        // tab started with.
        roster: readRosterForSession(),
        character,
        rng,
        log: createActivityEntries([message], nextActivityId),
        worldNotices: [],
        socialEntries: [],
        commendations: get().commendations,
        caseload: get().caseload,
        specimens: get().specimens,
        nextActivityId: nextActivityId + 1,
        sessionGeneration: sessionGeneration + 1,
        isPaused: false,
        progression: createProgression(character.Traits.Level),
        pendingElapsedMs: 0,
      });
    },

    restoreSession: (session) => {
      // Same reasoning as startSession: the drain this was accumulating no longer has an owner.
      drainDigest = EMPTY_DIGEST;
      // And neither does the cadence. It carries `recentTexts`, the last eight lines spoken, which
      // `scheduleChatter` declines to repeat — so a loaded character was silently denied lines
      // because the *previous* character had heard them. `startSession` has always reset this; the
      // comment above claimed the same reasoning and only half of it was applied.
      chatterCadence = NEW_CADENCE;
      const { nextActivityId, sessionGeneration } = get();
      const rng = new RandomGenerator('restored-session');
      rng.setState([...session.rngState]);
      set({
        roster: readRosterForSession(),
        character: structuredClone(session.character),
        rng,
        progression: structuredClone(session.progression),
        isPaused: session.isPaused,
        log: createActivityEntries(session.log.toReversed(), nextActivityId).reverse(),
        worldNotices: [],
        socialEntries: [],
        commendations: get().commendations,
        caseload: get().caseload,
        specimens: get().specimens,
        nextActivityId: nextActivityId + session.log.length,
        sessionGeneration: sessionGeneration + 1,
        pendingElapsedMs: session.pendingElapsedMs,
      });
    },

    tick: (elapsedMs: number) => {
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
      const { character, isPaused, rng, log, worldNotices, socialEntries, nextActivityId, progression, pendingElapsedMs } = get();
      if (isPaused) return;
      const elapsedBudgetMs = Math.min(MAX_PENDING_ELAPSED_MS, pendingElapsedMs + elapsedMs);
      const result = advanceGame({ character, progression }, elapsedBudgetMs, rng);
      const sources = result.records.map((record, index) => ({ activityId: nextActivityId + index, record }));
      for (const { record } of sources) playEventSound(record.event);
      const activity = sources.map(({ activityId: id, record }) => {
        const reason = describeDecisionReason(record.event);
        return reason === undefined
          ? { id, message: describeGameEvent(record.event) }
          : { id, message: describeGameEvent(record.event), reason };
      }).reverse();
      // One projection per record, used for both the world notices and the exhibit case, rather
      // than classifying the same equipment twice.
      const projections = sources.map((source) => ({ source, projection: projectWorld({ kind: 'transition', source }) }));
      const projectedWorldNotices = projections.flatMap(({ projection }) => projection.notices).toReversed();
      // Records are a maximum over events, so this returns the same object on the overwhelming
      // majority of ticks of ordinary play.
      let nextCommendations = mergeEvents(get().commendations, sources.map(({ record }) => record.event));
      for (const { source, projection } of projections) {
        const event = source.record.event;
        // The classification belongs to the equipment this record awarded, so pair them here
        // rather than trying to reconstruct which item it described later.
        //
        // Purchases count too. The exhibit is the best thing ever worn in each slot, and a bought
        // upgrade is worn exactly like a found one — transition.ts writes it straight into Equip.
        // Listening only for equipment_gained left the market out of a record that claims to cover
        // everything, so a hero who bought their best breastplate had a case with a gap in it.
        if ((event.type === 'equipment_gained' || event.type === 'equipment_purchased') && projection.equipment) {
          nextCommendations = mergeExhibit(nextCommendations, event.slot, event.name, projection.equipment);
        }
      }
      // Held back until the backlog is drained. Catching up on a long absence replays many levels
      // and quests per tick, and questsCompleted/actsCompleted count rather than compare, so a new
      // record lands on nearly every tick of a drain — a synchronous stringify and localStorage
      // write roughly eighteen times a second, on the thread already running the engine and the
      // render. The in-memory ledger stays current either way, so the panel is never stale; only
      // the persisted copy waits. A tab closed mid-drain loses that interval's records, which is
      // the right thing for a decorative ledger to lose to keep the drain smooth.
      //
      // Compared against what was last written rather than against the previous tick, because the
      // tick that finishes a drain need not be one that set a record — and everything banked
      // during the drain has to land on the first opportunity after it, not linger until the next
      // record happens along.
      // A drain is running whenever the tick started with time banked. Accumulate then, and only
      // then: ordinary play spends its 50ms immediately and must never produce a digest.
      const draining = pendingElapsedMs > 0;
      if (draining) drainDigest = accumulateDigest(drainDigest, sources.map(({ record }) => record.event));
      const digestLine = draining && result.remainingElapsedMs === 0 ? describeDigest(drainDigest) : null;
      if (draining && result.remainingElapsedMs === 0) drainDigest = EMPTY_DIGEST;

      if (result.remainingElapsedMs === 0 && nextCommendations !== lastPersistedCommendations) {
        lastPersistedCommendations = nextCommendations;
        writeCommendations(ledgerStore(), nextCommendations);
      }

      // Records rather than events: the kind of a completed quest is not on the event, only on the
      // snapshot beside it. Held back and compared the same way the commendation ledger is, for
      // the same reason - a drain closes many quests per tick, and every one of them counts.
      const nextCaseload = mergeRecords(get().caseload, result.records);
      // A specimen is new only once, so this returns the same object on nearly every tick.
      const nextSpecimens = mergeSpecimens(get().specimens, sources.map(({ record }) => record.event));
      if (result.remainingElapsedMs === 0 && nextCaseload !== lastPersistedCaseload) {
        lastPersistedCaseload = nextCaseload;
        writeCaseload(ledgerStore(), nextCaseload);
      }
      // Held back through a drain for the same reason the other ledgers are: a catch-up replays
      // many first sightings, and each would otherwise be its own synchronous write.
      if (result.remainingElapsedMs === 0 && nextSpecimens !== lastPersistedSpecimens) {
        lastPersistedSpecimens = nextSpecimens;
        writeSpecimenLog(ledgerStore(), nextSpecimens);
      }
      const chatterTasks = sources.at(-1)?.record.post.completedTasks ?? progression.completedTasks;
      const scheduled = scheduleChatter(
        // The assignment ring off the post-batch sheet, for the same reason the loadout below comes
        // from the sheet rather than the snapshot: the engine needs no new field and the recorded
        // sessions stay untouched.
        projectSocialBatch(sources, result.state.character.Quest.history),
        chatterCadence,
        chatterTasks,
        // Offered on every batch as a thunk; the schedule decides whether the silence is worth
        // filling, and only then is any of this built.
        //
        // The filing comes from the sheet the store already holds rather than from the snapshot, so
        // the engine needs no new field and the recorded sessions stay untouched. What changed is
        // when it runs, and the deferral is worth far more than the figures here once claimed.
        //
        // Those figures named the wrong function. `fileLoadout` was said to cost 22 µs of a 26 µs
        // tick; re-measured, it is a cache hit at 0.04 µs on the overwhelming majority of calls,
        // because it is keyed on `Equip` identity and the thunk rarely fires twice across a change.
        // What actually costs anything is this `projectAmbient` call with a full memory bag —
        // 24 µs against 6 µs without one. The difference is derivation done eagerly, before the
        // lane that needs it has been chosen, so most of it is discarded whatever happens.
        //
        // The tick itself is 2.3 to 3.7 µs measured through the store, not 26. So the saving is
        // larger than it was described as, not smaller: this branch is reached on well under one
        // per cent of ticks, and it is several times the cost of the tick that skips it.
        () => projectAmbient(
          sources.at(-1)?.record.post.hero ?? { name: character.Traits.Name, race: character.Traits.Race, className: character.Traits.Class },
          chatterTasks,
          {
            loadout: fileLoadout(result.state.character),
            caseload: nextCaseload,
            // Computed inside the thunk like everything else here: `predecessorFor` walks the whole
            // roster, and `scheduleChatter` reaches its ambient branch on about three ticks in every
            // hundred.
            predecessor: predecessorFor(get().roster, result.state.character.Traits.Name),
            commendations: nextCommendations,
            // Where the hero ends the batch standing, taken from the projections already computed
            // above rather than projecting the world a second time.
            venue: projections.at(-1)?.projection.context,
            specimens: nextSpecimens,
          },
        ),
      );
      chatterCadence = scheduled.cadence;
      // Reversed into the newest-first feed, with the catch-up row lifted back to the top.
      //
      // `projectSocialBatch` returns `[catchUpRow, ...detailed]` because that is the reading order.
      // Reversing the whole batch put the row *below* the scenes it summarises, which reads as one
      // more entry rather than a total — the exact failure the activity log's own comment describes
      // and deliberately avoids a few lines further down. The two surfaces were doing opposite
      // things and only one of them had an argument attached.
      const reversed = scheduled.entries.toReversed();
      const summaryAt = reversed.findIndex(({ sceneKind }) => sceneKind === 'catch_up');
      const projectedSocialEntries = summaryAt < 0
        ? reversed
        : [reversed[summaryAt]!, ...reversed.filter((_unused, index) => index !== summaryAt)];
      /*
       * The three feeds keep their previous array when nothing was added to them.
       *
       * These spreads used to run unconditionally, so every feed got a fresh identity on every
       * tick while its contents almost never moved. Measured over 2 000 real ticks on a warmed
       * save: identity changed 2 000 times, the activity log's head changed 32, the chatter feed's
       * head changed 7. Around 99% of those were a new array holding exactly what the old one held.
       *
       * Zustand compares by reference, so each of those woke `LogFeed` and `ChatterFeed` twenty
       * times a second to rebuild about 138 keyed rows — including the tab that is currently
       * `hidden` — and `LogFeed` re-derives the whole world projection in its render body, which
       * costs 33 item analyses. The simulation itself is a fraction of a microsecond; this was most
       * of the rest.
       *
       * The tick was 26 µs when that was written and is 2.3 to 3.7 µs now, measured through the
       * store on saves from fresh to a day old. The ratio is what the argument rests on and it
       * still holds — but a bare figure in a comment is exactly the thing that goes stale without
       * anybody able to notice, so this one is stated as a shape rather than a number.
       *
       * Returning the previous array is safe because it is already in its final form: it was
       * capped when it was built, and with nothing to prepend there is nothing to re-cap.
       */
      const nextLog = activity.length === 0 && digestLine === null
        ? log
        : [
          // Ahead of the batch it summarises, because the feed is newest-first and a summary
          // that appears below its own contents reads as one more entry rather than a total.
          ...(digestLine === null ? [] : [{ id: nextActivityId + activity.length, message: digestLine }]),
          ...activity,
          ...log,
        ].slice(0, 50);
      const nextWorldNotices = projectedWorldNotices.length === 0
        ? worldNotices
        : [...projectedWorldNotices, ...worldNotices].slice(0, MAX_WORLD_NOTICES);
      const nextSocialEntries = projectedSocialEntries.length === 0
        ? socialEntries
        : retainWholeSocialScenes([...projectedSocialEntries, ...socialEntries]);

      set({
        ...result.state,
        pendingElapsedMs: result.remainingElapsedMs,
        log: nextLog,
        worldNotices: nextWorldNotices,
        socialEntries: nextSocialEntries,
        nextActivityId: nextActivityId + activity.length + (digestLine === null ? 0 : 1),
        commendations: nextCommendations,
        caseload: nextCaseload,
        specimens: nextSpecimens,
      });
    },
  };
});
