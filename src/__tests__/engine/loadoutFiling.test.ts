import { describe, expect, it } from 'vitest';
import { fileLoadout } from '../../engine/loadoutFiling';
import { encounterSpeedMultiplier, loadoutQuality } from '../../engine/loadout';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import type { CharacterSheet } from '../../engine/types';

const wearing = (equip: Partial<CharacterSheet['Equip']>): CharacterSheet => {
  const character = createNewCharacter('Filed', 'Half Daemon', 'Robot Monk', new RandomGenerator('filing'));
  const empty = Object.fromEntries(Object.keys(character.Equip).map((slot) => [slot, ''])) as CharacterSheet['Equip'];
  return { ...character, Equip: { ...empty, ...equip } };
};

describe('the loadout, said out loud', () => {
  it('reports the reduction the engine actually applies, not a recomputed one', () => {
    // The point of the whole exercise. A filing that disagreed with the arithmetic would be the
    // failure this exists to fix rather than an instance of it, so the figure is taken from the
    // same function the transition multiplies by.
    // Two contributing slots, and both verified to contribute. An earlier version used
    // `Vested Board Directive`, which totals zero — `Vested` is a defence modifier and is not read
    // for the Weapon slot — so the test exercised one item where it read as two.
    const character = wearing({ Weapon: 'Board Directive', Helm: 'Bonded Corner Office' });
    const filing = fileLoadout(character);

    const expected = Math.round((1 - encounterSpeedMultiplier(loadoutQuality(character))) * 100);
    expect(filing.reductionPercent).toBe(expected);
    expect(filing.reductionPercent).toBeGreaterThan(0);
  });

  it('agrees with the engine even when a negative item drags the total down', () => {
    // Summing the positive slots would disagree the moment something threadbare is worn, and the
    // disagreement would be invisible — both numbers look plausible.
    const character = wearing({ Helm: 'Corner Office', Hauberk: '-30 Cover Note' });
    const filing = fileLoadout(character);

    expect(filing.reductionPercent).toBe(Math.round((1 - encounterSpeedMultiplier(loadoutQuality(character))) * 100));
    // The good item is still cited even though the loadout as a whole earns nothing.
    expect(filing.itemOfRecord?.slot).toBe('Helm');
  });

  it('names the grandest noun, not whichever slot comes first', () => {
    // The flaw this exists to catch, found by reading a live sheet rather than by reasoning.
    // `generateEquipUpgrade` tops every item up until its total equals the character's level, so on
    // a real loadout eleven slots carry two distinct totals between them. Ranking by total therefore
    // names whichever slot happens to be first in `EQUIP_SLOTS` — an ordering fact, not an
    // observation. These three all total 3 and their bases are 3, 4 and 10.
    const filing = fileLoadout(wearing({
      Weapon: 'Hackathon Prize', Helm: '-1 Name Plate', Gauntlets: '-7 Skeleton Key',
    }));

    expect(new Set(filing.contributors.map(({ quality }) => quality)).size).toBe(1);
    expect(filing.itemOfRecord?.name).toBe('-7 Skeleton Key');
    expect(filing.contributors.map(({ slot }) => slot)).toEqual(['Gauntlets', 'Helm', 'Weapon']);
  });

  it('ranks by standing even when the totals order the loadout the other way', () => {
    // The test that stood here wore three bare nouns, where standing and total are the same number —
    // measured, `[30, 10, 1]` both ways — so it would have passed identically against a version that
    // ranked by total, which is exactly the bug it was named for.
    //
    // These two disagree on purpose. A grand noun dragged down by its mark, and a humble one
    // inflated by one: ranking by standing names the hauberk, ranking by total names the helm.
    const filing = fileLoadout(wearing({ Helm: '+20 Lanyard', Hauberk: '-25 Lender of Last Resort' }));

    const standings = filing.contributors.map(({ standing }) => standing);
    const totals = filing.contributors.map(({ quality }) => quality);
    expect(standings, 'the fixture must actually disagree, or this asserts nothing').not.toEqual(totals);
    expect(Math.max(...totals)).toBe(totals[totals.length - 1]);

    expect(filing.itemOfRecord?.name).toBe('-25 Lender of Last Resort');
  });

  it('says nothing at all about an empty loadout', () => {
    const filing = fileLoadout(wearing({}));

    expect(filing.itemOfRecord).toBeNull();
    expect(filing.contributors).toEqual([]);
    expect(filing.reductionPercent).toBe(0);
    expect(filing.repeatedModifier).toBeNull();
  });

  it('notices a modifier worn three times, and not two', () => {
    // Bases cannot collide any more — each slot has its own vocabulary — but modifiers are still
    // drawn from one shared list, so three Bonded things is ordinary rather than exotic.
    const twice = fileLoadout(wearing({ Helm: 'Bonded Lanyard', Hauberk: 'Bonded Cover Note' }));
    expect(twice.repeatedModifier).toBeNull();

    const thrice = fileLoadout(wearing({
      Helm: 'Bonded Lanyard', Hauberk: 'Bonded Cover Note', Sollerets: 'Bonded Desk Space',
    }));
    expect(thrice.repeatedModifier).toEqual({ name: 'Bonded', slots: 3 });
  });

  it('ignores a slot whose contents it cannot read', () => {
    // Two separate cases, and they were nearly conflated. An uncatalogued name is *readable* — the
    // analyser returns a real breakdown totalling zero — and is excluded by the zero filter, not by
    // the null guard. Only a placeholder returns no breakdown at all, which is the guard's job and
    // is reachable from an imported save.
    const uncatalogued = fileLoadout(wearing({ Helm: 'Something Nobody Catalogued', Hauberk: 'Cover Note' }));
    expect(uncatalogued.itemOfRecord?.slot).toBe('Hauberk');
    expect(uncatalogued.contributors.every(({ slot }) => slot !== 'Helm')).toBe(true);

    const placeholder = fileLoadout(wearing({ Helm: '—', Hauberk: 'Cover Note' }));
    expect(placeholder.itemOfRecord?.slot).toBe('Hauberk');
    expect(placeholder.contributors.every(({ slot }) => slot !== 'Helm')).toBe(true);
  });

  it('is a pure function of the sheet', () => {
    const character = wearing({ Helm: 'Bonded Corner Office' });
    const before = JSON.stringify(character);

    expect(JSON.stringify(fileLoadout(character))).toBe(JSON.stringify(fileLoadout(character)));
    expect(JSON.stringify(character)).toBe(before);
  });
});
