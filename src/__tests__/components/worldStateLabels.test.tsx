// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { LogFeed } from '../../components/LogFeed';
import { createNewCharacter } from '../../engine/sim';
import { useGameStore } from '../../state/gameStore';

/**
 * The three raw union members on the world line.
 *
 * `road // travel`, `assignment // dungeon`, `tenor // routine` shipped with no gloss anywhere in
 * the app, because there is no glossary. They read as machine state leaking into the fiction, which
 * is very nearly the joke and not quite — a newcomer cannot tell whether "tenor" is a stat they
 * should be raising.
 *
 * The gloss says what each is a property of. That is the missing half: the words themselves are in
 * register and worth keeping.
 */

afterEach(cleanup);

const feed = () => {
  useGameStore.setState({ character: createNewCharacter('Situated', 'Half Daemon', 'Robot Monk', 900) });
  return render(<LogFeed />).container;
};

describe('the world line says what its terms are', () => {
  it('glosses every raw pairing on the meta line', () => {
    const spans = [...feed().querySelectorAll('.world-context-meta > span')];
    expect(spans.length, 'no meta pairings rendered').toBeGreaterThan(0);
    for (const span of spans) {
      expect(span.getAttribute('title'), `ungLossed: ${span.textContent}`).toBeTruthy();
    }
  });

  it('says tenor is not something the hero can move', () => {
    // It is a function of the act alone, so a newcomer reading it as a stat to raise would be
    // chasing a number that ignores them. That is the specific confusion worth pre-empting.
    const tenor = [...feed().querySelectorAll('.world-context-meta > span')]
      .find((span) => span.textContent?.startsWith('tenor'));
    expect(tenor, 'no tenor pairing rendered').toBeTruthy();
    expect(tenor?.getAttribute('title') ?? '', 'tenor gloss').toMatch(/nothing the hero does|follows the act/i);
  });
});
