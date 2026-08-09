import { describe, expect, it } from 'vitest';
import { MAX_PERSISTED_GOLD, MAX_PERSISTED_ITEMS, MAX_PERSISTED_VALUE } from '../../data/limits';
import { RandomGenerator } from '../../engine/prng';
import { applyQuestReward, applySpellReward, createNewCharacter, generateItemReward, generateSpellReward, generateStatReward, selectQuestReward } from '../../engine/sim';
import type { StatsMap } from '../../engine/types';

const balancedStats: StatsMap = { STR: 10, CON: 10, DEX: 10, INT: 10, WIS: 10, CHA: 10, 'HP Max': 10, 'MP Max': 10 };
const skewedStats: StatsMap = { ...balancedStats, STR: 30 };
const fractionalStats: StatsMap = { ...balancedStats, STR: 1.9, CON: 1, DEX: 1, INT: 1, WIS: 1, CHA: 1 };

describe('legacy quest reward selector', () => {
  it.each([
    ['reward-6', 'spell', [0.8582482466008514, 0.6167068143840879, 0.3130796393379569, 939509]],
    ['reward-1', 'equipment', [0.44075472583062947, 0.5691582697909325, 0.868644927861169, 1340950]],
    ['reward-0', 'stat', [0.8887170488014817, 0.786268072668463, 0.7947072512470186, 1936669]],
    ['reward-2', 'item', [0.9888206494506449, 0.6089199453126639, 0.9673357147257775, 907069]],
  ] as const)('selects %s as %s with one RNG call', (seed, expected, expectedState) => {
    const rng = new RandomGenerator(seed);

    expect(selectQuestReward(rng)).toBe(expected);
    expect(rng.getState()).toEqual(expectedState);
  });

});

