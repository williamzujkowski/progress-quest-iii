import { describe, expect, it, vi } from 'vitest';
import { MAX_PERSISTED_VALUE } from '../../data/limits';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter, generateEquipUpgrade, generateItemReward } from '../../engine/sim';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { activeCheckpointV1Schema, characterSheetSchema } from '../../state/schemas';

const markerState = (state: GameTransitionState): GameTransitionState => ({
  ...state,
  character: {
    ...state.character,
    Plot: { ...state.character.Plot, currentProgress: state.character.Plot.maxProgress },
    Task: { description: 'History awaits routine approval...', durationMs: 1, elapsedMs: 0, type: 'cinematic' },
    PendingTasks: [{ description: 'Loading', durationMs: 1, elapsedMs: 0, type: 'act_marker' }],
  },
});

const checkpoint = (state: GameTransitionState, rng: RandomGenerator) => activeCheckpointV1Schema.parse({
  schemaVersion: 1,
  session: {
    ...state,
    rngState: rng.getState(),
    pendingElapsedMs: 0,
    isPaused: true,
    log: ['History paused while the paperwork caught up.'],
  },
});

function runActs({ resumeAt }: { resumeAt?: number } = {}) {
  const character = createNewCharacter('Long Horizon Oracle', 'Half Daemon', 'Incident Paladin', 812);
  character.Traits.Level = 87;
  character.Plot = { act: 1, currentProgress: 0, maxProgress: 21_600 };
  character.PendingTasks = undefined;
  let state: GameTransitionState = {
    character,
    progression: { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  let rng = new RandomGenerator('many-act-soak');
  const random = vi.spyOn(rng, 'random');

  for (let completedAct = 1; completedAct <= 128; completedAct += 1) {
    const ready = markerState(state);
    const expectedRng = new RandomGenerator('reward-oracle');
    expectedRng.setState(rng.getState());
    const expectedItem = generateItemReward(expectedRng, [
      'Gold',
      ...ready.character.Inventory.filter(({ name }) => name !== 'Gold').map(({ name }) => name),
    ]);
    // The act is passed because the engine passes it: the modifier register escalates with
    // `substrateStage(act)` while magnitude stays a pure function of level. An oracle that omitted it
    // would expect the legal vocabulary for ever and disagree with the engine from act twelve on.
    //
    // `ready.character.Plot.act` specifically — the act as the tick receives it. The engine reads the
    // same field rather than the local it reassigns while advancing, so a reward generated during an
    // act transition is filed under the act that earned it rather than the one that follows.
    const expectedEquipment = generateEquipUpgrade(expectedRng, ready.character.Traits.Level, ready.character.Plot.act);

    const result = advanceGame(ready, 1, rng);
    const events = result.records.map(({ event }) => event);
    const rewardEvents = events.filter(({ type }) => type === 'item_gained' || type === 'gold_received');
    const equipmentEvents = events.filter(({ type }) => type === 'equipment_gained');

    expect(result.state.character.Plot).toEqual({
      act: completedAct + 1,
      currentProgress: 0,
      maxProgress: Math.min(MAX_PERSISTED_VALUE, 3600 * (1 + 5 * (completedAct + 1))),
    });
    expect(events).toContainEqual({ type: 'act_completed', act: completedAct });
    expect(rewardEvents).toEqual([expectedItem === 'Gold'
      ? { type: 'gold_received', amount: 1 }
      : { type: 'item_gained', name: expectedItem, quantity: 1 }]);
    expect(equipmentEvents).toEqual([{ type: 'equipment_gained', ...expectedEquipment }]);
    expect(rng.getState()).toEqual(expectedRng.getState());
    expect(characterSheetSchema.safeParse(result.state.character).success).toBe(true);
    expect(activeCheckpointV1Schema.safeParse(checkpoint(result.state, rng)).success).toBe(true);
    state = result.state;

    if (completedAct === resumeAt) {
      const persisted = activeCheckpointV1Schema.parse(JSON.parse(JSON.stringify(checkpoint(state, rng))) as unknown);
      state = { character: persisted.session.character, progression: persisted.session.progression };
      rng = new RandomGenerator('restored-many-act-soak');
      rng.setState(persisted.session.rngState);
    }
  }

  expect(random.mock.calls.length).toBeLessThan(128 * 40);
  random.mockRestore();
  return { state, rngState: rng.getState() };
}

describe('indefinite Act progression', () => {
  it('crosses 128 Acts with exact level-aware rewards and identical checkpoint continuation', () => {
    expect(runActs({ resumeAt: 64 })).toEqual(runActs());
  });

  it.each([
    { completedAct: 55_554, nextAct: 55_555, expectedDuration: 999_993_600, label: 'Loading Act 55555...' },
    { completedAct: 55_555, nextAct: 55_556, expectedDuration: MAX_PERSISTED_VALUE, label: 'Loading Act 55556...' },
    { completedAct: MAX_PERSISTED_VALUE, nextAct: MAX_PERSISTED_VALUE, expectedDuration: MAX_PERSISTED_VALUE, label: 'Loading Act 1.00e9...' },
  ])('saturates the duration safely after Act $completedAct', ({ completedAct, nextAct, expectedDuration, label }) => {
    const character = createNewCharacter('Ceiling Oracle', 'Half Daemon', 'Incident Paladin', 813);
    character.Plot = { act: completedAct, currentProgress: 1, maxProgress: 1 };
    character.Task = { description: 'Testing the patience of arithmetic...', durationMs: 1, elapsedMs: 0, type: 'cinematic' };
    character.PendingTasks = [{ description: 'Loading', durationMs: 1, elapsedMs: 0, type: 'act_marker' }];
    const rng = new RandomGenerator(`act-ceiling-${completedAct}`);

    const result = advanceGame({
      character,
      progression: { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 },
    }, 1, rng);

    expect(result.state.character.Plot).toEqual({ act: nextAct, currentProgress: 0, maxProgress: expectedDuration });
    expect(result.state.character.Task.description).toBe(label);
    const events = result.records.map(({ event }) => event);
    expect(events.filter(({ type }) => type === 'item_gained' || type === 'gold_received')).toHaveLength(1);
    expect(events.filter(({ type }) => type === 'equipment_gained')).toHaveLength(1);
    expect(activeCheckpointV1Schema.safeParse(checkpoint(result.state, rng)).success).toBe(true);
  });
});
