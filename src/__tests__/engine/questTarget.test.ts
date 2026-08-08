import { describe, expect, it } from 'vitest';
import { createNewCharacter, generateTaskDescription } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame } from '../../engine/transition';
import { MONSTERS } from '../../data/traits';
import type { CharacterSheet } from '../../engine/types';

/**
 * `generateMonsterTask` has always biased one kill in four toward the monster the active quest
 * named, and then thrown the fact away — so meeting the named thing advanced the quest by exactly as
 * much as meeting anything else. The game arranged a coincidence and declined to notice it.
 */

const TARGET_INDEX = 12;
const target = MONSTERS[TARGET_INDEX]!;

const onQuestFor = (overrides: Partial<CharacterSheet> = {}): CharacterSheet => {
  const character = createNewCharacter('Hunter', 'Half Daemon', 'Robot Monk', new RandomGenerator('hunter'));
  return {
    ...character,
    Quest: {
      description: `Exterminate the ${target.name}`,
      currentProgress: 0,
      maxProgress: 1000,
      history: ['something earlier'],
      kind: 'exterminate',
      target: `${target.name}|${target.level}|${target.item}`,
      targetIndex: TARGET_INDEX,
    },
    ...overrides,
  };
};

/** The quest progress a single completed kill produced. */
const questGainFrom = (character: CharacterSheet, questTarget: boolean): number => {
  const withTask: CharacterSheet = {
    ...character,
    PendingTasks: undefined,
    Task: { description: 'Executing a thing...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'random' }, ...(questTarget ? { questTarget: true } : {}) },
  };
  const result = advanceGame(
    { character: withTask, progression: { experience: { currentSeconds: 0, maxSeconds: 1_000_000 }, completedTasks: 0, elapsedSeconds: 0 } },
    1000,
    new RandomGenerator('hunt'),
  );
  return result.state.character.Quest.currentProgress;
};

describe('the quest notices when the hero meets the thing it named', () => {
  it('advances faster for the named monster than for anything else', () => {
    const hero = onQuestFor();
    const ordinary = questGainFrom(hero, false);
    const named = questGainFrom(hero, true);

    expect(ordinary).toBeGreaterThan(0);
    expect(named).toBe(ordinary * 3);
  });

  it('marks the task only when the quest actually names a monster', () => {
    // The flag is what the transition reads, so where it is *not* set matters as much as where it
    // is. A quest with no kind, or with a target the index no longer resolves to, must produce
    // ordinary kills — those are the shapes an old save and every recorded fixture are in.
    const seeded = (character: CharacterSheet, seed: string) =>
      generateTaskDescription(new RandomGenerator(seed), character).questTarget === true;

    const hunting = onQuestFor();
    const plain = onQuestFor({ Quest: { description: 'Test quest', currentProgress: 0, maxProgress: 1000 } });
    const mismatched = onQuestFor({
      Quest: { ...onQuestFor().Quest, target: 'Something Else|1|thing' },
    });

    // Across many seeds the bias fires sometimes and never for the other two.
    const seeds = Array.from({ length: 200 }, (_unused, index) => `s${index}`);
    const marked = seeds.filter((seed) => seeded(hunting, seed)).length;

    expect(marked, 'the one-in-four bias should fire sometimes').toBeGreaterThan(0);
    expect(marked, 'and not always, or the flag would be meaningless').toBeLessThan(seeds.length);
    expect(seeds.filter((seed) => seeded(plain, seed))).toEqual([]);
    expect(seeds.filter((seed) => seeded(mismatched, seed))).toEqual([]);
  });

  it('is inert for the quest every recorded fixture is on', () => {
    // ADR 0010's licence, in the arithmetic form. Every fixture's quest is `Test quest` with neither
    // `kind` nor `targetIndex`, so the marker is never set and the multiplier is exactly one — not
    // because the fixtures happen not to reach the branch, but because the guard cannot pass there.
    const fixtureQuest = onQuestFor({ Quest: { description: 'Test quest', currentProgress: 0, maxProgress: 1000 } });
    const seeds = Array.from({ length: 200 }, (_unused, index) => `f${index}`);

    for (const seed of seeds) {
      expect(generateTaskDescription(new RandomGenerator(seed), fixtureQuest).questTarget).toBeUndefined();
    }
  });

  it('leaves a task restored without the marker reading as an ordinary kill', () => {
    // A checkpoint written before the field existed. Absent must mean ordinary, which is the safe
    // direction: the worst a lost marker costs is one quest tick.
    //
    // Written with the three task shapes built explicitly, because the obvious version of this test
    // called the same helper twice with the same argument and compared a value with itself.
    const hero = onQuestFor();
    const gainWith = (task: Partial<CharacterSheet['Task']>) => {
      const withTask: CharacterSheet = {
        ...hero,
        PendingTasks: undefined,
        Task: { description: 'Executing a thing...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'random' }, ...task },
      };
      return advanceGame(
        { character: withTask, progression: { experience: { currentSeconds: 0, maxSeconds: 1_000_000 }, completedTasks: 0, elapsedSeconds: 0 } },
        1000,
        new RandomGenerator('hunt'),
      ).state.character.Quest.currentProgress;
    };

    const absent = gainWith({});
    const explicitlyFalse = gainWith({ questTarget: false });
    const marked = gainWith({ questTarget: true });

    expect(absent).toBe(explicitlyFalse);
    expect(marked).toBe(absent * 3);
  });
});
