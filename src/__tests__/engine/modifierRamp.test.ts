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

  it('keeps the mark a residue rather than a fifth of the item, where the game is played', () => {
    /*
     * The first ramp shrank the mark in absolute terms and left it growing as a *share*: 21% of the
     * item at level 50, 24% at 65, 32% at 200. Two draws from a x1.6 ladder leave a residue on the
     * order of the gap between adjacent rungs, and that gap grows with the rung — so the original
     * complaint, an item that is a large integer with two decorative words attached, was mitigated
     * rather than fixed.
     *
     * Bounded through the band a save actually reaches. Levelling is exponential — level 80 is about
     * 333 days of play — so 20 to 80 is where this matters, and above it the ladder stays coarse on
     * purpose rather than by neglect.
     */
    for (const level of [30, 50, 65, 80]) {
      const share = profile(level).meanMark / level;
      expect(share, `level ${level}: mark is ${(share * 100).toFixed(0)}% of the item`).toBeLessThan(0.15);
    }
  });

  it('did not buy that by narrowing what the items are called', () => {
    // The lever this replaced — taking the largest rung that fits on the last draw — halved the mark
    // and shrank the vocabulary by a third, with one word taking 36% of every draw at level 80. That
    // trades the funny part for the tidy part. Densifying does the opposite, so the floor is asserted
    // beside the ceiling above rather than left to be assumed.
    for (const level of [50, 65]) {
      const rng = new RandomGenerator(`spread-${level}`);
      const words = new Set<string>();
      for (let index = 0; index < 3000; index += 1) {
        const { slot, name } = generateEquipUpgrade(rng, level);
        for (const { name: modifier } of analyzeItemMechanics({ kind: 'equipment', name, slot }).quality!.modifiers) {
          words.add(modifier);
        }
      }
      expect(words.size, `level ${level} draws only ${words.size} distinct modifiers`).toBeGreaterThan(28);
    }
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

  it('carries no rung the draw cannot reach', () => {
    /*
     * Six negative rungs were added on the argument that |plus| is bounded by the tallest base, so
     * anything inside thirty is drawable. The bound is right and the distribution is not: the base
     * is chosen best-of-six-closest-to-level, so the shortfall is small by construction and never
     * approaches it. Four of the six were drawn zero times in 194 811 negative draws.
     *
     * Asserted by sampling rather than by a value threshold, because the reachable depth is a
     * consequence of the base tables and the selection rule, not a number anybody chose. If either
     * changes, this measures the new answer instead of enforcing the old one.
     */
    const drawn = new Set<string>();
    for (let level = 1; level <= 25; level += 1) {
      const rng = new RandomGenerator(`reach-${level}`);
      for (let index = 0; index < 1200; index += 1) {
        const { slot, name } = generateEquipUpgrade(rng, level);
        for (const { name: modifier } of analyzeItemMechanics({ kind: 'equipment', name, slot }).quality!.modifiers) {
          drawn.add(modifier);
        }
      }
    }

    // Asserted on depth rather than on each individual word, and the first draft got that wrong.
    // Requiring every rung to be *observed* fails on `Unfunded`, which is genuinely reachable — two
    // draws in 194 811 — and simply absent from a sample this size. That is an underpowered test
    // reporting a defect, which is worse than no test.
    //
    // Depth is the stable quantity: the deepest rung the draw reaches barely moves between samples,
    // while which rare word turns up does. A rung deeper than anything observed is dead, whoever
    // added it.
    const deepestDrawn = Math.max(...[...drawn].map((modifier) => {
      const entry = [...OFFENSE_BAD, ...DEFENSE_BAD].find(([label]) => label === modifier);
      return entry ? Math.abs(entry[1]) : 0;
    }));
    expect(deepestDrawn).toBeGreaterThan(0);

    for (const table of [OFFENSE_BAD, DEFENSE_BAD]) {
      const deepestListed = Math.max(...table.map(([, value]) => Math.abs(value)));
      expect(deepestListed, `a rung at -${deepestListed} when the draw reaches -${deepestDrawn}`)
        .toBeLessThanOrEqual(deepestDrawn);
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
