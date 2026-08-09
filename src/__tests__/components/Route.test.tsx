// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Route } from '../../components/Route';
import { CharacterSheetView } from '../../components/CharacterSheet';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { useGameStore } from '../../state/gameStore';

const originalState = useGameStore.getState();

const atAct = (act: number) => {
  const character = createNewCharacter('Krg', 'Half Daemon', 'Robot Monk', new RandomGenerator('route'));
  useGameStore.setState({ character: { ...character, Plot: { ...character.Plot, act } } });
};

afterEach(() => {
  cleanup();
  useGameStore.setState(originalState, true);
});

describe('the postings record', () => {
  it('lists every act reached and marks where the hero is', () => {
    atAct(4);
    render(<Route />);

    const list = screen.getByRole('list', { name: 'Places this hero has been posted' });
    const rows = [...list.querySelectorAll('li')];

    expect(rows.map((row) => row.querySelector('.equip-slot')?.textContent))
      .toEqual(['Act 0', 'Act 1', 'Act 2', 'Act 3', 'Act 4', 'Act 5']);
    expect(rows.filter((row) => row.className.includes('route-current'))).toHaveLength(1);
    expect(rows[4]?.className).toContain('route-current');
  });

  it('names the act ahead as pending rather than leaving it out', () => {
    // A route that simply stopped would read as the end of the game.
    atAct(2);
    render(<Route />);

    expect(screen.getByText('pending assignment')).not.toBeNull();
    const rows = [...screen.getByRole('list', { name: /posted/ }).querySelectorAll('li')];
    expect(rows.at(-1)?.textContent).toContain('Act 3');
  });

  it('marks the current posting in text as well as in weight', () => {
    // Emphasis alone is not a distinction a reader who cannot see it can make, so the row carries a
    // class the stylesheet reads and the act number is written out either way.
    atAct(3);
    render(<Route />);

    const current = screen.getByRole('list', { name: /posted/ }).querySelector('.route-current');
    expect(current?.textContent).toContain('Act 3');
  });

  it('says nothing at all in the prologue', () => {
    // A hero who has been exactly nowhere has no service record, and an empty list reads as broken
    // rather than as young.
    atAct(0);
    const { container } = render(<Route />);

    expect(container.firstChild).toBeNull();
  });

  it('opens the Records disclosure on its own, without a commendation or a case', () => {
    // The disclosure and this component have to agree about whether there is anything to file. If
    // they decided separately, a hero whose only record was a route would get a triangle that
    // opened onto nothing — which is the failure the shared predicate exists to prevent.
    atAct(3);
    render(<CharacterSheetView />);

    expect(screen.getByText('Records')).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Places this hero has been posted' })).not.toBeNull();
  });

  it('keeps the disclosure closed for a hero with nothing filed at all', () => {
    atAct(0);
    render(<CharacterSheetView />);

    expect(screen.queryByText('Records')).toBeNull();
  });
});
