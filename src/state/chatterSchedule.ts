import { stableChoice } from '../engine/text';
import type { SocialEntry, SocialSceneKind } from './socialProjection';

/**
 * When the simulated guild says anything, decided apart from what it says.
 *
 * The chatter feed read as an event log with usernames because it was one: every scene was triggered
 * by something the hero did, every scene was the same length in the same order, and the rate was an
 * order of magnitude above what a room of people produces. A slower version of that is still a
 * caption track. The structural fix is that chat has to exist when nothing has happened, and events
 * have to interrupt it rather than cause it.
 *
 * So the decision splits in two. `projectSocialBatch` keeps deciding what a moment *could* say; this
 * decides whether anyone speaks at all. It has to live outside that function rather than inside it:
 * the projection is called fresh on every 50 ms tick with only that tick's records and no memory of
 * what it emitted a second ago, and its byte-stability test throws if `Math.random` or `Date.now` is
 * touched. Cadence needs exactly the memory and the clock that function is forbidden.
 *
 * Every rule here is a pure function of counters the engine already keeps, so the same save always
 * produces the same channel. `gameStore` calls `scheduleChatter` on every batch, so these rules now
 * decide what reaches the feed.
 */

/**
 * Gaps in completed tasks between one line and the next, drawn by hash rather than in order.
 *
 * Heavy-tailed on purpose. A channel that speaks every N tasks reads as a machine at any N — it is
 * the evenness that gives it away, not the rate. Real chat is ninety seconds of overlap and then
 * four dead minutes, and the dead minutes are load-bearing: they are what makes the next burst read
 * as people arriving at a topic rather than a timer firing.
 *
 * Two ones and a thirty in the same list is the point. Consecutive short gaps produce the burst,
 * the long tail produces the silence, and the mean lands near six without any gap ever being six.
 */
const TASK_GAPS = [1, 1, 2, 3, 5, 8, 14, 30] as const;

/**
 * The share of ordinary events that get to say anything.
 *
 * One in five, which is the difference between reporting and noticing. The rest are dropped in
 * silence — deliberately without a "12 scenes were consolidated" row, because that row exists to
 * explain a catch-up drain and using it here would announce the suppression instead of performing
 * it.
 */
const ADMITTED_IN = 5;

/**
 * Whether enough has happened since the last line for anyone to speak again.
 *
 * The gap is redrawn for each attempt from the key rather than fixed, so the interval varies without
 * anything having to remember which interval it chose. Keys should be built from values that change
 * per line — the hero's identity and the task count — so consecutive attempts do not all draw the
 * same gap and freeze the channel.
 */
export function readyToSpeak(completedTasks: number, lastLineTasks: number, key: string): boolean {
  if (!Number.isFinite(completedTasks) || !Number.isFinite(lastLineTasks)) return false;
  // A counter that has gone backwards means a different session's numbers arrived, which is a
  // reason to speak now rather than to wait out a gap measured against a stranger.
  if (completedTasks < lastLineTasks) return true;
  return completedTasks - lastLineTasks >= TASK_GAPS[stableChoice(key, TASK_GAPS.length)]!;
}

/**
 * Whether an ordinary event is one of the few that gets a line.
 *
 * `stableChoice` rather than a modulo of the task count, because a modulo admits every fifth event
 * exactly and the regularity is visible within a minute — the same reason the gaps above are drawn
 * rather than cycled. Two-way and few-way branches in this codebase use `stableChoice` for a
 * documented reason: `stableIndex` decides a length-two choice on the parity of the key's character
 * sum, which once collapsed all four cast seats onto two troupes.
 *
 * Took a `priority` until now, with anything at or above ninety admitted outright. The only caller
 * passed zero, always, so the escape hatch was unreachable in play and exercised solely by its own
 * test — and the job it was built for is already done by `ALWAYS_HEARD` below, which gates on scene
 * kind rather than on a number nobody was setting.
 */
export function admitsEvent(key: string): boolean {
  return stableChoice(key, ADMITTED_IN) === 0;
}