describe('legacy quest reward dispatcher', () => {
  it.each([
    {
      kind: 'spell',
      state: [0.578806129284203, 0.5098025279585272, 0.04669409594498575, 1],
      reset: 57,
      expected: { spells: [{ name: 'Quick Win', level: 1 }] },
      rng: [0.8500585230067372, 0.1923965464811772, 0.23654911993071437, 990286],
    },
    {
      kind: 'equipment',
      state: [0.6359334820881486, 0.37374331383034587, 0.28759220940992236, 1],
      reset: 85,
      // Moved with the modifier draw, and the `rng` cursor below did not — which is the whole
      // check. `drawModifier` selects among the entries that fit rather than uniformly over the
      // table, so this seed reaches two different words at the same two positions. Both pairs are
      // DEFENSE_BAD and both total -4 (Hotfixed -1 + Contested -3, Lapsed -1 + Misfiled -3), so the
      // item's quality is byte-identical to what it was; only the wording is new.
      expected: { equipment: ['Vambraces', 'Lapsed Misfiled Gloved Procedure'], effect: { type: 'equipment', slot: 'Vambraces', name: 'Lapsed Misfiled Gloved Procedure' } },
      rng: [0.062331163324415684, 0.7646989999338984, 0.471838767407462, 276700],
    },
    {
      kind: 'item',
      state: [0.6739257371518761, 0.3510640109889209, 0.8553721038624644, 1],
      reset: 76,
      expected: { inventory: [{ name: 'Off-Books Tally of Compliance', qty: 1 }], effect: { type: 'item', name: 'Off-Books Tally of Compliance', quantity: 1 } },
      rng: [0.7132585479412228, 0.37233209586702287, 0.28208580473437905, 1364003],
    },
    {
      kind: 'stat',
      state: [0.7377883812878281, 0.3013112908229232, 0.7470456755254418, 1],
      reset: 36,
      expected: { stat: ['CHA', 11], effect: { type: 'stat', stat: 'CHA', amount: 1 } },
      rng: [0.44738486921414733, 0.8698570972774178, 0.7554666411597282, 1991341],
    },
  ] as const)('applies the $kind branch without mutating its input', ({ state, reset, kind, expected, rng: expectedRng }) => {
    const character = createNewCharacter('Oracle', 'Half Daemon', 'Incident Paladin', 'reward-character');
    character.Stats = { ...balancedStats };
    character.Equip = { ...character.Equip, Weapon: 'Sharp Rock' };
    character.Inventory = [];
    character.Spells = [];
    const before = structuredClone(character);
    const rng = new RandomGenerator('replaced-by-vector');
    rng.setState([...state]);

    expect(rng.random(100)).toBe(reset);
    const result = applyQuestReward(rng, character);

    expect(result.kind).toBe(kind);
    if (expected.spells) expect(result.character.Spells).toEqual(expected.spells);
    if (expected.equipment) expect(result.character.Equip[expected.equipment[0]]).toBe(expected.equipment[1]);
    if (expected.inventory) expect(result.character.Inventory).toEqual(expected.inventory);
    if (expected.stat) expect(result.character.Stats[expected.stat[0]]).toBe(expected.stat[1]);
    expect(result.effect).toEqual('effect' in expected ? expected.effect : undefined);
    expect(rng.getState()).toEqual(expectedRng);
    expect(character).toEqual(before);
  });

  it('uses the legacy payment wording when an item reward reuses Gold', () => {
    const character = createNewCharacter('Oracle', 'Half Daemon', 'Incident Paladin', 'gold-vector');
    character.Inventory = Array.from({ length: 299 }, (_, index) => ({ name: `Item ${index}`, qty: 1 }));
    character.Gold = 0;
    const rng = new RandomGenerator('dispatch-gold-3255');

    expect(rng.random(100)).toBe(67);
    const result = applyQuestReward(rng, character);

    expect(result).toMatchObject({ kind: 'item', effect: { type: 'gold', amount: 1 } });
    expect(result.character.Gold).toBe(1);
    expect(result.character.Inventory).toEqual(character.Inventory);
    expect(rng.getState()).toEqual([0.8940803778823465, 0.8042314185295254, 0.5461535649374127, 267599]);
  });

  it.each([
    ['spell', [0.578806129284203, 0.5098025279585272, 0.04669409594498575, 1], (character: ReturnType<typeof createNewCharacter>) => { character.Spells = [{ name: 'Quick Win', level: 1_000_000_000 }]; }, (character: ReturnType<typeof createNewCharacter>) => character.Spells[0]?.level],
    ['stat', [0.7377883812878281, 0.3013112908229232, 0.7470456755254418, 1], (character: ReturnType<typeof createNewCharacter>) => { character.Stats.CHA = 1_000_000_000; }, (character: ReturnType<typeof createNewCharacter>) => character.Stats.CHA],
  ] as const)('keeps the %s reward within accepted save bounds', (_kind, state, arrange, readValue) => {
    const character = createNewCharacter('Boundary', 'Half Daemon', 'Incident Paladin', 'reward-boundary');
    character.Stats = { ...balancedStats };
    arrange(character);
    const rng = new RandomGenerator('replaced-by-vector');
    rng.setState([...state]);
    rng.random(100);

    const result = applyQuestReward(rng, character);

    expect(readValue(result.character)).toBe(1_000_000_000);
    expect(result.effect).toBeUndefined();
  });

  it('keeps reused item quantity and Gold within accepted save bounds', () => {
    const itemCharacter = createNewCharacter('Boundary', 'Half Daemon', 'Incident Paladin', 'item-boundary');
    itemCharacter.Inventory = [{ name: 'Off-Books Tally of Compliance', qty: 1_000_000_000 }];
    const itemRng = new RandomGenerator('replaced-by-vector');
    itemRng.setState([0.6739257371518761, 0.3510640109889209, 0.8553721038624644, 1]);
    itemRng.random(100);

    const itemResult = applyQuestReward(itemRng, itemCharacter);

    expect(itemResult.character.Inventory).toEqual([{ name: 'Off-Books Tally of Compliance', qty: 1_000_000_000 }]);
    expect(itemResult.effect).toBeUndefined();

    const goldCharacter = createNewCharacter('Boundary', 'Half Daemon', 'Incident Paladin', 'gold-boundary');
    goldCharacter.Inventory = Array.from({ length: 299 }, (_, index) => ({ name: `Item ${index}`, qty: 1 }));
    goldCharacter.Gold = 1_000_000_000_000;
    const goldRng = new RandomGenerator('dispatch-gold-3255');
    goldRng.random(100);

    const goldResult = applyQuestReward(goldRng, goldCharacter);

    expect(goldResult.character.Gold).toBe(1_000_000_000_000);
    expect(goldResult.effect).toBeUndefined();
  });

  it('reports the actual fractional stat and Gold credited at the ceiling', () => {
    const statCharacter = createNewCharacter('Boundary', 'Half Daemon', 'Robot Monk', 1);
    statCharacter.Stats = { ...balancedStats, 'MP Max': MAX_PERSISTED_VALUE - 0.5 };

    const statResult = applyQuestReward(new RandomGenerator('fraction-118'), statCharacter);

    expect(statResult.character.Stats['MP Max']).toBe(MAX_PERSISTED_VALUE);
    expect(statResult.effect).toEqual({ type: 'stat', stat: 'MP Max', amount: 0.5 });

    const goldCharacter = createNewCharacter('Boundary', 'Half Daemon', 'Robot Monk', 1);
    goldCharacter.Inventory = Array.from({ length: 299 }, (_, index) => ({ name: `Item ${index}`, qty: 1 }));
    goldCharacter.Gold = MAX_PERSISTED_GOLD - 0.5;
    const goldRng = new RandomGenerator('dispatch-gold-3255');
    goldRng.random(100);

    const goldResult = applyQuestReward(goldRng, goldCharacter);

    expect(goldResult.character.Gold).toBe(MAX_PERSISTED_GOLD);
    expect(goldResult.effect).toEqual({ type: 'gold', amount: 0.5 });
  });
});

