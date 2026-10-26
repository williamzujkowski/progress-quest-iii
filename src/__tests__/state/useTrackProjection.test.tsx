// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React, { useEffect } from 'react';
import { useGameStore } from '../../state/gameStore';
import { useTrackProjection } from '../../state/useTrackProjection';

// Written from an effect, after commit, rather than assigned while the probe renders.
const reading: { value: number | null | undefined } = { value: undefined };
const Probe: React.FC<{ now: () => number }> = ({ now }) => {
  const value = useTrackProjection('experience', now);
  useEffect(() => { reading.value = value; }, [value]);
  return null;
};

afterEach(() => { vi.useRealTimers(); reading.value = undefined; });

// elapsedSeconds is the game's clock and the projection's denominator; it advances with play,
// so the fixture advances it alongside the track rather than leaving it still.
const setExperience = (currentSeconds: number, maxSeconds: number, elapsedSeconds?: number) => {
  const previous = useGameStore.getState().progression;
  useGameStore.setState({
    progression: {
      ...previous,
      experience: { currentSeconds, maxSeconds },
      elapsedSeconds: elapsedSeconds ?? previous.elapsedSeconds,
    },
  });
};

describe('promotion projection sampling', () => {
  it('reports nothing until the window is wide enough', () => {
    vi.useFakeTimers();
    setExperience(0, 1000, 0);
    let clock = 0;
    render(<Probe now={() => clock} />);
    expect(reading.value).toBeNull();

    clock = 10_000;
    act(() => { setExperience(50, 1000, 10); vi.advanceTimersByTime(10_000); });
    expect(reading.value).toBeNull();
  });

  it('reports a projection once the track has been observed moving', () => {
    vi.useFakeTimers();
    setExperience(0, 1000, 0);
    let clock = 0;
    render(<Probe now={() => clock} />);

    // Six samples, ten seconds apart, each covering ten seconds of play and earning five
    // track-seconds - a rate of 0.5, close to what the engine actually produces.
    for (let step = 1; step <= 6; step += 1) {
      clock = step * 10_000;
      act(() => { setExperience(step * 5, 1000, step * 10); vi.advanceTimersByTime(10_000); });
    }

    // 30 earned across 60 elapsed seconds; 970 remain at 0.5/s, so 1940 seconds of play.
    expect(reading.value).toBe(1940);
  });

  it('stops sampling when unmounted', () => {
    vi.useFakeTimers();
    setExperience(0, 1000, 0);
    let clock = 0;
    const { unmount } = render(<Probe now={() => clock} />);
    unmount();
    const before = reading.value;
    clock = 600_000;
    act(() => { setExperience(900, 1000, 900); vi.advanceTimersByTime(600_000); });
    expect(reading.value).toBe(before);
  });

  it('keeps its timer across host re-renders when no clock is supplied', () => {
    // An inline default argument is re-evaluated per call, which would give the effect a new
    // dependency identity on every render and rebuild the timer each time.
    vi.useFakeTimers();
    const setInterval = vi.spyOn(window, 'setInterval');
    const DefaultProbe: React.FC = () => { useTrackProjection('experience'); return null; };

    const { rerender } = render(<DefaultProbe />);
    expect(setInterval).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 5; index += 1) act(() => { rerender(<DefaultProbe />); });

    expect(setInterval).toHaveBeenCalledTimes(1);
    setInterval.mockRestore();
  });
});

describe('switching which track is projected', () => {
  /** Drives a fixed plot-track sequence and returns what the hook projects at the end. */
  const projectPlotAfter = (precedingExperienceSamples: number) => {
    let clock = 0;
    const now = () => clock;
    let seen: number | null | undefined;
    const Reader: React.FC<{ value: number | null }> = ({ value }) => {
      useEffect(() => { seen = value; }, [value]);
      return null;
    };
    const Switchable: React.FC<{ track: 'experience' | 'plot' }> = ({ track }) => {
      return <Reader value={useTrackProjection(track, now)} />;
    };

    useGameStore.setState({
      progression: { experience: { currentSeconds: 0, maxSeconds: 100_000 }, completedTasks: 0, elapsedSeconds: 0 },
      character: { ...useGameStore.getState().character, Plot: { act: 1, currentProgress: 0, maxProgress: 50_000 } },
    });

    const { rerender } = render(<Switchable track={precedingExperienceSamples > 0 ? 'experience' : 'plot'} />);

    // Optional history on the other track, with numbers unlike the plot track's.
    for (let step = 1; step <= precedingExperienceSamples; step += 1) {
      clock += 10_000;
      act(() => {
        useGameStore.setState({
          progression: { experience: { currentSeconds: step * 900, maxSeconds: 100_000 }, completedTasks: 0, elapsedSeconds: step * 10 },
        });
        vi.advanceTimersByTime(10_000);
      });
    }
    if (precedingExperienceSamples > 0) act(() => { rerender(<Switchable track="plot" />); });

    // The plot sequence both runs share.
    for (let step = 1; step <= 6; step += 1) {
      clock += 10_000;
      act(() => {
        const previous = useGameStore.getState();
        useGameStore.setState({
          progression: { ...previous.progression, elapsedSeconds: (precedingExperienceSamples * 10) + step * 10 },
          character: { ...previous.character, Plot: { act: 1, currentProgress: step * 200, maxProgress: 50_000 } },
        });
        vi.advanceTimersByTime(10_000);
      });
    }
    cleanup();
    return seen;
  };

  it('projects the plot track from plot samples only', () => {
    // The buffer is a ref and survives a track change. Without discarding it, the projection
    // divides plot progress by experience-track elapsed time — two scales with nothing in common,
    // so the error has no bound and can read as negative, returning null and hiding a figure that
    // should have shown.
    vi.useFakeTimers();
    const clean = projectPlotAfter(0);
    const afterSwitch = projectPlotAfter(6);

    expect(typeof clean).toBe('number');
    expect(afterSwitch).toBe(clean);
  });
});
