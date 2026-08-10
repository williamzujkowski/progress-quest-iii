/**
 * How long until the next promotion, projected from the rate the hero actually earns experience.
 *
 * Two plausible shortcuts are wrong here, and both are worth naming because both read as correct.
 *
 * The first is to treat the experience track as a clock: subtract currentSeconds from maxSeconds
 * and call the difference a duration. The track is denominated in seconds and advances by exactly
 * `task.durationMs / 1000`, so this looks like an identity. It is not. `transition.ts` advances
 * the track only inside its `task.type === 'kill'` branch, while heading to the killing fields,
 * walking to market, selling, buying, and every plot and cinematic task consume time and
 * contribute nothing. The shortcut therefore runs short, always in the same direction. The ratio
 * is pinned by test rather than quoted here, so it cannot drift out from under this note.
 *
 * The second is to measure the rate against the wall clock. That is right during ordinary play and
 * wrong by an order of magnitude the moment the app credits a closed absence: the catch-up drain
 * replays hours of game time in seconds of real time, and any window overlapping it reports a rate
 * that has nothing to do with how fast the player is actually progressing.
 *
 * So the denominator is `progression.elapsedSeconds`, the game's own clock, which accrues on every
 * completed task. Experience-seconds per elapsed-second is a stable property of the engine's task
 * mix, and it does not care whether those seconds arrived live, in a drain, or beside a pause.
 * During ordinary play a game second is very nearly a real second, which is what makes the result a
 * duration the player can read.
 *
 * "Very nearly" rather than "is". The clock accrues a rounded task duration, so it runs within a
 * fraction of a percent of real task time — measured at 0.997 to 0.999 over twelve hours — rather
 * than exactly on it. It used to floor instead, which lost about 0.368 s per task in the same
 * direction every time and put the ratio at 0.916, and this sentence asserted otherwise the whole
 * while. The bound is pinned in `elapsedDrift.test.ts` rather than restated here.
 */

import { retainWithin } from './rollingWindow';

export interface TrackSample {
  readonly atMs: number;
  readonly currentSeconds: number;
  readonly maxSeconds: number;
  readonly elapsedSeconds: number;
}

/** Long enough to average over a market trip, short enough to track a change in the task mix. */
const TRACK_WINDOW_MS = 5 * 60_000;

/**
 * Game seconds, not real ones. The window is retained by wall clock so the buffer stays bounded,
 * but the rate is only trustworthy once the game itself has advanced far enough to have covered
 * more than a single long task.
 */
const MINIMUM_ELAPSED_SPAN = 45;

/**
 * Beyond this the figure stops being a projection and becomes a provocation. Levels get expensive
 * quickly, and "expected in 3 years" is a joke the panel would be making at the player's expense
 * rather than the institution's.
 */
export const MAX_PROJECTED_SECONDS = 100 * 60 * 60;

export const retainTrackWindow = (samples: readonly TrackSample[], nowMs: number): TrackSample[] =>
  retainWithin(samples, nowMs, TRACK_WINDOW_MS);

/**
 * Seconds of play until the track fills at the observed rate, or null when there is nothing
 * honest to say.
 *
 * Null rather than a guess in every ambiguous case. This number's only value is that it can be
 * trusted, and an idle game is watched for hours by someone who will notice when it cannot be.
 */
export function projectTrack(samples: readonly TrackSample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;

  // The game's clock, not the wall's. A paused session and a backgrounded tab both simply stop
  // advancing it, which is exactly the behaviour a rate wants from a denominator.
  const elapsed = last.elapsedSeconds - first.elapsedSeconds;
  if (elapsed < MINIMUM_ELAPSED_SPAN) return null;

  // A level-up resets the track to zero, so a window straddling one reads as a loss. Discarding
  // it means the readout is briefly absent after each promotion, which is the correct thing for
  // it to be: the rate across a reset is not a rate.
  const gained = last.currentSeconds - first.currentSeconds;
  if (gained <= 0) return null;

  // Compare against the track the last sample was on. Reading maxSeconds from the first sample
  // would project the old level's requirement onto the new level's progress.
  const remaining = last.maxSeconds - last.currentSeconds;
  if (remaining <= 0) return null;

  const perElapsedSecond = gained / elapsed;
  const projectedSeconds = remaining / perElapsedSecond;
  if (!Number.isFinite(projectedSeconds) || projectedSeconds <= 0) return null;
  if (projectedSeconds > MAX_PROJECTED_SECONDS) return null;

  return Math.round(projectedSeconds);
}
