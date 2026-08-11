// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../state/gameStore';
import { createNewCharacter } from '../../engine/sim';

/**
 * The game keeps playing when the browser refuses to hand over storage.
 *
 * Three ledger writes in the tick handler evaluated `window.localStorage` unguarded. The *property
 * access* throws `SecurityError` when storage is blocked — Chrome's "block all cookies", a sandboxed
 * iframe, Firefox with `dom.storage.enabled=false` — and the throw happened before `set()`, so the
 * store never advanced. Every later tick recomputed the same differing ledger and threw again.
 *
 * It was silent as well as permanent. `startGameClock` catches and discards the banked time, so
 * there was no crash and no error boundary: the hero simply never moved, while the only thing on
 * screen said storage was unavailable — which reads as a save problem, not a stopped game.
 *
 * Measured before the fix: 395 of 400 ticks threw, and the hero was still level 1 after
 * thirty-three simulated minutes.
 *
 * The same access is guarded in four other places in this codebase, including three lines above the
 * ones that were not.
 */

const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

afterEach(() => {
  if (originalDescriptor) Object.defineProperty(window, 'localStorage', originalDescriptor);
  vi.restoreAllMocks();
});

/** Storage that throws on the property access itself, which is what a blocked browser does. */
const blockStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });
};

describe('a browser that refuses storage does not stop the game', () => {
  it('keeps ticking, and the hero keeps progressing', () => {
    useGameStore.setState({
      character: createNewCharacter('Blocked', 'Half Daemon', 'Robot Monk', 900),
      sessionGeneration: 1,
    });
    blockStorage();

    const { tick } = useGameStore.getState();
    let threw = 0;
    for (let index = 0; index < 400; index += 1) {
      try {
        tick(5_000);
      } catch {
        threw += 1;
      }
    }

    expect(threw, `${threw} of 400 ticks threw`).toBe(0);
    // Progress is the assertion that matters. A tick that swallows its own failure and advances
    // nothing would pass the count above and still be the defect.
    expect(useGameStore.getState().progression.completedTasks, 'the hero never completed a task').toBeGreaterThan(0);
  });

  it('advances the character rather than merely surviving', () => {
    useGameStore.setState({
      character: createNewCharacter('Blocked', 'Half Daemon', 'Robot Monk', 901),
      sessionGeneration: 1,
    });
    blockStorage();

    const { tick } = useGameStore.getState();
    for (let index = 0; index < 400; index += 1) tick(5_000);

    // Thirty-three simulated minutes. Level 1 throughout was the measured symptom.
    expect(useGameStore.getState().character.Traits.Level).toBeGreaterThan(1);
  });
});
