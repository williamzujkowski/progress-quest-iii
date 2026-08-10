import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './gameStore';
import { computeFilingVelocity, retainWindow, type VelocitySample } from './filingVelocity';

const SAMPLE_INTERVAL_MS = 10_000;

/**
 * Samples the task counter on its own timer rather than subscribing to the store.
 *
 * A subscription would tie this readout to the 50ms tick, and the whole point of the change that
 * narrowed the dashboard's selectors was to stop panels re-rendering twenty times a second with
 * nothing new to show. Reading `getState()` on an interval keeps that property: the component
 * re-renders only when the displayed figure actually changes, which is at most once per sample.
 */
/**
 * Hoisted rather than written inline as a default, because a default expression is re-evaluated
 * per call: every render would hand the effect below a new function identity, tearing the timer
 * down and rebuilding it on each render of the host panel — the coupling to render cadence this
 * hook exists to avoid.
 */
const systemNowMs = () => Date.now();

export function useFilingVelocity(nowMs: () => number = systemNowMs): number | null {
  const samples = useRef<VelocitySample[]>([]);
  const [velocity, setVelocity] = useState<number | null>(null);

  useEffect(() => {
    const sample = () => {
      const now = nowMs();
      samples.current = retainWindow(
        [...samples.current, {
          atMs: now,
          completedTasks: useGameStore.getState().progression.completedTasks,
          elapsedSeconds: useGameStore.getState().progression.elapsedSeconds,
        }],
        now,
      );
      const next = computeFilingVelocity(samples.current);
      // Only a changed figure is worth a render.
      setVelocity((current) => (current === next ? current : next));
    };

    sample();
    const timer = setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [nowMs]);

  return velocity;
}
