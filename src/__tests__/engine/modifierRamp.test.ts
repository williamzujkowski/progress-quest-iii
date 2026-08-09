import { describe, expect, it } from 'vitest';
import { generateEquipUpgrade } from '../../engine/sim';
import { analyzeItemMechanics } from '../../engine/itemMechanics';
import { RandomGenerator } from '../../engine/prng';
import { ARMORS, DEFENSE_ATTRIB, DEFENSE_BAD, OFFENSE_ATTRIB, OFFENSE_BAD, SHIELDS, WEAPONS } from '../../data/traits';
import { ARMOUR_BY_SLOT } from '../../data/armourBySlot';

/**
 * The modifier a character carries should say what kind of character they are.
 *
 * It did not. `rng.pick(better)` drew uniformly over the whole table, so a level-200 hero was
 * exactly as likely to draw `Vetted` (+1) as `Ratified` (+7) — measured over 4 000 items per level,
 * the mean modifier value flatlined at +2.82 from level 60 to level 200, with the same three words
 * on top at both ends. Every item's total is topped up to the character's level exactly, so the
 * shortfall the vocabulary failed to absorb went into the assessor's mark: mean |mark| 4.4 at level
 * 25 and 174 at level 200. A late item was a large integer with two decorative words attached.
 *
 * The second failure was quieter. A draw that did not fit ended the loop rather than retrying, so a
 * modifier slot was lost to bad luck — two thirds of level-2 items carried no modifier at all.
 *
 * The fix needs no level curve of its own, which is the part worth keeping: `plus` is already the
 * shortfall between the base and the character, so "what fits" is already a level-appropriate
 * question. The ramp was in the arithmetic and the uniform draw was discarding it.
 */

const profile = (level: number, samples = 3000) => {
  const rng = new RandomGenerator(`ramp-${level}`);
  let modifiers = 0;
  let valueSum = 0;
  let bare = 0;
  let markSum = 0;

  for (let index = 0; index < samples; index += 1) {
    const { slot, name } = generateEquipUpgrade(rng, level);
    const quality = analyzeItemMechanics({ kind: 'equipment', name, slot }).quality!;
    modifiers += quality.modifiers.length;
    if (quality.modifiers.length === 0) bare += 1;
    for (const { value } of quality.modifiers) valueSum += value;
    markSum += Math.abs(quality.mark?.value ?? 0);
    // The invariant every claim below rests on: the item is worth exactly the character's level.
    expect(quality.total, `${name} at level ${level}`).toBe(level);
  }

  return {
    perItem: modifiers / samples,
    meanValue: valueSum / Math.max(1, modifiers),
    bareShare: bare / samples,
    meanMark: markSum / samples,
  };
};

describe('modifier grandeur tracks the character', () => {
  it('climbs monotonically in value across the whole level range', () => {
    // The defect was a flat line from 60 to 200. Checked as a monotone sequence rather than at two
    // points, because a ramp that only moves early is the same failure further along.
    const values = [10, 25, 60, 120, 200].map((level) => profile(level).meanValue);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index], `level step ${index}: ${values.join(' -> ')}`).toBeGreaterThan(values[index - 1]!);
    }
    // And the range is wide enough to be visible rather than technically monotone.
    expect(values.at(-1)! / values[0]!).toBeGreaterThan(20);
  });

  it('starts small, so a new character is not handed a grand word', () => {
    // The other half of the ask. A level-10 item may carry `Endorsed`; it may not carry `Hallowed`.
    const early = profile(10);
    expect(early.meanValue).toBeLessThan(3);
    expect(profile(200).meanValue).toBeGreaterThan(20);
  });

  it('leaves far less of the item in the assessor mark', () => {
    // The visible symptom. The mark absorbs whatever the vocabulary cannot, so a ramp that works
    // shows up here as a smaller number in the item's name.
    expect(profile(200).meanMark).toBeLessThan(100);
    expect(profile(120).meanMark).toBeLessThan(60);
  });

  it('stops losing a slot to an unlucky draw', () => {
    // Two thirds of level-2 items used to carry no modifier, because drawing something too large
    // ended the loop instead of trying something smaller.
    expect(profile(2).bareShare).toBeLessThan(0.45);
    expect(profile(2).perItem).toBeGreaterThan(0.6);
  });

  it('changes only how the total is composed, never the total', () => {
    // Asserted inside `profile` for every sampled item at every level. Restated here because it is
    // the reason this change cannot affect pacing: `plus` is the shortfall and the leftover becomes
    // the mark, so base + modifiers + mark is the character's level whatever the words are.
    for (const level of [1, 3, 17, 64, 200]) profile(level, 400);
  });
});

describe('the modifier vocabulary stays parseable', () => {
  const BASES = [...new Set([
    ...WEAPONS.map(([name]) => name),
    ...SHIELDS.map(([name]) => name),
    ...ARMORS.map(([name]) => name),
    ...Object.values(ARMOUR_BY_SLOT).flat(),
  ])];
  const MODIFIERS = [...OFFENSE_ATTRIB, ...OFFENSE_BAD, ...DEFENSE_ATTRIB, ...DEFENSE_BAD];

  it('never lets a modifier hide inside a base name', () => {
    // `analyzeItemMechanics` matches modifiers with `name.includes(label)`, so a modifier that is a
    // substring of any base silently adds its value to every item built on that base. This is not
    // hypothetical: `Sovereign`, `Constitutional` and `Chartered` were all drafted for the extended
    // ladder and all three collide — with `Sovereign Wealth`, `Constitutional Convention` and
    // `Charter`. Nothing was checking, and the tables happened to be clean.
    for (const [modifier] of MODIFIERS) {
      const hiding = BASES.filter((base) => base.includes(modifier));
      expect(hiding, `"${modifier}" is a substring of ${hiding.join(', ')}`).toEqual([]);
    }
  });

  it('keeps the ladders reaching further than the tallest base', () => {
    // The good tables have to out-reach the bases, or the mark absorbs the difference again. The bad
    // tables must not: they are only consulted when the base out-levels the character, so |plus| is
    // bounded by the tallest base and a deeper penalty would be a word no save can draw.
    const tallestBase = Math.max(...[...WEAPONS, ...SHIELDS, ...ARMORS].map(([, quality]) => quality));

    for (const table of [OFFENSE_ATTRIB, DEFENSE_ATTRIB]) {
      expect(Math.max(...table.map(([, value]) => value))).toBeGreaterThan(tallestBase * 4);
    }
    for (const table of [OFFENSE_BAD, DEFENSE_BAD]) {
      expect(Math.max(...table.map(([, value]) => Math.abs(value)))).toBeLessThanOrEqual(tallestBase);
    }
  });
});