/**
 * Scene kinds that always speak.
 *
 * A milestone, an act, or a level is the one suppression a player would read as a bug rather than
 * as restraint. `catch_up` is here because it is the row that explains a drain — silencing the
 * explanation is worse than the noise it exists to replace.
 */
const ALWAYS_HEARD: readonly SocialSceneKind[] = ['milestone', 'level', 'catch_up'];

/** How often a free slot is actually spent on an ambient line rather than left silent. */
const AMBIENT_IN = 3;

/** How much had happened when the guild last said anything. */
export interface ChatterCadence {
  readonly lastLineTasks: number;
  /**
   * The last few lines actually shown, newest first.
   *
   * Two ambient lanes deliberately hold one string for a long stretch — a running bit keeps its beat
   * for forty completed tasks, and the trade advertisement is fixed for the life of a character.
   * Both are right in themselves, and both made the same sentence arrive twice inside one unscrolled
   * panel, which is what a re-asked question looks like when it is re-asked four lines later instead
   * of four minutes later.
   *
   * That was measured at 15% of ambient lines repeating within five when this was written, against
   * a rotation of eleven lanes. It is 6.0% now, on eighteen — the seven lanes added since draw the
   * running bits less often, so they collide with themselves less often. The guard is still earning
   * its place: six lines in a hundred repeating inside one unscrolled panel is still a panel that
   * looks broken, and they are still the same two lanes doing it.
   *
   * The rate is measured in `chatterRepetition.test.ts` rather than only stated here, for the reason
   * the thunk's own rate needed a test: a figure nobody can run is one that drifts silently.
   *
   * Rendering memory, not conversation memory. It exists to refuse a line, never to compose one, so
   * it stays short — long enough to cover a visible panel and no longer.
   */
  readonly recentTexts: readonly string[];
}

/** About what fits on screen at once, which is the window a repeat is actually noticed in. */
const RECENT_TEXTS = 8;

export const NEW_CADENCE: ChatterCadence = { lastLineTasks: 0, recentTexts: [] };

/** Newest first, oldest dropped. */
function remember(recent: readonly string[], spoken: readonly SocialEntry[]): readonly string[] {
  return [...spoken.map(({ text }) => text).reverse(), ...recent].slice(0, RECENT_TEXTS);
}

/**
 * Decides whether a batch of already-written lines is spoken at all.
 *
 * Deliberately downstream of `projectSocialBatch` rather than inside it. That function answers what
 * a moment could say and is asserted byte-stable from its input alone; this answers whether anyone
 * says it, which needs memory across ticks and a notion of elapsed time. Keeping them apart is what
 * lets the wording be tested without a clock and the cadence be tested without any wording.
 *
 * Gating happens per scene, never per line, so a scene is heard whole or not at all. Half a
 * three-line exchange is worse than none of it.
 *
 * Two independent gates. Admission drops four ordinary scenes in five, which is the difference
 * between reporting and noticing. The cadence gap then decides whether what survives arrives now or
 * waits, drawn rather than fixed so the channel is bursty instead of evenly spaced — evenness is
 * what gives a feed away, at any rate.
 */
