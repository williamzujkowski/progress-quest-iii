// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceRecord } from '../../components/ServiceRecord';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { useGameStore } from '../../state/gameStore';
import { EMPTY_CASELOAD } from '../../state/caseload';
import type { CharacterSheet } from '../../engine/types';

const originalState = useGameStore.getState();

const ROSTER_KEY = 'progquest_roster_v1';

const seat = (act: number, roster: Record<string, CharacterSheet> = {}) => {
  const character = createNewCharacter('Krg', 'Half Daemon', 'Robot Monk', new RandomGenerator('service'));
  useGameStore.setState({
    character: { ...character, Plot: { ...character.Plot, act } },
    caseload: { ...EMPTY_CASELOAD, kinds: { fetch: 4 } },
    roster,
  });
};

const rosterWith = (name: string, level: number): Record<string, CharacterSheet> => {
  const sheet = createNewCharacter(name, 'Double Tenant', 'Incident Paladin', new RandomGenerator(name));
  return { [name]: { ...sheet, Traits: { ...sheet.Traits, Level: level } } };
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useGameStore.setState(originalState, true);
  vi.restoreAllMocks();
});

describe('the service record on screen', () => {
  it('names whoever held the file before', () => {
    seat(4, rosterWith('Bendrel', 19));
    render(<ServiceRecord />);

    expect(screen.getByText(/Bendrel/)).toBeTruthy();
  });

  it('never reaches storage for the roster while it renders', () => {
    /*
     * `loadRoster` reads up to 500 KB out of storage, parses it, and runs the character schema over
     * every entry. This component re-renders whenever any of its four ledgers moves — which early in
     * a run is most of the time a new specimen is filed — so the first version, which called it in
     * the render body, put a full roster validation behind an event with nothing to do with the
     * roster. It now comes off the store, which reads it at a session boundary instead.
     *
     * Counted through `getItem` rather than by spying on the module, because that is the cost that
     * actually lands.
     */
    seat(4, rosterWith('Bendrel', 19));
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { rerender } = render(<ServiceRecord />);

    for (const specimens of [['item:One'], ['item:One', 'item:Two'], ['item:One', 'item:Two', 'item:Three']]) {
      useGameStore.setState({ specimens: { specimens } });
      rerender(<ServiceRecord />);
    }
    useGameStore.setState({ caseload: { ...EMPTY_CASELOAD, kinds: { fetch: 9 } } });
    rerender(<ServiceRecord />);

    // The premise: the document has to actually be rendering the precedent, or this asserts that a
    // component showing nothing reads nothing.
    expect(screen.getByText(/Bendrel/), 'the precedent must be on screen').toBeTruthy();
    expect(getItem.mock.calls.filter(([key]) => key === ROSTER_KEY)).toEqual([]);
  });

  it('shows the document without the precedent when there is nobody on file', () => {
    // A storage failure reaches here as an empty roster, which the store guarantees. It costs one
    // line, never the document.
    seat(4);
    render(<ServiceRecord />);

    expect(screen.getByLabelText('Service record')).toBeTruthy();
    expect(screen.queryByText('Precedent')).toBeNull();
  });
});
