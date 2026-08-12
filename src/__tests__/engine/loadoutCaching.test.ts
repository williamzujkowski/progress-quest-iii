import { describe, expect, it } from 'vitest';
import { fileLoadout } from '../../engine/loadoutFiling';
import { loadoutQuality } from '../../engine/loadout';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import type { CharacterSheet } from '../../engine/types';

/**
 * Both of these are pure functions of `character.Equip` and both are expensive — eleven
 * `analyzeItemMechanics` calls each — and both sit on a render path that runs every tick, because
 * `LogFeed` selects `state.character` and the character's identity changes every tick as the task
 * advances. Measured over 2 000 real ticks: the character's identity changed 2 000 times and
 * `Equip`'s changed 14.
 *
 * So each keeps one slot of memory keyed on the equipment object's identity. The whole risk of that
 * is staleness, which is what this file is for: a cache that never invalidates is faster and wrong.
 */

const hero = (): CharacterSheet => createNewCharacter('Cached', 'Half Daemon', 'Incident Paladin', new RandomGenerator('cache'));

const wearing = (character: CharacterSheet, slot: 'Weapon' | 'Hauberk', name: string): CharacterSheet =>
  ({ ...character, Equip: { ...character.Equip, [slot]: name } });

describe('the loadout caches answer the question they were asked', () => {
  it('returns the same filing for the same equipment object', () => {
    const character = hero();

    // Reference equality, which is what proves the cache was used rather than that the function is
    // deterministic — it is deterministic either way, so a value comparison would pass uncached.
    expect(fileLoadout(character)).toBe(fileLoadout(character));
  });

  it('notices when a slot changes', () => {
    // The failure mode worth guarding. `Equip` is replaced rather than mutated whenever the engine
    // changes a slot, so identity is a sound key — but only if a replaced object actually misses.
    const character = hero();
    const before = fileLoadout(character);
    const after = fileLoadout(wearing(character, 'Hauberk', '+9 Master Agreement'));

    expect(after).not.toBe(before);
    // A fresh object is necessary and not sufficient — it must also describe the new loadout.
    // The starting hero wears nothing that contributes, so the observable is that something now does.
    expect(before.contributors.length).toBe(0);
    expect(after.contributors.length).toBeGreaterThan(0);
    expect(after.itemOfRecord?.name).toContain('Master Agreement');
  });

  it('notices a change back, rather than holding the newest answer', () => {
    // A one-entry cache keyed on identity must miss in both directions. Returning to a previous
    // loadout is an ordinary thing for an imported or restored character to do.
    const character = hero();
    const upgraded = wearing(character, 'Hauberk', '+9 Master Agreement');
    const first = fileLoadout(character);
    expect(fileLoadout(upgraded).contributors.length).toBeGreaterThan(0);

    expect(fileLoadout(character).contributors.length).toBe(first.contributors.length);
    expect(fileLoadout(character).itemOfRecord).toBe(first.itemOfRecord);
  });

  it('quotes the same quality for the same equipment, and a different one when it moves', () => {
    const character = hero();
    const bare = loadoutQuality(character);
    const upgraded = loadoutQuality(wearing(character, 'Hauberk', '+9 Master Agreement'));

    expect(loadoutQuality(character)).toBe(bare);
    expect(upgraded).not.toBe(bare);
    // The premise: a run where the upgrade changed nothing would make the inequality above accidental.
    expect(upgraded).toBeGreaterThan(bare);
  });

  it("does not leak one character's loadout into another", () => {
    // Two sheets alive at once is the roster's ordinary state, and a single-slot cache keyed on the
    // wrong thing would answer for whichever was asked last.
    const one = hero();
    const two = wearing(createNewCharacter('Other', 'Double Tenant', 'Robot Monk', new RandomGenerator('other')), 'Weapon', '+9 Claw-Back');

    const first = loadoutQuality(one);
    const second = loadoutQuality(two);

    /*
     * The premise, and the reason the two sheets must differ.
     *
     * They used to be equipped `Stick` and `Sharp Rock`, neither of which is in `WEAPONS`, so
     * `loadoutQuality` returned 0 for both — and `toBe` on numbers is value equality, so the exact
     * cache this test exists to forbid, one keyed on the wrong thing and answering for whichever
     * sheet was asked last, produced the same four zeros and passed.
     */
    expect(second, 'both sheets quote the same quality, so a leak would be invisible').not.toBe(first);

    expect(loadoutQuality(one)).toBe(first);
    expect(loadoutQuality(two)).toBe(second);
  });
});
