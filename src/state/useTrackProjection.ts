import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './gameStore';
import { projectTrack, retainTrackWindow, type TrackSample } from './trackProjection';

const SAMPLE_INTERVAL_MS = 10_000;

/**
 * Hoisted rather than written inline as a default: a default expression is re-evaluated per call,
 * which would hand the effect a new dependency identity every render and rebuild the timer each
 * time — sampling at render cadence, which is the coupling this hook exists to avoid.
 */
const systemNowMs = () => Date.now();

/** Which bounded track to project: the one that produces a level, or the one that produces an act. */
export type ProjectedTrack = 'experience' | 'plot';

const readTrack = (track: ProjectedTrack) => {
  const { character, progression } = useGameStore.getState();
  return track === 'experience'
    ? {
        current: progression.experience.currentSeconds,
        max: progression.experience.maxSeconds,
        elapsedSeconds: progression.elapsedSeconds,
      }
    : {
        current: character.Plot.currentProgress,
        max: character.Plot.maxProgress,
        elapsedSeconds: progression.elapsedSeconds,
      };
};

/**
 * Samples a bounded track on its own timer, for the same reason the velocity readout does: a
 * subscription would tie this to the 50ms tick and re-render the banner twenty times a second to
 * show a figure that changes at most once per sample.
 *
 * Both tracks reset when they fill and grow their ceiling afterwards, so the reset guard inside
 * the projection is needed for either — the plot track was measured at 0.87 to 0.92 progress-seconds per
 * elapsed second, so it is no more a clock than the experience track is and the same sampled rate
 * is the honest way to read it.
 */
export function useTrackProjection(track: ProjectedTrack, nowMs: () => number = systemNowMs): number | null {
  const samples = useRef<TrackSample[]>([]);
  const sampledTrack = useRef<ProjectedTrack>(track);
  const [seconds, setSeconds] = useState<number | null>(null);

  // Discarded when the track changes, and only then. The buffer is a ref, so it would otherwise
  // survive the switch and the projection would divide one track's progress by the other's
  // elapsed time — an error with no bound, since the two tracks share no scale, and one that can
  // read as negative and return null, hiding a projection that should have shown.
  //
  // Keyed on the track rather than cleared whenever the effect restarts. The effect also restarts
  // when the clock function's identity changes, which happens on every render for any caller
  // passing an inline arrow — clearing there would empty the buffer continuously and the readout
  // would never have enough samples to say anything.
  if (sampledTrack.current !== track) {
    sampledTrack.current = track;
    samples.current = [];
  }

  useEffect(() => {
    const sample = () => {
      const now = nowMs();
      const reading = readTrack(track);
      samples.current = retainTrackWindow(
        [...samples.current, {
          atMs: now,
          currentSeconds: reading.current,
          maxSeconds: reading.max,
          // The game's own clock is the denominator; the wall clock only bounds the buffer.
          elapsedSeconds: reading.elapsedSeconds,
        }],
        now,
      );
      const next = projectTrack(samples.current);
      setSeconds((current) => (current === next ? current : next));
    };

    sample();
    const timer = setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [nowMs, track]);

  return seconds;
}
