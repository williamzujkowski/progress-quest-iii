import { describe, expect, it, vi } from 'vitest';
import { SoundFX, soundFX, type AudioFailure } from '../../state/audio';

describe('Web Audio Synthesizer', () => {
  it('toggles mute state correctly', () => {
    const initialMuted = soundFX.getMuted();
    const toggled = soundFX.toggleMute();
    expect(toggled).toBe(!initialMuted);

    const toggledBack = soundFX.toggleMute();
    expect(toggledBack).toBe(initialMuted);
  });

  it('returns and reports an unavailable AudioContext without throwing', async () => {
    const failures: AudioFailure[] = [];
    const unavailable = new SoundFX(() => null, (failure) => failures.push(failure));

    await expect(unavailable.prepare()).resolves.toMatchObject({ ok: false, code: 'audio_unsupported' });
    expect(failures).toMatchObject([{ code: 'audio_unsupported', operation: 'initialize' }]);
  });

  it('handles AudioContext construction and resume failures as typed outcomes', async () => {
    const constructionFailures: AudioFailure[] = [];
    const construction = new SoundFX(() => { throw new DOMException('Denied', 'NotAllowedError'); }, (failure) => constructionFailures.push(failure));
    await expect(construction.prepare()).resolves.toMatchObject({ ok: false, code: 'audio_initialize_failed' });
    expect(constructionFailures).toMatchObject([{ code: 'audio_initialize_failed', operation: 'initialize' }]);

    const resumeFailures: AudioFailure[] = [];
    const resume = vi.fn().mockRejectedValue(new DOMException('Activation denied', 'NotAllowedError'));
    const suspended = new SoundFX(
      () => ({ state: 'suspended', resume } as unknown as AudioContext),
      (failure) => resumeFailures.push(failure),
    );
    await expect(suspended.prepare()).resolves.toMatchObject({ ok: false, code: 'audio_resume_failed' });
    expect(resumeFailures).toMatchObject([{ code: 'audio_resume_failed', operation: 'resume' }]);
  });

  it('does not report playback recovery until a silent node probe succeeds', async () => {
    const broken = new SoundFX(
      () => ({ state: 'running', createOscillator: () => { throw new Error('Synthetic node failure'); } } as unknown as AudioContext),
      vi.fn(),
    );

    await expect(broken.prepare()).resolves.toMatchObject({ ok: false, code: 'audio_play_failed' });
    expect(broken.getMuted()).toBe(true);
  });

  it('contains audio-node failures, reports once, and notifies the UI on each retry', async () => {
    const failures: AudioFailure[] = [];
    const notices: string[] = [];
    const broken = new SoundFX(
      () => ({ state: 'running', createOscillator: () => { throw new Error('Synthetic node failure'); } } as unknown as AudioContext),
      (failure) => failures.push(failure),
    );
    const unsubscribe = broken.subscribe((message) => notices.push(message));

    await expect(broken.playLevelUp()).resolves.toMatchObject({ ok: false, code: 'audio_play_failed' });
    await expect(broken.playQuestComplete()).resolves.toEqual({ ok: true });
    broken.toggleMute();
    await expect(broken.playQuestComplete()).resolves.toMatchObject({ ok: false, code: 'audio_play_failed' });
    unsubscribe();

    expect(broken.getMuted()).toBe(true);
    expect(failures).toMatchObject([{ code: 'audio_play_failed', operation: 'play' }]);
    expect(notices).toEqual([
      'Sound effects are unavailable. Questing will continue in dignified silence.',
      'Sound effects are unavailable. Questing will continue in dignified silence.',
    ]);
  });
  it('reports success and stays unmuted against a context whose nodes work', async () => {
    /*
     * Every other case in this file hands `SoundFX` a factory that returns null, throws, rejects on
     * resume, or whose `createOscillator` throws — so both success returns, in `play` and in
     * `prepare`, were never reached. Replacing each of them with a failure left the whole suite
     * green: a build in which every healthy browser reports its own sound system broken and mutes
     * itself, with nothing red.
     *
     * The stub is the smallest thing `probePlayback` actually touches, so it asserts the contract
     * rather than the implementation: two nodes that connect, a gain that can be scheduled, and a
     * start and stop that do not throw.
     */
    const started: number[] = [];
    const scheduled: number[] = [];
    const working = () => ({
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: () => ({
        frequency: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
        type: 'sine',
        connect: () => undefined,
        start: (when: number) => started.push(when),
        stop: () => undefined,
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: (value: number) => scheduled.push(value),
          exponentialRampToValueAtTime: () => undefined,
          linearRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      }),
    } as unknown as AudioContext);

    const failures: AudioFailure[] = [];
    const healthy = new SoundFX(working, (failure) => failures.push(failure));

    await expect(healthy.prepare()).resolves.toEqual({ ok: true });
    await expect(healthy.playLevelUp()).resolves.toEqual({ ok: true });
    await expect(healthy.playQuestComplete()).resolves.toEqual({ ok: true });

    // Not merely `{ ok: true }`: the muted early return in `play` answers that too, which is what
    // made the existing success assertion in this file measure nothing.
    expect(healthy.getMuted(), 'a working context should not have muted itself').toBe(false);
    expect(failures, 'a working context reported a failure').toEqual([]);
    expect(started.length, 'no oscillator was ever started').toBeGreaterThan(0);
    expect(scheduled, 'the probe did not schedule its silent gain').toContain(0);
  });
});
