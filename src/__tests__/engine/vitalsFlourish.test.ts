import { describe, expect, it } from 'vitest';
import { vitalsFlourish } from '../../engine/vitalsFlourish';
import { armourTableForSlot } from '../../data/armourBySlot';
import { describeEquipment } from '../../data/itemDetails';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame } from '../../engine/transition';
import type { CharacterSheet } from '../../engine/types';

const wearing = (overrides: Partial<CharacterSheet['Equip']>): CharacterSheet['Equip'] => {
  const character = createNewCharacter('Vital', 'Half Daemon', 'Robot Monk', new RandomGenerator('vital'));
  const empty = Object.fromEntries(Object.keys(character.Equip).map((slot) => [slot, ''])) as CharacterSheet['Equip'];
  return { ...empty, ...overrides };
};

/** What one level-up added to the two decorative figures. */
const levelUpGain = (equip: Partial<CharacterSheet['Equip']>) => {
  const character = createNewCharacter('Riser', 'Half Daemon', 'Robot Monk', new RandomGenerator('riser'));
  character.PendingTasks = undefined;
  character.Equip = wearing(equip);
  character.Task = { description: 'Executing a Nit...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'random' } };
  const before = { hp: character.Stats['HP Max'], mp: character.Stats['MP Max'] };

  const maxSeconds = 1000;
  const result = advanceGame(
    { character, progression: { experience: { currentSeconds: maxSeconds, maxSeconds }, completedTasks: 0, elapsedSeconds: 0 } },
    1000,
    new RandomGenerator('rise'),
  );
  return {
    hp: result.state.character.Stats['HP Max'] - before.hp,
    mp: result.state.character.Stats['MP Max'] - before.mp,
  };
};

describe('the two numbers nothing reads', () => {
  it('flourishes only for genuinely grand armour', () => {
    expect(vitalsFlourish(wearing({}))).toEqual({ hp: 0, mp: 0 });
    // The three armour names any recorded fixture ever wears, all below the threshold.
    expect(vitalsFlourish(wearing({ Helm: 'Lanyard', Hauberk: '-3 Boilerplate' }))).toEqual({ hp: 0, mp: 0 });
    expect(vitalsFlourish(wearing({ Hauberk: 'Ring Fence' }))).toEqual({ hp: 0, mp: 0 });

    expect(vitalsFlourish(wearing({ Hauberk: 'Lender of Last Resort' })).hp).toBeGreaterThan(0);
    expect(vitalsFlourish(wearing({ Helm: 'Final Say' })).mp).toBeGreaterThan(0);
  });

  it('begins above every rung a recording could reach, with room to spare', () => {
    // The safety property, asserted as a property rather than as a constant. Only two armour nouns
    // appear in these slots across all fifteen recordings, and the threshold has to clear both — a
    // mutation lowering it to 4 leaves the suite green, which is correct: safety needs only that it
    // exceed 3. Ten is the design choice, and this pins the margin that separates the two.
    for (const name of ['Lanyard', '-3 Boilerplate', 'Macro Policy', 'Charter']) {
      expect(vitalsFlourish(wearing({ Hauberk: name, Helm: name })), name).toEqual({ hp: 0, mp: 0 });
    }

    // And the ladder does eventually flourish, or the check above would hold for a dead function.
    const hauberk = armourTableForSlot('Hauberk');
    const flourishing = hauberk.filter(([base]) => vitalsFlourish(wearing({ Hauberk: base })).hp > 0);
    expect(flourishing.length, 'the top of the ladder must flourish').toBeGreaterThan(0);
    expect(flourishing.length, 'and the bottom must not').toBeLessThan(hauberk.length);
  });

  it('keeps the two slots apart', () => {
    // Coverage raises hit points, standing raises magic points, and neither reaches across.
    expect(vitalsFlourish(wearing({ Hauberk: 'Lender of Last Resort' })).mp).toBe(0);
    expect(vitalsFlourish(wearing({ Helm: 'Final Say' })).hp).toBe(0);
  });

  it('is silent for every other slot, however grand the noun', () => {
    expect(vitalsFlourish(wearing({ Sollerets: 'Antipode', Gambeson: 'Doomsday Vault', Brassairts: 'Royal Assent' })))
      .toEqual({ hp: 0, mp: 0 });
  });

  it('grants nothing for a name it cannot read', () => {
    expect(vitalsFlourish(wearing({ Hauberk: 'Something Nobody Catalogued' }))).toEqual({ hp: 0, mp: 0 });
    expect(vitalsFlourish(wearing({ Helm: '—' }))).toEqual({ hp: 0, mp: 0 });
  });

  it('reads the base noun, not the total', () => {
    expect(vitalsFlourish(wearing({ Hauberk: '-4 Lapsed Lender of Last Resort' })).hp)
      .toBe(vitalsFlourish(wearing({ Hauberk: 'Lender of Last Resort' })).hp);
  });

  it('actually reaches the banner figure at a level', () => {
    const plain = levelUpGain({});
    const grand = levelUpGain({ Hauberk: 'Lender of Last Resort', Helm: 'Final Say' });

    expect(plain.hp).toBeGreaterThan(0);
    expect(grand.hp).toBe(plain.hp + vitalsFlourish(wearing({ Hauberk: 'Lender of Last Resort' })).hp);
    expect(grand.mp).toBe(plain.mp + vitalsFlourish(wearing({ Helm: 'Final Say' })).mp);
  });

  it('says on the tooltip that nothing reads the figure it moves', () => {
    // The line has to admit the effect is decorative, because this file is pinned to mechanical
    // truth and "raises maximum hit points" would read as a promise of survivability the game does
    // not model. Saying so plainly is the joke as well as the honest sentence.
    const grand = describeEquipment('Lender of Last Resort', 'Hauberk').effect;
    expect(grand).toMatch(/Adds [\d,]+ to maximum hit points at each level, which nothing reads\./);

    expect(describeEquipment('Final Say', 'Helm').effect)
      .toMatch(/Adds [\d,]+ to maximum magic points at each level, which nothing reads\./);

    // And never where it would be false.
    for (const [base] of armourTableForSlot('Sollerets')) {
      expect(describeEquipment(base, 'Sollerets').effect).not.toContain('which nothing reads');
    }
    expect(describeEquipment('Lanyard', 'Helm').effect).not.toContain('which nothing reads');
  });
});
