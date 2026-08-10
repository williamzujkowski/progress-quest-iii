import { describe, expect, it } from 'vitest';
import { applyQuestReward, createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { INDUSTRIAL_MODIFIERS } from '../../data/traits';
import type { CharacterSheet } from '../../engine/types';

/**
 * A quest prize ages with the world, like every other piece of equipment.
 *
 * `applyQuestReward` held `character.Plot.act` and dropped it on the way to `generateEquipUpgrade`,
 * while the two award paths in `transition.ts` both pass it. So the industrial register — the whole
 * point of coupling vocabulary to the act — reached purchases and drops and never reached a prize.
 *
 * Measured before the fix: an industrial share of 0.000 at acts 0, 12 and 20 alike, against 0.548
 * for a direct call at the same level and act 12. About 7.7% of acquisitions, which is small enough
 * to have gone unnoticed and large enough that a long-running character kept receiving prizes
 * written in a register the rest of their kit had left behind.
 */

const industrialShare = (act: number, level: number, draws: number) => {
  const base = createNewCharacter('Laureate', 'Half Daemon', 'Robot Monk', new RandomGenerator('reward'));
  let industrial = 0;
  let equipped = 0;

  for (let draw = 0; draw < draws; draw += 1) {
    const character: CharacterSheet = {
      ...base,
      Traits: { ...base.Traits, Level: level },
      Plot: { act, currentProgress: 0, maxProgress: 26 },
    };
    // Drawn until the reward kind is equipment; the other kinds are not what this is about.
    const result = applyQuestReward(new RandomGenerator(`prize-${act}-${level}-${draw}`), character);
    if (result.kind !== 'equipment') continue;
    equipped += 1;
    const slot = (Object.keys(result.character.Equip) as (keyof typeof result.character.Equip)[])
      .find((key) => result.character.Equip[key] !== character.Equip[key]);
    const name = slot === undefined ? '' : result.character.Equip[slot];
    if ([...INDUSTRIAL_MODIFIERS].some((word) => name.includes(word))) industrial += 1;
  }
  return { equipped, share: equipped === 0 ? 0 : industrial / equipped };
};

describe('a quest prize is written in the register of its act', () => {
  it('reaches the industrial register once the world has one', () => {
    const late = industrialShare(20, 90, 400);
    expect(late.equipped, 'no equipment prizes drawn').toBeGreaterThan(20);
    // 0.000 before the fix, at every act. A floor rather than a band: the exact share is a function
    // of how much of the ladder fits at this level, and that is free to move.
    expect(late.share, `industrial share ${late.share}`).toBeGreaterThan(0.1);
  });

  it('leaves the early acts in the document register, as they were', () => {
    // The coupling is a ramp, not a switch thrown on all equipment. An act below the threshold must
    // read exactly as it did, which is also what keeps the recorded fixtures untouched.
    for (const act of [0, 1, 2]) {
      const early = industrialShare(act, 90, 200);
      expect(early.equipped, `act ${act}: no equipment prizes drawn`).toBeGreaterThan(10);
      expect(early.share, `act ${act}: industrial share ${early.share}`).toBe(0);
    }
  });
});