export function scheduleChatter(
  entries: readonly SocialEntry[],
  cadence: ChatterCadence,
  completedTasks: number,
  /*
   * A thunk, because building it costs more than the rest of the tick and is discarded almost
   * always. `fileLoadout` behind it runs twenty-two `analyzeItemMechanics` calls, and this branch is
   * reached on roughly 610 of 20 000 ticks — 3.1%, or about one tick in eight of those that produce
   * any record at all. The caller cannot know whether it is needed — that is this function's
   * decision — so the decision is where the work now happens.
   *
   * That figure read "27 of 20 000" until it was measured again and came back twenty-three times
   * larger. The conclusion did not move — 3.1% against 100% is still a thirty-two-fold saving — but
   * a perf comment nobody can run is how a number drifts this far without anybody noticing, so the
   * rate is now asserted in `chatterThunkRate.test.ts` rather than only claimed here.
   */
  ambientFor: () => readonly SocialEntry[] = () => [],
): { readonly entries: readonly SocialEntry[]; readonly cadence: ChatterCadence } {
  const scenes = [...new Set(entries.map(({ sceneId }) => sceneId))];
  const kindOf = (sceneId: string) => entries.find((entry) => entry.sceneId === sceneId)?.sceneKind;

  /**
   * A batch carrying a `catch_up` row is a return from being away, not a tick.
   *
   * A hidden tab does not advance the clock at all — `gameClock` returns early on `document.hidden`
   * — so time is banked and every return is a drain of up to a hundred tasks per tick. The
   * projection has already looked at those hundreds and kept the few worth reading, ranked by the
   * priority ladder `chooseCandidate` assigns.
   *
   * Running that curated handful through the one-in-five gate below was applying a rule written for
   * a live tick to a batch that is nothing like one. Measured across a one-hour absence: eight
   * hundred and forty-five scenes offered, seventy-two kept by the projection, and ten admitted.
   * Meanwhile the row *announcing* that scenes were discarded is in `ALWAYS_HEARD` and never
   * dropped, so the notice of the loss was unconditional and the content was a lottery.
   */
  const returning = scenes.some((sceneId) => kindOf(sceneId) === 'catch_up');

  const heard = new Set(scenes.filter((sceneId) => {
    const kind = kindOf(sceneId);
    if (kind !== undefined && ALWAYS_HEARD.includes(kind)) return true;
    // Curated once is enough. The gate exists to keep a live channel from narrating every kill, and
    // there is no live channel during a drain — there is a person who has just come back.
    if (returning) return true;
    return admitsEvent(`${sceneId}:${completedTasks}`);
  }));

  // A scene that always speaks is not subject to the gap either. Making a level-up wait would put
  // it behind loot the player is no longer looking at.
  const unconditional = [...heard].some((sceneId) => {
    const kind = kindOf(sceneId);
    return kind !== undefined && ALWAYS_HEARD.includes(kind);
  });
  if (!unconditional && !readyToSpeak(completedTasks, cadence.lastLineTasks, `gap:${completedTasks}`)) {
    return { entries: [], cadence };
  }

  if (heard.size > 0) {
    const spoken = entries.filter(({ sceneId }) => heard.has(sceneId));
    return { entries: spoken, cadence: { lastLineTasks: completedTasks, recentTexts: remember(cadence.recentTexts, spoken) } };
  }

  // Nothing the hero did earned a line, which is most of the time and is when a real channel is at
  // its most characteristic. Ambient fills that silence rather than bypassing the rate limit — the
  // gap above has already been paid. Without this the feed can only ever be about the hero, which
  // is the property that made it read as a caption track.
  //
  // Reached whether the event scenes were dropped by admission or never existed. Only checking the
  // second left ambient firing once in thirty simulated minutes, because the projection nearly
  // always produces something for admission to throw away.
  //
  // Declined most of the time even so. Filling every free slot took the feed to six messages a
  // minute and made ambient seven lines in ten, which is a caption track with a different subject.
  // A channel is quiet more often than it speaks, and the quiet is what makes the next line read as
  // somebody arriving at a topic rather than a timer firing.
  // The lottery is drawn before the batch is built, so the overwhelming majority of ticks never
  // pay for one. Order matters here and it is cheap to get backwards.
  if (stableChoice(`say:${completedTasks}`, AMBIENT_IN) === 0) {
    const ambient = ambientFor();
    if (ambient.length === 0) return { entries: [], cadence };
    // Declined rather than substituted when it would repeat something still on screen. Substituting
    // would need a second choice and a rule for when that one repeats too; declining costs nothing,
    // because two free slots in three are already declined and silence is the established answer.
    if (ambient.some(({ text }) => cadence.recentTexts.includes(text))) return { entries: [], cadence };
    return { entries: ambient, cadence: { lastLineTasks: completedTasks, recentTexts: remember(cadence.recentTexts, ambient) } };
  }
  return { entries: [], cadence };
}
