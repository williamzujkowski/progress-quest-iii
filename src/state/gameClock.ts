/**
 * How often the clock wakes, in milliseconds.
 *
 * Exported so nothing has to restate it. A test that models the tick at some other interval is
 * measuring a game nobody plays — `chatterThunkRate.test.ts` ran at one second, twenty times the
 * real cadence, and reported a per-second rate as though it were a per-tick one.
 */
export const GAME_TICK_MS = 50;

export function startGameClock(
  tick: (elapsedMs: number) => void,
  now = () => performance.now(),
  onError: (error: unknown, discardedMs: number) => void = () => undefined,
  visibilityTarget: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> | undefined = typeof document === 'undefined' ? undefined : document,
): () => void {
  let previousTime = now();
  let bankedMs = 0;

  // Move wall-clock progress into the bank without deciding yet whether to spend it.
  const bankElapsed = () => {
    const currentTime = now();
    bankedMs += Math.max(0, currentTime - previousTime);
    previousTime = currentTime;
  };

  // An open-but-hidden tab keeps earning time. Banking on the transition itself means a
  // throttled background interval cannot lose the span between its last run and the switch.
  visibilityTarget?.addEventListener('visibilitychange', bankElapsed);

  const timer = setInterval(() => {
    bankElapsed();
    // Hidden ticks accumulate only; the engine's bounded catch-up spends the bank on return.
    if (visibilityTarget?.hidden ?? false) return;
    const elapsedMs = bankedMs;
    bankedMs = 0;
    try {
      tick(elapsedMs);
    } catch (error: unknown) {
      // Keep the interval alive so a recoverable transition failure cannot strand the session.
      // The bank was emptied before the call, so this failure consumed all of it - and since a
      // hidden tab can bank hours, "one tick failed" and "a day of progress vanished" look
      // identical from here unless the magnitude travels with the error.
      onError(error, elapsedMs);
    }
  }, GAME_TICK_MS);

  return () => {
    clearInterval(timer);
    visibilityTarget?.removeEventListener('visibilitychange', bankElapsed);
  };
}
