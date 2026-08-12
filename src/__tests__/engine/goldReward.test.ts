import { describe, expect, it } from 'vitest';
import { MAX_PERSISTED_GOLD } from '../../data/limits';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { characterSheetSchema } from '../../state/schemas';
import type { CharacterSheet } from '../../engine/types';

/**
 * The one reward branch no test had ever taken, and the ceiling that keeps its sheet writable.
 *
 * Three sites push `gold_received`, each guarded by `gold < MAX_PERSISTED_GOLD`. All three were
 * uncovered: deleting every `events.push` left the suite green, and so did inverting the guard.
 * That guard is what holds `Gold` inside `characterSheetSchema`'s `.max(MAX_PERSISTED_GOLD)`, so a
 * breach produces a sheet that cannot be written — the save-loss class, reached silently.
 *
 * It went untested because the ordinary path there is improbable rather than unimportant.
 * `generateItemReward` only returns an existing name when the bag holds more than 250 of them
 * (`Math.max(250, rng.random(999)) < inventoryNames.length`), and `'Gold'` is one entry among those
 * — so even with the bag deliberately stuffed the branch arrives about once in a thousand rewards.
 * Measured: 400 ticks of ordinary play with a 300-item bag produced 269 rewards and no gold at all.
 * A test that drove real play would need thousands of kills and would still be reporting a
 * probability rather than a behaviour.
 *
 * So the loot is pinned instead. `task.loot.type === 'fixed'` is the engine's own way of naming a
 * drop, checked before the random path in the same expression, and it makes the branch arrive on
 * the tick it is asked for. `absenceDigest.test.ts` builds the event by hand, which is why the
 * digest side looked covered while the emitter was not — this drives the emitter.
 */

const holding = (gold: number): CharacterSheet => {
  const character = createNewCharacter('Purser', 'Half Daemon', 'Robot Monk', new RandomGenerator('purser'));
  return {
    ...character,
    PendingTasks: undefined,
    // Past the prologue, which admits only `loading` and `prologue` tasks.
    Plot: { act: 1, currentProgress: 0, maxProgress: 26 },
    Gold: gold,
    Task: { description: 'Executing a Grid Bug...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'Gold' } },
  };
};

/** One tick, long enough to close the pinned task and credit whatever it drops. */
const settle = (character: CharacterSheet) => {
  const state: GameTransitionState = {
    character,
    progression: { experience: { currentSeconds: 0, maxSeconds: 10_000_000 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const result = advanceGame(state, 1000, new RandomGenerator('purse'));
  return {
    credited: result.records.filter(({ event }) => event.type === 'gold_received').length,
    character: result.state.character,
  };
};

describe('a gold reward is credited, and stops at the ceiling', () => {
  it('emits the reward and adds it to the purse', () => {
    const { credited, character } = settle(holding(0));

    // The premise. Without it the assertion below is satisfied by a run that never drew gold —
    // which is the state the whole suite was in before this file existed.
    expect(credited, 'the pinned drop was never credited, so this proves nothing').toBe(1);
    expect(character.Gold).toBe(1);
  });

  it('refuses the credit at the ceiling, and leaves a sheet that still validates', () => {
    /*
     * At the cap the branch must decline silently: no event, no increment, and above all no sheet
     * carrying a `Gold` the schema will refuse. Asserted against the schema as well as the number,
     * because the number is only interesting for what it does to the save.
     */
    const { credited, character } = settle(holding(MAX_PERSISTED_GOLD));

    expect(credited, 'a reward was credited past the ceiling').toBe(0);
    expect(character.Gold).toBe(MAX_PERSISTED_GOLD);

    const parsed = characterSheetSchema.safeParse({ ...character, Task: { ...character.Task, elapsedMs: 0 } });
    expect(parsed.success, parsed.success ? '' : parsed.error.issues.map(({ message }) => message).join('; ')).toBe(true);
  });

  it('declines only the last coin, not every coin below the ceiling', () => {
    // A guard written `<=` rather than `<`, or one that stopped a step early, would still pass the
    // two cases above. One under the cap is the boundary that tells them apart.
    const { credited, character } = settle(holding(MAX_PERSISTED_GOLD - 1));

    expect(credited).toBe(1);
    expect(character.Gold).toBe(MAX_PERSISTED_GOLD);
  });
});
