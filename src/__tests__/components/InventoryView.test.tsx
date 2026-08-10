// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InventoryView } from '../../components/InventoryView';
import { createNewCharacter } from '../../engine/sim';
import { useGameStore } from '../../state/gameStore';
import type { CharacterSheet } from '../../engine/types';

/**
 * The third figure found publishing itself without a noun.
 *
 * The header rendered `0 / 14` beside a weight icon, with "cubits" only in an `sr-only` span and in
 * the progressbar's own label — and on touch there is no hover to reach either. The filing rate had
 * the same shape and the two second-denominated bars had it worse, which is what makes this a rule
 * rather than three coincidences: **a figure whose noun lives only in `title` or `sr-only` is
 * unlabelled for most of the people looking at it.**
 *
 * Legacy rendered it as `$position/$max cubits`, so this is a restoration rather than an invention.
 */

afterEach(cleanup);

// `qty`, not `quantity` — `calculateEncumbrance` sums `item.qty`, and a fixture using the other
// spelling weighs nothing at all, which is how the capacity case below first passed for free.
const carrying = (items: { name: string; qty: number }[], strength = 8) => {
  const character = createNewCharacter('Porter', 'Half Daemon', 'Robot Monk', 900);
  const sheet: CharacterSheet = {
    ...character,
    Stats: { ...character.Stats, STR: strength },
    Inventory: items,
  };
  useGameStore.setState({ character: sheet });
  render(<InventoryView />);
};

describe('the encumbrance readout says what it is counting', () => {
  it('shows the unit on screen, not only to a screen reader', () => {
    carrying([]);

    // Located through the header pill so a match cannot come from the progressbar's `aria-label`,
    // which was already correct and was already unreachable on touch.
    const pill = document.querySelector('.inventory-weight');
    expect(pill?.querySelector('.stat-unit')?.textContent).toBe('cubits');
  });

  it('says it once, so a screen reader does not hear it twice', () => {
    // The `sr-only` span used to carry "cubits carried of capacity". Leaving that beside a visible
    // noun would have the reading announced as "0 / 14 cubits cubits carried of capacity".
    carrying([]);

    const pill = document.querySelector('.inventory-weight');
    expect(pill?.textContent?.match(/cubits/g) ?? []).toHaveLength(1);
  });

  it('still announces reaching capacity, which is otherwise signalled by colour alone', () => {
    // At capacity the bar turns red and nothing else changes. That clause is the only non-visual
    // notice of a state the hero is routed to market by, so it survives the trim.
    // STR 1 gives a capacity of 11 (`str + 10`), so forty writs is comfortably over it.
    carrying(Array.from({ length: 40 }, (_unused, index) => ({ name: `writ ${index}`, qty: 9 })), 1);

    const pill = document.querySelector('.inventory-weight');
    expect(pill?.className).toContain('inventory-weight-full');
    expect(pill?.textContent).toContain(', at capacity');
  });

  it('leaves the clause off below capacity, so its presence carries the signal', () => {
    carrying([]);

    expect(document.querySelector('.inventory-weight')?.textContent).not.toContain('at capacity');
    expect(screen.getByRole('progressbar', { name: /Encumbrance/ }).getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('the encumbrance figure explains what fills it and what happens then', () => {
  /*
   * The noun was made visible earlier; what a cubit *is* was still nowhere in the app, and the
   * consequence of filling the bar sat behind a disclosure that never populated — the market trip
   * only started carrying its reason when the ordinary path was given one.
   *
   * Now that it does, the rule can sit on the figure it governs rather than a panel away.
   */
  it('names the unit and the consequence in one place', () => {
    carrying([]);

    const title = document.querySelector('.inventory-weight')?.getAttribute('title') ?? '';
    expect(title, 'the weight pill carries no gloss').not.toBe('');
    expect(title).toMatch(/cubits/i);
    // The consequence, not only the noun. "Cubits — a unit of carrying" would pass a presence
    // check and answer none of the question a newcomer actually has.
    expect(title, title).toMatch(/market/i);
  });

  it('says the same thing the engine says when it routes the hero', () => {
    // The gloss and `describeDecisionReason` have to agree: the engine's line is "At capacity,
    // procurement routes the hero to market", and a tooltip offering a different rule would be a
    // second explanation of one mechanic.
    carrying([]);

    const title = document.querySelector('.inventory-weight')?.getAttribute('title') ?? '';
    expect(title, title).toMatch(/procurement routes the hero to market/);
  });
});
