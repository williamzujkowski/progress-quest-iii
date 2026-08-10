/**
 * Filing velocity: completed tasks per hour, over a rolling window.
 *
 * The rate is the more honest headline than the total for a game about watching numbers go up —
 * a total only tells you what already happened, while a rate tells you it is still happening
 * without requiring anyone to sit and watch it. Tasks rather than gold because `completedTasks`
 * only ever increases, so the figure reflects progress rather than the market's mood.
 *
 * Deliberately not part of the engine or the checkpoint. It is derived from state that already
 * exists, holds no authority, and its absence changes nothing about the simulation.
 */

import { retainWithin } from './rollingWindow';

export interface VelocitySample {
  /** Wall clock, used only to decide which samples are still recent enough to keep. */
  readonly atMs: number;
  readonly completedTasks: number;
  /**
   * The game's own clock, and the denominator.
   *
   * Dividing by wall time is right during ordinary play and wrong by an order of magnitude the
   * moment the app credits a closed absence: a catch-up drain replays hours of game time in seconds
   * of real time, so any window overlapping it reports a rate that has nothing to do with how fast
   * the player is progressing. Measured after a six-hour absence: a true 782 filed/hr rendered as
   * 62,100, and held near 60,100 for the whole five-minute window before the spike aged out.
   *
   * `trackProjection` states this hazard and defends against it the same way. This module had the
   * same denominator and no guard.
   *
   * A drain inflates tasks and elapsed seconds together, so the ratio survives it unchanged.
   */
  readonly elapsedSeconds: number;
}

/** Samples older than this are dropped, so the figure tracks the recent past rather than the run. */
export const VELOCITY_WINDOW_MS = 5 * 60_000;

/**
 * Below this the rate is too noisy to be worth showing, so it is not shown.
 *
 * Counted in game seconds now that the denominator is the game clock. During ordinary play a game
 * second is a real second, so the threshold means what it used to mean; after a drain it is reached
 * immediately, which is correct — the tasks really did happen.
 */
const MINIMUM_SPAN_SECONDS = 20;

const SECONDS_PER_HOUR = 3600;

export const retainWindow = (samples: readonly VelocitySample[], nowMs: number): VelocitySample[] =>
  retainWithin(samples, nowMs, VELOCITY_WINDOW_MS);

/**
 * Tasks per hour across the retained window, or null when there is not enough of one to say.
 * Returning null rather than a wild first number matters: an idle game's first impression is a
 * number that is supposed to look trustworthy.
 */
export function computeFilingVelocity(samples: readonly VelocitySample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const spanSeconds = last.elapsedSeconds - first.elapsedSeconds;
  // A restored session or a new character can move either counter backwards. Report nothing rather
  // than a negative velocity, which would be a lie about a monotonic quantity.
  if (spanSeconds < MINIMUM_SPAN_SECONDS) return null;

  const completed = last.completedTasks - first.completedTasks;
  if (completed < 0) return null;

  return Math.round((completed / spanSeconds) * SECONDS_PER_HOUR);
}
