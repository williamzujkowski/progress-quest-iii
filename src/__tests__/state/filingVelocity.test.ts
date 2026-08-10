import { describe, expect, it } from 'vitest';
import { computeFilingVelocity, retainWindow, VELOCITY_WINDOW_MS } from '../../state/filingVelocity';

/**
 * A sample during ordinary play, where a game second is a real second.
 *
 * `elapsedSeconds` defaults from the wall clock so the existing cases keep meaning what they meant:
 * they were all written for live play, and the rate is unchanged there. The drain cases below pass
 * it explicitly, because a drain is exactly where the two clocks diverge.
 */
const at = (atMs: number, completedTasks: number, elapsedSeconds = atMs / 1000) =>
  ({ atMs, completedTasks, elapsedSeconds });

describe('filing velocity', () => {
  it('reports tasks per hour across the sampled span', () => {
    // 30 tasks in 10 minutes is 180/hour.
    expect(computeFilingVelocity([at(0, 100), at(600_000, 130)])).toBe(180);
  });

  it('says nothing until the span is long enough to mean anything', () => {
    expect(computeFilingVelocity([])).toBeNull();
    expect(computeFilingVelocity([at(0, 5)])).toBeNull();
    // A wild first number is worse than no number in a game whose whole surface is figures.
    expect(computeFilingVelocity([at(0, 0), at(5_000, 9)])).toBeNull();
  });

  it('says nothing rather than reporting a negative rate', () => {
    // Restoring a session or starting a new character can move the counter backwards.
    expect(computeFilingVelocity([at(0, 500), at(60_000, 3)])).toBeNull();
  });

  it('reports zero honestly when nothing was filed', () => {
    expect(computeFilingVelocity([at(0, 42), at(120_000, 42)])).toBe(0);
  });

  it('survives a catch-up drain instead of reporting a rate nobody achieved', () => {
    /*
     * The denominator used to be wall time. A drain replays hours of game time in seconds of real
     * time, so a window overlapping one reported a rate with no relationship to how fast the player
     * was progressing — measured at 62,100 filed/hr against a true 782, held for the whole
     * five-minute window before the spike aged out.
     *
     * Here: 4,000 tasks arrive across six hours of game time, credited in two seconds of wall time.
     * The honest answer is the game-time rate.
     */
    const drained = computeFilingVelocity([
      at(0, 1000, 0),
      at(2_000, 5000, 6 * 3600),
    ]);
    expect(drained).toBe(667);

    // The same span read against the wall clock, which is what this used to do.
    expect(Math.round((4000 / 2_000) * 3_600_000)).toBe(7_200_000);
  });

  it('reads the same during ordinary play, where the two clocks agree', () => {
    // The fix must be inert when it is not needed: a game second is a real second during live play,
    // so every figure a player sees while watching stays exactly as it was.
    expect(computeFilingVelocity([at(0, 100), at(600_000, 130)])).toBe(180);
    expect(computeFilingVelocity([at(0, 42), at(120_000, 42)])).toBe(0);
  });

  it('drops samples outside the window but keeps one behind it', () => {
    const now = 10 * 60_000;
    const kept = retainWindow([at(0, 1), at(4 * 60_000, 2), at(9 * 60_000, 3)], now);
    // The 4-minute sample is outside a 5-minute window measured from now, but discarding every
    // stale sample would leave the window with no span each time the oldest one expires.
    expect(kept.map(({ completedTasks }) => completedTasks)).toEqual([2, 3]);
    expect(kept[0]!.atMs).toBeLessThan(now - VELOCITY_WINDOW_MS);
  });

  it('keeps everything while the run is younger than the window', () => {
    const samples = [at(0, 1), at(30_000, 2)];
    expect(retainWindow(samples, 60_000)).toEqual(samples);
  });
});
