// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CharacterSheetView } from '../../components/CharacterSheet';
import { createNewCharacter } from '../../engine/sim';
import { useGameStore } from '../../state/gameStore';
import { EQUIP_SLOTS } from '../../data/traits';

/**
 * An empty equipment slot says which slot it is.
 *
 * Eleven glyphs and nine em-dashes shipped with the slot names in `title` and `sr-only` only — which
 * is what this codebase calls unlabelled, in a rule it states three times over. Nine of eleven rows
 * are empty on a new character, so that was most of the panel on a first run.
 *
 * Naming only the empty rows is what makes it affordable. A filled row already carries a name, so no
 * row gains a line and the one-screen desktop layout does not move — which is the constraint that
 * made naming all eleven a harder call than it looked.
 *
 * The `sr-only` twin went with it: `ItemTooltip`'s accessible name is already "Weapon: Sharp Sword",
 * so repeating the slot beside it made a screen reader say the noun twice.
 */

afterEach(cleanup);

const sheetFor = (equip?: Partial<Record<(typeof EQUIP_SLOTS)[number], string>>) => {
  const character = createNewCharacter('Kitted', 'Half Daemon', 'Robot Monk', 900);
  useGameStore.setState({ character: { ...character, Equip: { ...character.Equip, ...equip } } });
  return render(<CharacterSheetView />).container;
};

describe('an empty equipment slot names itself', () => {
  it('shows the slot name instead of a bare dash', () => {
    const container = sheetFor();
    const empties = [...container.querySelectorAll('.equip-slot-empty')].map((node) => node.textContent);
    // A new character has one weapon and nothing else, so almost every row is empty.
    expect(empties.length).toBeGreaterThan(5);
    for (const name of empties) expect(EQUIP_SLOTS).toContain(name);
    expect(container.textContent, 'the dash placeholder is still being rendered').not.toContain('—');
  });

  it('leaves a filled slot showing its item, not its slot name', () => {
    // The point of naming only the empty rows: a filled row is already labelled by what is in it,
    // and adding the slot beside it would be the duplication this replaces.
    const container = sheetFor({ Weapon: 'Sharp Rock' });
    const filled = [...container.querySelectorAll('.equip-item')]
      .find((row) => row.textContent?.includes('Sharp Rock'));
    expect(filled, 'no filled row rendered').toBeTruthy();
    expect(filled?.querySelector('.equip-slot-empty')).toBeNull();
  });

  it('says the slot once, not twice', () => {
    // `ItemTooltip`'s accessible name already carries it. An `sr-only` twin beside the icon made a
    // screen reader read "Weapon" and then "Weapon: Sharp Rock".
    const container = sheetFor({ Weapon: 'Sharp Rock' });
    const icons = [...container.querySelectorAll('.equip-slot-icon')];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.querySelector('.sr-only'), 'the icon still carries an sr-only slot name').toBeNull();
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
