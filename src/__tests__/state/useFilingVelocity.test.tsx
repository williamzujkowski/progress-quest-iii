// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import React, { useEffect } from 'react';
import { useGameStore } from '../../state/gameStore';
import { useFilingVelocity } from '../../state/useFilingVelocity';

// Written from an effect, after commit, rather than assigned while the probe renders.
const reading: { value: number | null | undefined } = { value: undefined };
const Probe: React.FC<{ now: () => number }> = ({ now }) => {
  const value = useFilingVelocity(now);
  useEffect(() => { reading.value = value; }, [value]);
  return null;
};

const startSession = () => useGameStore.getState().startSession({
  source: 'creation', name: 'Velocity Subject', race: 'Half Daemon', klass: 'Incident Paladin', seed: 77,
});

afterEach(() => { vi.useRealTimers(); reading.value = undefined; });

describe('filing velocity sampling', () => {
  it('reports nothing until the sampled window is wide enough', () => {
    vi.useFakeTimers();
    startSession();
    let clock = 0;
    render(<Probe now={() => clock} />);
    expect(reading.value).toBeNull();

    // One further sample, but only ten seconds of span — still too narrow to mean anything.
    clock = 10_000;
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(reading.value).toBeNull();
  });

  it('reports a rate once enough time has been sampled', () => {
    vi.useFakeTimers();
    startSession();
    let clock = 0;
    render(<Probe now={() => clock} />);

    // Advance the clock and the store together: six ticks of a minute each.
    for (let step = 1; step <= 6; step += 1) {
      clock = step * 60_000;
      act(() => {
        useGameStore.getState().tick(60_000);
        vi.advanceTimersByTime(10_000);
      });
    }

    expect(typeof reading.value).toBe('number');
    expect(reading.value!).toBeGreaterThan(0);
  });

  it('stops sampling when unmounted', () => {
    vi.useFakeTimers();
    startSession();
    let clock = 0;
    const { unmount } = render(<Probe now={() => clock} />);
    unmount();
    const before = reading.value;
    clock = 600_000;
    act(() => { vi.advanceTimersByTime(600_000); });
    // No further renders, so the last reported value stands.
    expect(reading.value).toBe(before);
  });

  it('keeps its timer across host re-renders when no clock is supplied', () => {
    // The hook exists to sample on its own cadence rather than the render's. A default argument
    // written inline is re-evaluated per call, which would give the effect a new dependency
    // identity every render and rebuild the timer each time — sampling at render cadence, the
    // exact coupling this is meant to avoid. Probed through the no-argument call, since that is
    // the one the dashboard actually makes.
    vi.useFakeTimers();
    startSession();
    const setInterval = vi.spyOn(window, 'setInterval');
    const DefaultProbe: React.FC = () => { useFilingVelocity(); return null; };

    const { rerender } = render(<DefaultProbe />);
    expect(setInterval).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 5; index += 1) act(() => { rerender(<DefaultProbe />); });

    expect(setInterval).toHaveBeenCalledTimes(1);
    setInterval.mockRestore();
  });
});
