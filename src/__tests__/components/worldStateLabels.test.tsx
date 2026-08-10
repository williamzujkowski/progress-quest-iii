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

  it('explains the MUD verb rather than assuming it', () => {
    // `LOOK` is the right joke — a hero who can only be observed by typing at them — and it reads
    // as an instruction to somebody who has never used a text adventure. The `sr-only` twin already
    // softens it to "Look:"; the visible one did not. The verb stays; the gloss says what it is.
    const look = [...feed().querySelectorAll('.world-context-line strong')]
      .find((node) => node.textContent?.includes('LOOK'));
    expect(look, 'no LOOK line rendered').toBeTruthy();
    const title = look?.getAttribute('title') ?? '';
    expect(title, title).toMatch(/where the hero is standing/i);
    expect(title, title).toMatch(/text adventure/i);
  });

  it('says what the adventure clock is counting', () => {
    /*
     * `0:10:12` with no h/m/s markers, degrading to `1.16e6s` past a million. The shape is
     * conventional enough; what it counts is not. This is task time the hero has logged, so a
     * paused game does not advance it and it is not the age of the file — and nothing said so.
     */
    const clock = [...feed().querySelectorAll('.world-context-line span[title]')]
      .find((span) => span.textContent?.includes('adventure elapsed'));
    expect(clock, 'no elapsed clock rendered').toBeTruthy();
    const title = clock?.getAttribute('title') ?? '';
    expect(title, title).toMatch(/task time/i);
    // The distinction is the whole point: a clock that looked like the file's age would be read as
    // one, and this one stops when the hero does.
    expect(title, title).toMatch(/not the time since|only while the hero is working/i);
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
