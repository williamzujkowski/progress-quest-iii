import { describe, expect, it } from 'vitest';
import {
  CATALOGUED_SHIELDS, CATALOGUED_WEAPONS, SHIELD_FAMILIES, WEAPON_FAMILIES, shieldFamily, weaponFamily,
} from '../data/openingFamilies';
import { ARMOUR_BY_SLOT } from '../data/armourBySlot';
import { describeEquipment } from '../data/itemDetails';
import { EQUIP_SLOTS } from '../data/traits';

/**
 * The guard the previous version did not have.
 *
 * Families used to be regular expressions written against the original catalogue. When the
 * vocabulary was replaced wholesale, five of the eight silently stopped matching anything and one
 * began firing on a substring accident, and every test in the suite stayed green throughout —
 * because nothing asserted that a family ever matched a real name.
 */

describe('every opening family covers real names, and only real names', () => {
  it('files each catalogued weapon under exactly one family', () => {
    const listed = Object.values(WEAPON_FAMILIES).flat();

    expect([...listed].sort()).toEqual([...CATALOGUED_WEAPONS].sort());
    expect(new Set(listed).size, 'a name listed twice would make the family depend on key order').toBe(listed.length);
  });

  it('files each catalogued shield under exactly one family', () => {
    const listed = Object.values(SHIELD_FAMILIES).flat();

    expect([...listed].sort()).toEqual([...CATALOGUED_SHIELDS].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('leaves no family empty', () => {
    // The failure that went unnoticed for a whole vocabulary replacement. An empty family is three
    // opening lines the game can never print.
    for (const [family, names] of Object.entries(WEAPON_FAMILIES)) expect(names.length, family).toBeGreaterThan(0);
    for (const [family, names] of Object.entries(SHIELD_FAMILIES)) expect(names.length, family).toBeGreaterThan(0);
  });

  it('actually uses every family across the catalogue', () => {
    // Distinct from the check above: a family can be non-empty and still unreachable if the lookup
    // never returns it.
    expect(new Set(CATALOGUED_WEAPONS.map(weaponFamily))).toEqual(new Set(Object.keys(WEAPON_FAMILIES)));
    expect(new Set(CATALOGUED_SHIELDS.map(shieldFamily))).toEqual(new Set(Object.keys(SHIELD_FAMILIES)));
  });

  it('cannot be reached by a name that merely contains a listed one', () => {
    // The whole class of defect this replaces. `/ABS/i` matched inside "ABSolute Privilege", which
    // is the fourth substring collision this repo has been caught by. Membership is exact, so a
    // longer name carrying a shorter one inside it resolves to the fallback rather than borrowing
    // the wrong copy.
    expect(weaponFamily('Mandate')).toBe('writ');
    expect(weaponFamily('Countermandate')).toBe('trifle');
    expect(shieldFamily('Legal Hold')).toBe('standing');
    expect(shieldFamily('Illegal Holdings')).toBe('provisional');
  });
});

describe('the armour copy is keyed to the slot, which cannot go empty', () => {
  it('gives every armour slot an opening drawn from its own vocabulary', () => {
    for (const slot of EQUIP_SLOTS) {
      if (slot === 'Weapon' || slot === 'Shield') continue;
      for (const base of ARMOUR_BY_SLOT[slot]) {
        const { description } = describeEquipment(base, slot);
        expect(description, `${slot}/${base}`).toContain(base);
      }
    }
  });

  it('resolves the armour dossier positionally, through the slot table the analyser reads', () => {
    // `itemDetails` used to look the base up in the shared `ARMORS` list while `analyzeItemMechanics`
    // resolved it through `armourTableForSlot`. That returned -1 for 177 of the 180 per-slot names,
    // so every one of them fell through to the name-hash fallback and the positional dossier scheme
    // was dead for armour in all but three cells.
    //
    // Asserted by the property that only the positional scheme has: two different slots' nouns at
    // the same index share an index, and therefore share a beat. Under the hash fallback they are
    // two unrelated strings and would not.
    const beat = (base: string, slot: 'Helm' | 'Greaves' | 'Cuisses') =>
      describeEquipment(base, slot).description.split('its intake file was ')[1];

    for (const index of [1, 5, 11, 17]) {
      const helm = ARMOUR_BY_SLOT.Helm[index]!;
      const greaves = ARMOUR_BY_SLOT.Greaves[index]!;
      const cuisses = ARMOUR_BY_SLOT.Cuisses[index]!;

      expect(beat(helm, 'Helm'), `index ${index}`).toBe(beat(greaves, 'Greaves'));
      expect(beat(helm, 'Helm'), `index ${index}`).toBe(beat(cuisses, 'Cuisses'));
    }

    // And the beats genuinely vary along the ladder, or the check above would hold trivially.
    const rungs = ARMOUR_BY_SLOT.Helm.map((base) => beat(base, 'Helm'));
    expect(new Set(rungs).size).toBe(rungs.length);
  });

  it('no longer describes a legal doctrine as unserviceable technology', () => {
    // The one line the old `advanced` family did reach, and it reached it wrongly.
    const { description } = describeEquipment('Absolute Privilege', 'Greaves');

    expect(description).not.toContain('unserviceable technology');
    expect(description).not.toContain('before discouraging tests');
    expect(description).toContain('Absolute Privilege');
  });
});
