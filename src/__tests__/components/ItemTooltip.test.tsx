// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ItemTooltip } from '../../components/ItemTooltip';
import { describeInventoryItem } from '../../data/itemDetails';
import { useGameStore } from '../../state/gameStore';

afterEach(cleanup);

/**
 * The data layer's own tests prove that an act changes the provenance vocabulary. They cannot
 * prove the component asks for it: deleting the act argument from the call in ItemTooltip leaves
 * every one of them passing, because they call the data functions directly. This is the test that
 * fails when the feature is correct everywhere except where a reader would see it.
 */
describe('item tooltip reads the act it is describing', () => {
  const describedAt = (act: number): string => {
    cleanup();
    useGameStore.setState((state) => ({ character: { ...state.character, Plot: { ...state.character.Plot, act } } }));
    render(<ItemTooltip kind="inventory" name="Nit Tail" quantity={1}>tail</ItemTooltip>);
    // Focus opens it in every browser; the pointer path is what the component's own
    // one-at-a-time logic is about and is not what this test is checking.
    fireEvent.focus(screen.getByRole('button'));
    return screen.getByRole('tooltip').textContent ?? '';
  };

  it('describes the same object differently once the acts have accumulated', () => {
    const early = describedAt(0);
    const late = describedAt(30);
    expect(early).not.toBe('');
    expect(late).not.toBe(early);
  });

  it('holds still at a fixed act', () => {
    expect(describedAt(30)).toBe(describedAt(30));
  });
});

describe('equipment triggers name their slot', () => {
  it('gives every slot a distinct accessible name, filled or empty', () => {
    render(
      <>
        <ItemTooltip kind="equipment" name="Stick" slot="Weapon">Stick</ItemTooltip>
        <ItemTooltip kind="equipment" name="" slot="Helm">—</ItemTooltip>
        <ItemTooltip kind="equipment" name="" slot="Gauntlets">—</ItemTooltip>
      </>,
    );

    // The defect: both empty slots used to be named "—" and were indistinguishable on focus.
    expect(screen.getByRole('button', { name: 'Helm: empty' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gauntlets: empty' })).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: '—' })).toHaveLength(0);

    // A filled slot still contains its visible label, so speech input matches the screen.
    const weapon = screen.getByRole('button', { name: 'Weapon: Stick' });
    expect(weapon.textContent).toBe('Stick');
  });

  it('leaves inventory and spell triggers named by their visible label', () => {
    // Only equipment has a slot to disambiguate. Naming the others would add words a reader has to
    // hear on every one of eighty inventory rows.
    render(
      <>
        <ItemTooltip kind="inventory" name="Loot item" quantity={2} />
        <ItemTooltip kind="spell" name="Procedural Disappointment" level={3} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Loot item' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Procedural Disappointment' })).toBeTruthy();
  });
});

describe('tooltip triggers are not disclosure buttons', () => {
  it('carries no aria-expanded, while keeping the description wiring that does the work', () => {
    // aria-expanded is for a control that expands a region; this controls a role="tooltip", so
    // "collapsed" promised content Enter would reveal in place. On a stocked dashboard that was a
    // spurious word on every one of a hundred-odd rows.
    render(<ItemTooltip kind="inventory" name="Loot item" quantity={2} />);
    const trigger = screen.getByRole('button', { name: 'Loot item' });

    expect(trigger.getAttribute('aria-expanded')).toBeNull();
    expect(trigger.getAttribute('aria-describedby')).toBeNull();

    fireEvent.focus(trigger);

    // Opening still wires the tooltip up the way a reader actually reaches it.
    expect(trigger.getAttribute('aria-expanded')).toBeNull();
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(screen.getByRole('tooltip').id).toBe(describedBy);
  });
});

describe('the carrying unit agrees with its figure', () => {
  /*
   * Every stack of one item read "Encumbrance: +1 cubits" — the commonest reading there is — while
   * the neighbours have always said "1 docket on file", "filed against 1 time" and "Items of record
   * retained in 1 slot". The consistency around it is what made this an oversight.
   */
  it('says one cubit and two cubits', () => {
    expect(describeInventoryItem('rubber duck', 1, 3).effect).toContain('+1 cubit.');
    expect(describeInventoryItem('rubber duck', 1, 3).effect).not.toContain('+1 cubits');
    expect(describeInventoryItem('rubber duck', 2, 3).effect).toContain('+2 cubits.');
  });

  it('agrees at zero, which is plural in English', () => {
    expect(describeInventoryItem('rubber duck', 0, 3).effect).toContain('+0 cubits.');
  });
});
