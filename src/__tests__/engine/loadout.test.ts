import { describe, expect, it } from 'vitest';
import { createNewCharacter } from '../../engine/sim';
import { encounterSpeedMultiplier, loadoutQuality } from '../../engine/loadout';
import { EQUIP_SLOTS } from '../../data/traits';

const hero = () => createNewCharacter('Assessed', 'Half Daemon', 'Robot Monk', 4242);

describe('loadout quality', () => {
  it('floors a negative loadout at zero rather than letting it punish the wearer', () => {
    // The decision this encodes. `-3 Burlap` is the starting hauberk and a real generated item, so
    // a negative total is not an edge case — it is the first thing a character wears. Without the
    // floor, a threadbare hauberk would lengthen encounters, which reads as a bug rather than a
    // mechanic. Negative effects, if they ever arrive, belong to adversaries.
    const character = hero();
    for (const slot of EQUIP_SLOTS) character.Equip[slot] = '';
    character.Equip.Hauberk = '-3 Burlap';

    expect(loadoutQuality(character)).toBe(0);
  });

  it('sums the slots rather than reading one', () => {
    const character = hero();
    for (const slot of EQUIP_SLOTS) character.Equip[slot] = '';
    character.Equip.Weapon = 'Mandate';
    const oneItem = loadoutQuality(character);
    character.Equip.Shield = 'Legal Hold';
    const twoItems = loadoutQuality(character);

    expect(oneItem).toBeGreaterThan(0);
    expect(twoItems).toBeGreaterThan(oneItem);
  });

  it('reads the assessor mark, so a +25 of the same base beats a plain one', () => {
    const character = hero();
    for (const slot of EQUIP_SLOTS) character.Equip[slot] = '';
    character.Equip.Weapon = 'Mandate';
    const plain = loadoutQuality(character);
    character.Equip.Weapon = '+25 Mandate';

    expect(loadoutQuality(character)).toBe(plain + 25);
  });

  it('treats an unreadable imported loadout as worth nothing rather than propagating it', () => {
    const character = hero();
    for (const slot of EQUIP_SLOTS) character.Equip[slot] = '';
    // An assessor mark past safe-integer range is rejected by the analysis; this asserts the sum
    // stays a usable number rather than becoming NaN and reaching a duration calculation.
    character.Equip.Weapon = '999999999999999999999 Mandate';

    // Compared against the same item without the unreadable mark, because finite-and-non-negative is
    // guaranteed by the return expression: `Number.isFinite(total) ? Math.max(0, total) : 0` cannot
    // produce anything else for any input, so the previous pair of assertions held whatever the
    // function did. If the twenty-one-digit mark ever started parsing, quality would be about 1e21 —
    // finite, positive, and still passing both.
    const bare = { ...character, Equip: { ...character.Equip, Weapon: 'Mandate' } };

    expect(loadoutQuality(character)).toBe(loadoutQuality(bare));
  });
});

describe('encounter speed multiplier', () => {
  it('leaves a starting loadout exactly unchanged', () => {
    // The property every recorded golden depends on: at zero quality the multiplier is one, so
    // durations are arithmetically identical rather than approximately so.
    expect(encounterSpeedMultiplier(0)).toBe(1);
  });

  it('shortens encounters as quality rises, and never reaches or passes zero', () => {
    expect(encounterSpeedMultiplier(1000)).toBe(0.5);
    expect(encounterSpeedMultiplier(3000)).toBe(0.25);
    // Asymptotic, so no clamp is needed and none can be forgotten.
    expect(encounterSpeedMultiplier(Number.MAX_SAFE_INTEGER)).toBeGreaterThan(0);
    expect(encounterSpeedMultiplier(Number.MAX_SAFE_INTEGER)).toBeLessThan(0.0001);
  });

  it('is monotonic, so a better loadout is never slower', () => {
    let previous = encounterSpeedMultiplier(0);
    for (const quality of [1, 10, 100, 500, 1000, 5000, 50_000]) {
      const next = encounterSpeedMultiplier(quality);
      expect(next, `quality ${quality}`).toBeLessThanOrEqual(previous);
      previous = next;
    }
  });

  it('refuses a negative or unreadable quality', () => {
    expect(encounterSpeedMultiplier(-500)).toBe(1);
    expect(encounterSpeedMultiplier(Number.NaN)).toBe(1);
  });
});

describe('the multiplier reaches encounter durations', () => {
  it('shortens a kill for a well-equipped hero and leaves a starting one alone', async () => {
    // "Every golden is unchanged" is only reassuring if the wiring exists at all — an unapplied
    // multiplier would satisfy it just as well. This asserts the opposite direction: with the same
    // seed and the same opponent, a heavily equipped hero's kill is strictly shorter.
    const { RandomGenerator } = await import('../../engine/prng');
    const { generateTaskDescription } = await import('../../engine/sim');

    const durationFor = (equip: (character: ReturnType<typeof hero>) => void) => {
      const character = hero();
      character.Traits.Level = 20;
      equip(character);
      // A fresh generator per run, so both see the same draws and only the loadout differs.
      let task = generateTaskDescription(new RandomGenerator('encounter-parity'), character);
      while (task.type !== 'kill') task = generateTaskDescription(new RandomGenerator('encounter-parity'), character);
      return task.durationMs;
    };

    const starting = durationFor(() => {});
    const equipped = durationFor((character) => {
      for (const slot of EQUIP_SLOTS) character.Equip[slot] = '+2000 Mandate';
    });

    expect(starting).toBeGreaterThan(0);
    expect(equipped).toBeLessThan(starting);
  });
});