describe('legacy spell reward', () => {
  it('uses two low-biased picks from the level and wisdom capped pool', () => {
    const rng = new RandomGenerator('spell-reward');
    const spell = generateSpellReward(rng, 1, 10);

    expect([spell, rng.getState()]).toEqual([
      'Cone of Reminders',
      [0.1777116870507598, 0.3775933461729437, 0.8863792216870934, 802657],
    ]);
  });

  it('does not consume RNG when an accepted save has an invalid spell pool', () => {
    const rng = new RandomGenerator('invalid-spell-pool');
    const initialState = rng.getState();

    expect(generateSpellReward(rng, 1, -1)).toBeUndefined();
    expect(rng.getState()).toEqual(initialState);
  });

  it('keeps a full accepted spell list within its persisted limit', () => {
    const spells = Array.from({ length: MAX_PERSISTED_ITEMS }, () => ({ name: 'Already Accounted For', level: 1 }));

    const result = applySpellReward(new RandomGenerator('spell-reward'), 1, 10, spells);

    expect(result).toHaveLength(MAX_PERSISTED_ITEMS);
  });
});

describe('legacy stat reward', () => {
  it.each([
    ['stat-0', 'CHA', [0.3283885531127453, 0.29530849447473884, 0.5603134867269546, 1437228]],
    ['stat-3', 'DEX', [0.35300477920100093, 0.5078754595015198, 0.07098527019843459, 555139]],
  ] as const)('covers direct and weighted selection for %s', (seed, stat, state) => {
    const rng = new RandomGenerator(seed);

    expect([generateStatReward(rng, balancedStats), rng.getState()]).toEqual([stat, state]);
  });

  it('uses square weighting for skewed prime stats', () => {
    const rng = new RandomGenerator('stat-3');
    expect(generateStatReward(rng, skewedStats)).toBe('STR');
    expect(rng.getState()).toEqual([0.35300477920100093, 0.5078754595015198, 0.07098527019843459, 555139]);
  });

  it('truncates accepted fractional stats like legacy GetI', () => {
    const rng = new RandomGenerator('edge-0');
    expect(generateStatReward(rng, fractionalStats)).toBe('CON');
    expect(rng.getState()).toEqual([0.9787654045503587, 0.00042752851732075214, 0.1746194192674011, 1634575]);
  });
});

describe('legacy item reward', () => {
  it('generates a three-part special item for an ordinary inventory', () => {
    const rng = new RandomGenerator('item-special');
    expect([generateItemReward(rng, ['Gold']), rng.getState()]).toEqual([
      'Deferential Guideline of Gross Margin',
      [0.6745457765646279, 0.42392367543652654, 0.7211832229513675, 1289757],
    ]);
  });

  it('can duplicate the ordered Gold row in a sufficiently large inventory', () => {
    const inventoryNames = ['Gold', ...Array.from({ length: 299 }, (_, index) => `Item ${index}`)];
    const rng = new RandomGenerator('reuse-733');

    expect(generateItemReward(rng, inventoryNames)).toBe('Gold');
    expect(rng.getState()).toEqual([0.41563358227722347, 0.8341085575520992, 0.955911073833704, 1794342]);
  });

  it('preserves an accepted empty inventory label without consuming fallback rolls', () => {
    const inventoryNames = ['', ...Array.from({ length: 299 }, (_, index) => `Item ${index}`)];
    const rng = new RandomGenerator('reuse-733');

    expect(generateItemReward(rng, inventoryNames)).toBe('');
    expect(rng.getState()).toEqual([0.41563358227722347, 0.8341085575520992, 0.955911073833704, 1794342]);
  });
});
