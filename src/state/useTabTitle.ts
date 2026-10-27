import { useEffect, useRef } from 'react';
import { useGameStore } from './gameStore';
import { BASE_TITLE, formatTabTitle } from './tabTitle';

const ROTATE_INTERVAL_MS = 4_000;

interface TabTitleOptions {
  readonly velocity: number | null;
  readonly documentTarget?: Pick<Document, 'title' | 'hidden' | 'addEventListener' | 'removeEventListener'>;
}

/**
 * Rotates progress through the tab title, but only while the tab is hidden.
 *
 * A focused tab already shows the dashboard, so changing its title would be noise in the one
 * place the player is actually looking. The original title is captured once and restored on
 * every path out — becoming visible, unmounting — so this can never leave the tab renamed.
 *
 * Reads the store through getState() on its own timer rather than subscribing, for the same
 * reason the velocity readout does: nothing here should re-render anything.
 */
export function useTabTitle({ velocity, documentTarget }: TabTitleOptions): void {
  const velocityRef = useRef(velocity);
  // Kept current in an effect rather than during render; the rotate timer reads it later anyway.
  useEffect(() => {
    velocityRef.current = velocity;
  });

  useEffect(() => {
    const target = documentTarget ?? (typeof document === 'undefined' ? undefined : document);
    if (!target) return;

    const original = target.title;
    let frame = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    const restore = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      target.title = original || BASE_TITLE;
    };

    const rotate = () => {
      const { character, progression } = useGameStore.getState();
      void progression;
      target.title = formatTabTitle({
        level: character.Traits.Level,
        gold: character.Gold,
        act: character.Plot.act,
        velocity: velocityRef.current,
      }, frame);
      frame += 1;
    };

    const sync = () => {
      if (target.hidden) {
        if (timer === undefined) {
          rotate();
          timer = setInterval(rotate, ROTATE_INTERVAL_MS);
        }
        return;
      }
      restore();
    };

    target.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      target.removeEventListener('visibilitychange', sync);
      restore();
    };
  }, [documentTarget]);
}
