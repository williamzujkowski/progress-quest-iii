import { describe, expect, it, vi } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter, equipPrice } from '../../engine/sim';
import { advanceGame } from '../../engine/transition';
import type { CharacterSheet } from '../../engine/types';
import { MAX_PERSISTED_GOLD, MAX_PERSISTED_VALUE } from '../../data/limits';
import { activeCheckpointV1Schema, characterSheetSchema, MAX_PERSISTED_ITEMS } from '../../state/schemas';
import oneKillFixture from '../fixtures/goldens/one-kill.json';
import levelUpFixture from '../fixtures/goldens/xp-level-up.json';
import questFixture from '../fixtures/goldens/quest-completion.json';

function stateFor(character: CharacterSheet) {
  const isSequence = character.Task.type === 'loading' || character.Task.type === 'prologue' || character.Task.type === 'cinematic' || character.Task.type === 'act_marker';
  const sessionCharacter = isSequence || character.Plot.act !== 0
    ? character
    : { ...character, Plot: { act: 1, currentProgress: 0, maxProgress: 10 }, PendingTasks: undefined };
  return {
    character: sessionCharacter,
    progression: { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 },
  };
}

const eventsOf = (result: ReturnType<typeof advanceGame>) => result.records.map(({ event }) => event);

describe('advanceGame', () => {
  it('creates a new session at the canonical Act 0 prologue', () => {
    const character = createNewCharacter('Prologue Oracle', 'Half Daemon', 'Incident Paladin', 800);

    expect(character).toMatchObject({
      Plot: { act: 0, currentProgress: 0, maxProgress: 26 },
      Quest: { description: 'Heading to the killing fields...', currentProgress: 0, maxProgress: 1 },
      Task: { description: 'Loading....', durationMs: 2000, elapsedMs: 0 },
      PendingTasks: [
        { description: 'Attending an induction session that will not be repeated', durationMs: 10_000 },
        { description: 'Much is revealed about the previous holder of this desk', durationMs: 6000 },
        { description: 'A restructure leaves you alone, unbriefed, and formally accountable', durationMs: 6000 },
        { description: 'Locating an unallocated reserve of determination and drawing against it', durationMs: 4000 },
        { description: 'Loading', durationMs: 2000, type: 'act_marker' },
      ],
    });
  });

  it('starts the first prologue step without advancing plot during initial loading', () => {
    const character = createNewCharacter('Prologue Oracle', 'Half Daemon', 'Incident Paladin', 800);

    const result = advanceGame(stateFor(character), 2000, new RandomGenerator('unused-prologue-rng'));

    expect(result.state.character.Plot).toEqual({ act: 0, currentProgress: 0, maxProgress: 26 });
    expect(result.state.character.Task).toMatchObject({
      description: 'Attending an induction session that will not be repeated...',
      durationMs: 10_000,
      elapsedMs: 0,
      type: 'prologue',
    });
    expect(result.state.character.PendingTasks).toHaveLength(4);
  });

  it('runs the complete prologue through the Act I marker without consuming RNG', () => {
    const character = createNewCharacter('Prologue Oracle', 'Half Daemon', 'Incident Paladin', 800);
    const rng = new RandomGenerator('prologue-continuation');
    const initialRng = rng.getState();

    const atMarker = advanceGame(stateFor(character), 28_000, rng);

    expect(atMarker.state.progression).toMatchObject({ completedTasks: 5, elapsedSeconds: 28 });
    expect(atMarker.state.character.Plot).toEqual({ act: 1, currentProgress: 0, maxProgress: 21_600 });
    expect(atMarker.state.character.Task).toMatchObject({ description: 'Loading Act I...', durationMs: 2000, type: 'act_marker' });
    expect(atMarker.state.character.PendingTasks).toBeUndefined();
    expect(eventsOf(atMarker)).toContainEqual({ type: 'act_completed', act: 0 });
    expect(rng.getState()).toEqual(initialRng);

    const afterMarker = advanceGame(atMarker.state, 2000, rng);

    expect(afterMarker.state.progression).toMatchObject({ completedTasks: 6, elapsedSeconds: 30 });
    expect(afterMarker.state.character.Task).toMatchObject({ description: 'Heading to the killing fields...', durationMs: 4000, type: 'heading' });
    expect(rng.getState()).toEqual(initialRng);
  });

  it('captures event-local post-task facts before later catch-up tasks run', () => {
    const character = createNewCharacter('Context Oracle', 'Half Daemon', 'Incident Paladin', 800);

    const result = advanceGame(stateFor(character), 28_000, new RandomGenerator('unused-context-rng'));
    const taskRecords = result.records.filter(({ event }) => event.type === 'task_started');

    expect(taskRecords.map(({ post }) => post.completedTasks)).toEqual([1, 2, 3, 4, 5]);
    expect(taskRecords[0]?.post).toMatchObject({
      completedTask: 'loading',
      nextTask: 'prologue',
      act: 0,
    });
    expect(taskRecords.at(-1)?.post).toMatchObject({
      completedTask: 'prologue',
      nextTask: 'act_marker',
      act: 1,
    });
  });

  it.each([
    {
      condition: 'encumbered',
      arrange: (character: CharacterSheet) => {
        character.Inventory = [{ name: 'Bureaucratic Ballast', qty: 20 }];
      },
      expected: { description: 'Heading to market to sell loot...', durationMs: 4000, type: 'heading_to_market' },
    },
    {
      condition: 'wealthy',
      arrange: (character: CharacterSheet) => {
        character.Gold = equipPrice(character.Traits.Level) + 1;
      },
      expected: { description: 'Negotiating purchase of better equipment...', durationMs: 5000, type: 'buying' },
    },
  ])('schedules the canonical $condition route after an Act marker', ({ arrange, expected }) => {
    const character = createNewCharacter('Route Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 21_600 };
    character.Task = { description: 'Loading Act I...', durationMs: 1000, elapsedMs: 0, type: 'act_marker' };
    character.PendingTasks = undefined;
    arrange(character);

    const result = advanceGame(stateFor(character), 1000, new RandomGenerator('unused-route-rng'));

    expect(result.state.character.Task).toMatchObject(expected);
  });

  it('waits for the next kill after plot progress first reaches its maximum', () => {
    const character = createNewCharacter('Patient Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: 1, currentProgress: 4, maxProgress: 5 };
    character.Quest = { description: 'Test quest', currentProgress: 0, maxProgress: 100, history: ['Test quest'] };
    character.Task = { description: 'Executing a Nit...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    character.PendingTasks = undefined;
    const rng = new RandomGenerator('plot-edge');

    const result = advanceGame(stateFor(character), 1000, rng);

    expect(result.state.character.Plot.currentProgress).toBe(5);
    expect(result.state.character.Task.type).toBe('kill');
    expect(result.state.character.PendingTasks).toBeUndefined();
  });

  it.each([
    {
      branch: 'oasis',
      rngState: [0.719665847485885, 0.8004722977057099, 0.017481706803664565, 1] as [number, number, number, number],
      first: 'Exhausted, you reach a satellite office with a working kettle...',
      pending: [
        'You greet old colleagues and are introduced to their replacements',
        'You are invited to a steering committee with no stated agenda',
        'There is much to be done. You are chosen!',
        'Loading',
      ],
      finalRng: [0.8004722977057099, 0.017481706803664565, 0.15356952929869294, 1505281],
    },
    {
      branch: 'nemesis',
      rngState: [0.8487152096349746, 0.6674839127808809, 0.22826107195578516, 1] as [number, number, number, number],
      first: 'Your assignment is in sight, but an escalation bars your path...',
      pending: [
        'A protracted dispute opens with Oomuz the Helpdesk Hound',
        'Oomuz the Helpdesk Hound appears to have the stronger paper trail',
        'Resolved in your favour: Oomuz the Helpdesk Hound is closed. Exhausted, you take the afternoon',
        'You come round in a breakout room, and the backlog is waiting',
        'Loading',
      ],
      finalRng: [0.6513712389860302, 0.47102646343410015, 0.3233566232956946, 1335114],
    },
    {
      branch: 'double-dealer',
      rngState: [0.6487525827251375, 0.627493878826499, 0.8949407478794456, 1] as [number, number, number, number],
      first: "Oh sweet relief! You've reached the kind protection of Chair Frudem of Krabgrout...",
      pending: [
        'There is rejoicing, and an unnerving encounter with Chair Frudem of Krabgrout in private',
        'You forget your toner cartridge and go back to get it',
        "What's this!? You overhear something shocking!",
        'Could Chair Frudem of Krabgrout be a dirty double-dealer?',
        'Who can possibly be trusted with this news!? -- Oh yes, of course',
        'Loading',
      ],
      finalRng: [0.8845338865648955, 0.3499606167897582, 0.9144386406987906, 1343975],
    },
  ])('starts the canonical $branch interplot branch with legacy RNG order', ({ rngState, first, pending, finalRng }) => {
    const character = createNewCharacter('Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: 1, currentProgress: 10, maxProgress: 10 };
    character.Quest = { description: 'Test quest', currentProgress: 0, maxProgress: 100, history: ['Test quest'] };
    character.Task = { description: 'Executing a Nit...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    character.PendingTasks = [];
    const rng = new RandomGenerator('interplot-oracle');
    rng.setState(rngState);

    const result = advanceGame(stateFor(character), 1000, rng);

    expect(result.state.character.Task).toMatchObject({ description: first, type: 'cinematic' });
    expect(result.state.character.PendingTasks?.map(({ description }) => description)).toEqual(pending);
    expect(rng.getState()).toEqual(finalRng);
  });

  it('keeps a maximum-Act nemesis sequence compact while replaying every canonical round', () => {
    const character = createNewCharacter('Endless Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: MAX_PERSISTED_VALUE, currentProgress: 10, maxProgress: 10 };
    character.Quest = { description: 'Test quest', currentProgress: 0, maxProgress: 100, history: ['Test quest'] };
    character.Task = { description: 'Executing a Nit...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    character.PendingTasks = undefined;
    const rng = new RandomGenerator('endless-cinematic-oracle');
    rng.setState([0.8487152096349746, 0.6674839127808809, 0.22826107195578516, 1]);
    const random = vi.spyOn(rng, 'random');

    const opened = advanceGame(stateFor(character), 1000, rng);
    const cursor = opened.state.character.PendingTasks?.find(({ type }) => type === 'nemesis_cursor');
    expect(cursor).toMatchObject({ type: 'nemesis_cursor', round: 96, rollLimit: MAX_PERSISTED_VALUE + 2 });
    if (!cursor || cursor.type !== 'nemesis_cursor') throw new Error('Expected a compact nemesis cursor');
    expect(random.mock.calls.length).toBeLessThanOrEqual(205);
    random.mockRestore();
    expect(opened.state.character.PendingTasks).toHaveLength(100);
    expect(characterSheetSchema.safeParse(opened.state.character).success).toBe(true);
    expect(rng.getState()).toEqual(cursor.replayRngState);
    const checkpoint = {
      schemaVersion: 1 as const,
      session: { character: opened.state.character, rngState: rng.getState(), progression: opened.state.progression, isPaused: false, log: [] },
    };
    expect(activeCheckpointV1Schema.safeParse(checkpoint).success).toBe(true);
    expect(activeCheckpointV1Schema.safeParse({
      ...checkpoint,
      session: { ...checkpoint.session, rngState: new RandomGenerator('wrong-cursor-continuation').getState() },
    }).success).toBe(false);
    expect(characterSheetSchema.safeParse({
      ...opened.state.character,
      PendingTasks: opened.state.character.PendingTasks?.map((entry) => entry.type === 'nemesis_cursor'
        ? { ...entry, rollLimit: entry.rollLimit - 1 }
        : entry),
    }).success).toBe(false);

    const atStruggle = advanceGame(opened.state, 1000, rng);
    const firstRound = advanceGame(atStruggle.state, 4000 + 95 * 2000, rng);
    const nextCursor = firstRound.state.character.PendingTasks?.[0];
    expect(firstRound.state.character.Task.type).toBe('cinematic');
    expect(nextCursor).toMatchObject({
      type: 'nemesis_cursor',
      round: 97,
      replayRngState: rng.getState(),
    });
    expect(characterSheetSchema.safeParse(firstRound.state.character).success).toBe(true);
  });

  // Provenance: these values were recorded from the original build, not copied from this engine.
  // The same scenario is captured as fixtures/goldens/random-star-interplot.json, which the
  // goldens suite replays. Worth stating, because the two genuinely order their draws differently
  // here - transition.ts computes loot between the cinematic's opening and its remainder, where
  // the original ran InterplotCinematic whole - and a reader could reasonably assume a single
  // pinned seed was masking that. It is not: the recording agrees on the observable surface.
  it('awards random-star loot before generating the remaining nemesis cinematic', () => {
    const character = createNewCharacter('Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: 1, currentProgress: 10, maxProgress: 10 };
    character.Quest = { description: 'Test quest', currentProgress: 0, maxProgress: 100, history: ['Test quest'] };
    character.Task = { description: 'Executing a Basic Support...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'random' } };
    character.PendingTasks = undefined;
    const rng = new RandomGenerator('random-star-cinematic');
    rng.setState([0.8487152096349746, 0.6674839127808809, 0.22826107195578516, 1]);

    const result = advanceGame(stateFor(character), 1000, rng);

    expect(result.state.character.Inventory).toContainEqual({ name: 'Customary Tariff of Governance', qty: 1 });
    expect(result.state.character.PendingTasks?.map(({ description }) => description)).toEqual([
      'A protracted dispute opens with Zouvjaen the Wrap-Up Wraith',
      'Zouvjaen the Wrap-Up Wraith appears to have the stronger paper trail',
      'Locked in grim correspondence with Zouvjaen the Wrap-Up Wraith',
      'Resolved in your favour: Zouvjaen the Wrap-Up Wraith is closed. Exhausted, you take the afternoon',
      'You come round in a breakout room, and the backlog is waiting',
      'Loading',
    ]);
    expect(rng.getState()).toEqual([0.03230942226946354, 0.7913503504823893, 0.7409795469138771, 678575]);
  });

  it('uses the canonical three-part item table for random-star loot', () => {
    const character = createNewCharacter('Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: 1, currentProgress: 10, maxProgress: 10 };
    character.Quest = { description: 'Test quest', currentProgress: 0, maxProgress: 100, history: ['Test quest'] };
    character.Task = { description: 'Executing a Basic Support...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'random' } };
    character.PendingTasks = undefined;
    const rng = new RandomGenerator('random-star-item-oracle');
    rng.setState([0, 0, 0, 0]);

    const result = advanceGame(stateFor(character), 1000, rng);

    expect(result.state.character.Inventory).toContainEqual({ name: 'Certified Directive of Foreseeable Risk', qty: 1 });
    expect(rng.getState()).toEqual([0, 0, 0, 0]);
  });

  it('completes Act I with typed reward events in canonical RNG order', () => {
    const character = createNewCharacter('Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: 1, currentProgress: 1000, maxProgress: 1000 };
    character.Task = { description: 'There is much to be done. You are chosen!...', durationMs: 1000, elapsedMs: 0, type: 'cinematic' };
    character.PendingTasks = [{ description: 'Loading', durationMs: 1000, elapsedMs: 0, type: 'act_marker' }];
    character.Inventory = [];
    const rng = new RandomGenerator('act-reward-oracle');
    rng.setState([0.34067121776752174, 0.28646080009639263, 0.8245062702335417, 1]);

    const result = advanceGame(stateFor(character), 1000, rng);

    expect(result.state.character.Plot).toEqual({ act: 2, currentProgress: 0, maxProgress: 39_600 });
    expect(result.state.character.Inventory).toContainEqual({ name: 'Off-Books Seal of Silent Failure', qty: 1 });
    expect(result.state.character.Equip.Helm).toBe('Lanyard');
    expect(eventsOf(result)).toEqual([
      { type: 'act_completed', act: 1 },
      { type: 'item_gained', name: 'Off-Books Seal of Silent Failure', quantity: 1 },
      { type: 'equipment_gained', slot: 'Helm', name: 'Lanyard' },
      { type: 'save_requested', characterName: 'Oracle' },
      { type: 'task_started', task: result.state.character.Task },
    ]);
    expect(rng.getState()).toEqual([0.06199767650105059, 0.7019953967537731, 0.5525467498227954, 439734]);

    const actTwo = structuredClone(result.state.character);
    actTwo.Plot.currentProgress = actTwo.Plot.maxProgress;
    actTwo.Task = { description: 'The sequel continues despite precedent...', durationMs: 1000, elapsedMs: 0, type: 'cinematic' };
    actTwo.PendingTasks = [{ description: 'Loading', durationMs: 1000, elapsedMs: 0, type: 'act_marker' }];
    const actThree = advanceGame({ character: actTwo, progression: result.state.progression }, 1000, rng);

    expect(actThree.state.character.Plot).toEqual({ act: 3, currentProgress: 0, maxProgress: 57_600 });
    expect(eventsOf(actThree)).toContainEqual({ type: 'act_completed', act: 2 });
    expect(eventsOf(actThree).filter(({ type }) => type === 'item_gained' || type === 'gold_received')).toHaveLength(1);
    expect(eventsOf(actThree).filter(({ type }) => type === 'equipment_gained')).toHaveLength(1);
    expect(characterSheetSchema.safeParse(actThree.state.character).success).toBe(true);
  });

  it('retires giant decimal Act markers for scientific notation', () => {
    const character = createNewCharacter('Exponent Oracle', 'Half Daemon', 'Incident Paladin', 800);
    character.Plot = { act: 999_999, currentProgress: 1, maxProgress: 1 };
    character.Task = { description: 'The decimals grow restless...', durationMs: 1000, elapsedMs: 0, type: 'cinematic' };
    character.PendingTasks = [{ description: 'Loading', durationMs: 1000, elapsedMs: 0, type: 'act_marker' }];

    const result = advanceGame(stateFor(character), 1000, new RandomGenerator('scientific-act-marker'));

    expect(result.state.character.Task.description).toBe('Loading Act 1.00e6...');
  });

  it('advances an incomplete task without mutating the previous state', () => {
    const character = createNewCharacter('Seam Tester', 'Off-Prem Elf', 'Vermineer', 801);
    const state = {
      character,
      progression: {
        experience: { currentSeconds: 0, maxSeconds: 10 },
        completedTasks: 0,
        elapsedSeconds: 0,
      },
    };
    const snapshot = structuredClone(state);

    const result = advanceGame(state, 500, new RandomGenerator('transition-progress'));

    expect(result).toEqual({
      state: {
        character: { ...character, Task: { ...character.Task, elapsedMs: 500 } },
        progression: state.progression,
      },
      records: [],
      remainingElapsedMs: 0,
    });
    expect(state).toEqual(snapshot);
  });

  it('matches the legacy one-kill state, events, remainder, and RNG continuation', () => {
    const sheet = oneKillFixture.input.sheet;
    const character: CharacterSheet = {
      Traits: structuredClone(sheet.Traits),
      Stats: structuredClone(sheet.Stats),
      Equip: structuredClone(sheet.Equips),
      Inventory: [],
      Spells: [],
      Gold: 0,
      Plot: { act: sheet.act, currentProgress: sheet.PlotBar.position, maxProgress: sheet.PlotBar.max },
      Quest: { description: sheet.bestquest, currentProgress: sheet.QuestBar.position, maxProgress: sheet.QuestBar.max, history: [...sheet.Quests] },
      Task: {
        description: sheet.kill,
        durationMs: sheet.TaskBar.max,
        elapsedMs: 0,
        type: 'kill',
        loot: { type: 'fixed', item: 'nit tail' },
      },
    };
    const state = {
      character,
      progression: {
        experience: { currentSeconds: sheet.ExpBar.position, maxSeconds: sheet.ExpBar.max },
        completedTasks: sheet.tasks,
        elapsedSeconds: sheet.elapsed,
      },
    };
    const snapshot = structuredClone(state);
    const rng = new RandomGenerator('legacy-one-kill');
    rng.setState([...sheet.seed] as [number, number, number, number]);

    const result = advanceGame(state, sheet.TaskBar.max + 100, rng);

    expect(result.state.progression).toEqual({
      experience: { currentSeconds: 6, maxSeconds: 1269 },
      completedTasks: 1,
      elapsedSeconds: 6,
    });
    expect(result.state.character).toMatchObject({
      Inventory: [{ name: 'nit tail', qty: 1 }],
      Quest: { currentProgress: 6, maxProgress: 100 },
      Plot: { currentProgress: 6, maxProgress: 1000 },
      Task: {
        description: 'Executing a Grid Bug...',
        durationMs: 6000,
        elapsedMs: 100,
        type: 'kill',
        loot: { type: 'fixed', item: 'grid bug trace' },
      },
    });
    expect(eventsOf(result)).toEqual([
      { type: 'item_gained', name: 'nit tail', quantity: 1 },
      { type: 'task_started', task: { ...result.state.character.Task, elapsedMs: 0 } },
    ]);
    expect(result.remainingElapsedMs).toBe(0);
    expect(rng.getState()).toEqual(oneKillFixture.expected.rng);
    expect(state).toEqual(snapshot);
    const taskEvent = eventsOf(result).find((event) => event.type === 'task_started');
    if (!taskEvent) throw new Error('Expected task-started event');
    taskEvent.task.elapsedMs = 999;
    if (taskEvent.task.loot?.type === 'fixed') taskEvent.task.loot.item = 'tampered';
    expect(result.state.character.Task).toMatchObject({ elapsedMs: 100, loot: { item: 'grid bug trace' } });
  });

  it('emits structured legacy level-up facts without producing side effects', () => {
    const sheet = levelUpFixture.input.sheet;
    const character: CharacterSheet = {
      Traits: structuredClone(sheet.Traits),
      Stats: structuredClone(sheet.Stats),
      Equip: structuredClone(sheet.Equips),
      Inventory: [],
      Spells: [],
      Gold: 0,
      Plot: { act: sheet.act, currentProgress: sheet.PlotBar.position, maxProgress: sheet.PlotBar.max },
      Quest: { description: sheet.bestquest, currentProgress: sheet.QuestBar.position, maxProgress: sheet.QuestBar.max, history: [...sheet.Quests] },
      Task: { description: sheet.kill, durationMs: sheet.TaskBar.max, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } },
    };
    const state = {
      character,
      progression: {
        experience: { currentSeconds: sheet.ExpBar.position, maxSeconds: sheet.ExpBar.max },
        completedTasks: sheet.tasks,
        elapsedSeconds: sheet.elapsed,
      },
    };
    const rng = new RandomGenerator('legacy-level-up');
    rng.setState([...sheet.seed] as [number, number, number, number]);

    const result = advanceGame(state, sheet.TaskBar.max, rng);

    expect(result.state.character.Traits.Level).toBe(2);
    expect(result.state.character.Stats).toEqual({ STR: 10, CON: 10, DEX: 10, INT: 11, WIS: 10, CHA: 10, 'HP Max': 17, 'MP Max': 15 });
    expect(result.state.character.Spells).toEqual([{ name: 'Wet Signature', level: 1 }]);
    expect(result.state.progression.experience).toEqual({ currentSeconds: 0, maxSeconds: 1279 });
    expect(eventsOf(result)).toEqual([
      // The level carries the experience track that filled to cause it — the same figure the
      // fixture's ExpBar maximum states, asserted rather than stripped.
      { type: 'level_gained', level: 2, reason: { experienceSeconds: sheet.ExpBar.max } },
      { type: 'stat_gained', stat: 'HP Max', amount: 6 },
      { type: 'stat_gained', stat: 'MP Max', amount: 5 },
      { type: 'stat_gained', stat: 'INT', amount: 1 },
      { type: 'stat_gained', stat: 'HP Max', amount: 1 },
      { type: 'save_requested', characterName: 'Oracle' },
      { type: 'item_gained', name: 'nit tail', quantity: 1 },
      { type: 'task_started', task: result.state.character.Task },
    ]);
    expect(rng.getState()).toEqual(levelUpFixture.expected.rng);
  });

  it('reports the actual fractional secondary-stat gain during level-up', () => {
    const character = createNewCharacter('Fractional Hero', 'Half Daemon', 'Robot Monk', 813);
    character.Stats = { STR: 10, CON: 10, DEX: 10, INT: 10, WIS: 10, CHA: 10, 'HP Max': 10.5, 'MP Max': 10 };
    character.Task = { description: 'Executing a fraction...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'partial receipt' } };
    const state = stateFor(character);
    state.progression.experience = { currentSeconds: 1, maxSeconds: 1 };
    const rng = new RandomGenerator('legacy-level-up');
    rng.setState([...levelUpFixture.input.sheet.seed] as [number, number, number, number]);

    const result = advanceGame(state, 1, rng);

    expect(eventsOf(result).filter((event) => event.type === 'stat_gained')).toEqual([
      { type: 'stat_gained', stat: 'HP Max', amount: 6 },
      { type: 'stat_gained', stat: 'MP Max', amount: 5 },
      { type: 'stat_gained', stat: 'INT', amount: 1 },
      { type: 'stat_gained', stat: 'HP Max', amount: 0.5 },
    ]);
  });

  it('matches the legacy quest-completion reward and event order', () => {
    const sheet = questFixture.input.sheet;
    const character: CharacterSheet = {
      Traits: structuredClone(sheet.Traits),
      Stats: structuredClone(sheet.Stats),
      Equip: structuredClone(sheet.Equips),
      Inventory: [],
      Spells: [],
      Gold: 0,
      Plot: { act: sheet.act, currentProgress: sheet.PlotBar.position, maxProgress: sheet.PlotBar.max },
      Quest: { description: sheet.bestquest, currentProgress: sheet.QuestBar.position, maxProgress: sheet.QuestBar.max, history: [...sheet.Quests] },
      Task: { description: sheet.kill, durationMs: sheet.TaskBar.max, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } },
    };
    const state = {
      character,
      progression: {
        experience: { currentSeconds: sheet.ExpBar.position, maxSeconds: sheet.ExpBar.max },
        completedTasks: sheet.tasks,
        elapsedSeconds: sheet.elapsed,
      },
    };
    const rng = new RandomGenerator('legacy-quest');
    rng.setState([...sheet.seed] as [number, number, number, number]);

    const result = advanceGame(state, sheet.TaskBar.max, rng);

    expect(result.state.character.Quest).toEqual({
      description: 'Exterminate the Swamp Tickets',
      currentProgress: 0,
      maxProgress: 138,
      history: ['Test quest', 'Exterminate the Swamp Tickets'],
      kind: 'exterminate',
      target: 'Swamp Ticket|1|lilypad',
      targetIndex: 84,
    });
    expect(result.state.character.Spells).toEqual([{ name: 'Quick Win', level: 1 }]);
    expect(eventsOf(result)).toEqual([
      { type: 'quest_completed', description: 'Test quest' },
      { type: 'quest_started', description: 'Exterminate the Swamp Tickets' },
      { type: 'save_requested', characterName: 'Oracle' },
      { type: 'item_gained', name: 'nit tail', quantity: 1 },
      { type: 'task_started', task: result.state.character.Task },
    ]);
    expect(rng.getState()).toEqual(questFixture.expected.rng);
  });

  it('sells one ordinary stack at level value before scheduling the next stack', () => {
    const character = createNewCharacter('Merchant', 'Half Daemon', 'Robot Monk', 802);
    character.Traits.Level = 5;
    character.Gold = 10;
    character.Inventory = [{ name: 'nit tail', qty: 3 }, { name: 'old boot', qty: 2 }];
    character.Task = { description: 'Selling 3 nit tails...', durationMs: 1000, elapsedMs: 0, type: 'selling' };
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 10 };
    character.PendingTasks = undefined;
    const state = {
      character,
      progression: { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 },
    };

    const rng = new RandomGenerator('sale-transition');
    const initialRng = rng.getState();
    const result = advanceGame(state, 1000, rng);

    expect(result.state.character.Gold).toBe(25);
    expect(result.state.character.Inventory).toEqual([{ name: 'old boot', qty: 2 }]);
    expect(result.state.character.Task).toMatchObject({ description: 'Selling 2 old boots...', durationMs: 1000, type: 'selling' });
    expect(eventsOf(result)).toEqual([
      { type: 'inventory_sold', gold: 15 },
      { type: 'task_started', task: result.state.character.Task },
    ]);
    expect(rng.getState()).toEqual(initialRng);
  });

  it('exposes an actual quest equipment mutation as a typed gained-equipment event', () => {
    let matched: ReturnType<typeof advanceGame> | undefined;
    for (let seed = 0; seed < 100 && !matched; seed += 1) {
      const character = createNewCharacter('Quartermaster', 'Half Daemon', 'Robot Monk', `quest-equipment:${seed}`);
      character.Quest = { description: 'Complete opaque work', currentProgress: 1, maxProgress: 1, history: ['Complete opaque work'], kind: 'fetch' };
      character.Task = { description: 'Executing fixed paperwork...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
      const result = advanceGame(stateFor(character), 1, new RandomGenerator(`quest-equipment-transition:${seed}`));
      if (eventsOf(result).some(({ type }) => type === 'equipment_gained')) matched = result;
    }

    const event = matched?.records.find(({ event }) => event.type === 'equipment_gained')?.event;
    expect(event).toMatchObject({ type: 'equipment_gained' });
    if (!event || event.type !== 'equipment_gained' || !matched) throw new Error('Expected a quest equipment reward');
    expect(matched.state.character.Equip[event.slot]).toBe(event.name);
  });

  it('marks only actual nemesis interplot openings with transient presentation metadata', () => {
    const observed = new Set<'nemesis' | 'other'>();
    for (let seed = 0; seed < 100 && observed.size < 2; seed += 1) {
      const character = createNewCharacter('Cinematic Clerk', 'Half Daemon', 'Robot Monk', `cinematic-role:${seed}`);
      character.Plot = { act: 1, currentProgress: 10, maxProgress: 10 };
      character.PendingTasks = undefined;
      character.Task = { description: 'Executing fixed paperwork...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
      const result = advanceGame(stateFor(character), 1, new RandomGenerator(`cinematic-role-transition:${seed}`));
      const opening = result.records.find(({ event }) => event.type === 'task_started' && event.task.type === 'cinematic');
      if (!opening || opening.event.type !== 'task_started') continue;
      // Keyed on the nemesis opening's own wording. It said "quarry is in sight" until that line was
      // rewritten into the register the rest of the game speaks; the branch it identifies is
      // unchanged.
      const isNemesis = opening.event.task.description.includes('an escalation bars your path');
      expect(opening.post.interplotRole).toBe(isNemesis ? 'nemesis' : undefined);
      observed.add(isNemesis ? 'nemesis' : 'other');
    }

    expect(observed).toEqual(new Set(['nemesis', 'other']));
  });

  it('applies both canonical RandomLow multipliers to an of-item stack', () => {
    const character = createNewCharacter('Merchant', 'Half Daemon', 'Robot Monk', 802);
    character.Traits.Level = 5;
    character.Gold = 10;
    character.Inventory = [{ name: 'Directive of Foreseeable Risk', qty: 2 }, { name: 'old boot', qty: 2 }];
    character.Task = { description: 'Selling 2 Diadems of Foreseeable Risk...', durationMs: 1000, elapsedMs: 0, type: 'selling' };
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 10 };
    character.PendingTasks = undefined;
    const rng = new RandomGenerator('sale-transition');
    rng.setState([0.34067121776752174, 0.28646080009639263, 0.8245062702335417, 1]);

    const result = advanceGame(stateFor(character), 1000, rng);

    expect(result.state.character.Gold).toBe(70);
    expect(result.state.character.Inventory).toEqual([{ name: 'old boot', qty: 2 }]);
    expect(eventsOf(result)[0]).toEqual({ type: 'inventory_sold', gold: 60 });
    expect(rng.getState()).toEqual([0.581618724623695, 0.47070452058687806, 0.9086279335897416, 429329]);
  });

  it('starts the first one-second sale after reaching the market', () => {
    const character = createNewCharacter('Merchant', 'Half Daemon', 'Robot Monk', 802);
    character.Inventory = [{ name: 'nit tail', qty: 30 }, { name: 'old boot', qty: 2 }];
    character.Task = { description: 'Heading to market to sell loot...', durationMs: 4000, elapsedMs: 0, type: 'heading_to_market' };
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 10 };
    character.PendingTasks = undefined;
    const rng = new RandomGenerator('market-arrival');
    const initialRng = rng.getState();

    const result = advanceGame(stateFor(character), 4000, rng);

    expect(result.state.character.Inventory).toEqual(character.Inventory);
    expect(result.state.character.Task).toMatchObject({ description: 'Selling 30 nit tails...', durationMs: 1000, type: 'selling' });
    expect(eventsOf(result)).toEqual([{ type: 'task_started', task: result.state.character.Task }]);
    expect(rng.getState()).toEqual(initialRng);
  });

  it('heads to market for four seconds when completed-task loot reaches encumbrance', () => {
    const character = createNewCharacter('Merchant', 'Half Daemon', 'Robot Monk', 802);
    character.Stats.STR = 10;
    character.Inventory = [{ name: 'old boot', qty: 19 }];
    character.Quest = { description: 'Test quest', currentProgress: 0, maxProgress: 100, history: ['Test quest'] };
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 100 };
    character.Task = { description: 'Executing a Nit...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    character.PendingTasks = undefined;

    const result = advanceGame(stateFor(character), 1000, new RandomGenerator('market-threshold'));

    expect(result.state.character.Inventory).toEqual([{ name: 'old boot', qty: 19 }, { name: 'nit tail', qty: 1 }]);
    expect(result.state.character.Task).toMatchObject({ description: 'Heading to market to sell loot...', durationMs: 4000, type: 'heading_to_market' });
  });

  it('keeps an accepted maximum gold balance valid when selling inventory', () => {
    const character = createNewCharacter('Treasurer', 'Half Daemon', 'Robot Monk', 810);
    character.Traits.Level = MAX_PERSISTED_VALUE;
    character.Gold = MAX_PERSISTED_GOLD;
    character.Inventory = [{ name: 'Auditor bait of Excess', qty: MAX_PERSISTED_VALUE }];
    character.Task = { description: 'Selling loot...', durationMs: 1, elapsedMs: 0, type: 'selling' };
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 10 };
    character.PendingTasks = undefined;
    expect(characterSheetSchema.safeParse(character).success).toBe(true);

    const result = advanceGame(stateFor(character), 1, new RandomGenerator('maximum-sale'));

    // This asserted Gold stayed at MAX_PERSISTED_GOLD and the sale paid nothing. That was the old
    // contract and it is deliberately gone: the cap was an ending rather than a limit, and a player
    // who reached it went on selling loot forever while being told they earned zero each time.
    //
    // Gold now sheds a decade instead of saturating (ADR 0009), so the stored figure falls below
    // the cap while the balance has grown. Both halves are asserted, because either alone would
    // pass on a bug: a figure under the cap could mean gold was lost, and a decade could be shed
    // without the sale paying.
    expect(result.state.character.Gold).toBeLessThan(MAX_PERSISTED_GOLD);
    // Fourteen, not one: this sale is a billion items at once, so it sheds many decades in a
    // single step. Asserted as "some" rather than a pinned count, because the exact number is a
    // fact about the fixture's inventory rather than about the mechanic.
    expect(result.state.character.GoldDecades ?? 0).toBeGreaterThan(0);
    expect(eventsOf(result)[0]).toMatchObject({ type: 'inventory_sold' });
    const sold = eventsOf(result)[0] as { type: 'inventory_sold'; gold: number };
    expect(sold.gold, 'a sale past the cap must still pay').toBeGreaterThan(0);
    expect(characterSheetSchema.safeParse(result.state.character).success).toBe(true);
  });

  it('buys equipment before taking the four-second route out of town', () => {
    const character = createNewCharacter('Buyer', 'Half Daemon', 'Robot Monk', 803);
    character.Gold = 35;
    character.Inventory = [];
    character.Task = { description: 'Buying equipment...', durationMs: 1, elapsedMs: 0, type: 'buying' };

    const result = advanceGame(stateFor(character), 1, new RandomGenerator('purchase-transition'));

    expect(result.state.character.Gold).toBe(0);
    expect(result.state.character.Task).toMatchObject({
      description: 'Heading to the killing fields...',
      durationMs: 4000,
      type: 'heading',
    });
    expect(eventsOf(result)[0]).toMatchObject({ type: 'equipment_purchased' });
  });

  it('starts the first real quest without rewarding the placeholder', () => {
    const character = createNewCharacter('Initiate', 'Half Daemon', 'Robot Monk', 804);
    const initialSheet = structuredClone(character);
    character.Quest = { description: 'Heading to the killing fields...', currentProgress: 0, maxProgress: 5 };
    character.Task = { description: 'Executing test monster...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };

    const result = advanceGame(stateFor(character), 1, new RandomGenerator('first-quest'));

    expect(result.state.character.Quest.history).toEqual([result.state.character.Quest.description]);
    expect(eventsOf(result).some(({ type }) => type === 'quest_completed')).toBe(false);
    expect(result.state.character.Stats).toEqual(initialSheet.Stats);
    expect(result.state.character.Equip).toEqual(initialSheet.Equip);
    expect(result.state.character.Spells).toEqual(initialSheet.Spells);
    expect(result.state.character.Gold).toBe(initialSheet.Gold);
  });

  it('caps quest history at the legacy 100-entry boundary', () => {
    const character = createNewCharacter('Historian', 'Half Daemon', 'Robot Monk', 805);
    character.Quest = {
      description: 'Newest quest',
      currentProgress: 1,
      maxProgress: 1,
      history: Array.from({ length: 100 }, (_, index) => `Quest ${index}`),
    };
    character.Task = { description: 'Executing test monster...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };

    const result = advanceGame(stateFor(character), 1, new RandomGenerator('quest-history-cap'));
    const history = result.state.character.Quest.history ?? [];

    expect(history).toHaveLength(100);
    expect(history[0]).toBe('Quest 1');
    expect(history.at(-1)).toBe(result.state.character.Quest.description);
  });

  it('returns elapsed time left after the bounded 100-task catch-up', () => {
    const character = createNewCharacter('Latecomer', 'Half Daemon', 'Robot Monk', 806);
    const rng = new RandomGenerator('bounded-catch-up');

    const result = advanceGame(stateFor(character), 1_000_000_000, rng);

    expect(result.state.progression.completedTasks).toBe(100);
    expect(result.remainingElapsedMs).toBeGreaterThan(0);
    expect(result.state.character.Task.elapsedMs).toBe(0);
    const resumed = advanceGame(result.state, result.remainingElapsedMs, rng);
    expect(resumed.state.progression.completedTasks).toBe(200);
  });

  it('bounds next-task RNG work above the last finite progression level', () => {
    const expectedRandomCalls = 7_150;
    const generateAtMaximumLevel = () => {
      const character = createNewCharacter('Patient Hero', 'Half Daemon', 'Robot Monk', 812);
      character.Traits.Level = MAX_PERSISTED_VALUE;
      character.Inventory = [];
      character.Gold = 0;
      character.Task = { description: 'Finishing administrative warm-up...', durationMs: 1, elapsedMs: 0, type: 'heading' };
      const rng = new RandomGenerator('bounded-monster-work');
      const originalRandom = rng.random.bind(rng);
      let randomCalls = 0;
      vi.spyOn(rng, 'random').mockImplementation((limit) => {
        randomCalls += 1;
        if (randomCalls > expectedRandomCalls) throw new RangeError('Monster-task RNG budget exceeded');
        return originalRandom(limit);
      });

      const result = advanceGame(stateFor(character), 1, rng);

      return { result, rngState: rng.getState(), randomCalls };
    };

    const first = generateAtMaximumLevel();
    const replay = generateAtMaximumLevel();

    expect(first.randomCalls).toBe(expectedRandomCalls);
    expect(characterSheetSchema.safeParse(first.result.state.character).success).toBe(true);
    expect(replay).toEqual(first);
  });

  it('keeps an accepted lower-bound character valid through level-up', () => {
    const character = createNewCharacter('Boundary Hero', 'Half Daemon', 'Robot Monk', 807);
    character.Stats = { STR: 1, CON: 1, DEX: 1, INT: 1, WIS: 1, CHA: 1, 'HP Max': 0.5, 'MP Max': 1.5 };
    character.Task = { description: 'Executing boundary monster...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'boundary receipt' } };
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 10 };
    character.PendingTasks = undefined;
    const state = stateFor(character);
    state.progression.experience = { currentSeconds: 1, maxSeconds: 1 };
    expect(characterSheetSchema.safeParse(character).success).toBe(true);

    const result = advanceGame(state, 1, new RandomGenerator('boundary-level-up'));

    expect(result.state.character.Traits.Level).toBe(2);
    expect(characterSheetSchema.safeParse(result.state.character).success).toBe(true);
  });

  it('keeps an accepted maximum session valid through level-up and loot', () => {
    const character = createNewCharacter('Boundary Hero', 'Half Daemon', 'Robot Monk', 809);
    character.Traits.Level = MAX_PERSISTED_VALUE;
    character.Stats = {
      STR: MAX_PERSISTED_VALUE,
      CON: MAX_PERSISTED_VALUE,
      DEX: MAX_PERSISTED_VALUE,
      INT: MAX_PERSISTED_VALUE,
      WIS: MAX_PERSISTED_VALUE,
      CHA: MAX_PERSISTED_VALUE,
      'HP Max': MAX_PERSISTED_VALUE,
      'MP Max': MAX_PERSISTED_VALUE,
    };
    character.Inventory = [
      { name: 'nit tail', qty: MAX_PERSISTED_VALUE },
      { name: 'bureaucratic ballast', qty: MAX_PERSISTED_VALUE },
    ];
    character.Spells = Array.from({ length: MAX_PERSISTED_ITEMS }, () => ({ name: 'Already Accounted For', level: MAX_PERSISTED_VALUE }));
    character.Gold = MAX_PERSISTED_GOLD;
    character.Quest = {
      description: 'Remain numerically respectable',
      currentProgress: MAX_PERSISTED_VALUE,
      maxProgress: MAX_PERSISTED_VALUE,
      history: ['Remain numerically respectable'],
    };
    character.Plot = { act: MAX_PERSISTED_VALUE, currentProgress: MAX_PERSISTED_VALUE, maxProgress: MAX_PERSISTED_VALUE };
    character.PendingTasks = undefined;
    character.Task = { description: 'Executing a boundary condition...', durationMs: 1000, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    const state = {
      character,
      progression: {
        experience: { currentSeconds: 1, maxSeconds: 1 },
        completedTasks: MAX_PERSISTED_VALUE,
        elapsedSeconds: MAX_PERSISTED_VALUE,
      },
    };
    const rng = new RandomGenerator('maximum-transition');
    const checkpoint = () => ({
      schemaVersion: 1 as const,
      session: { ...state, rngState: rng.getState(), isPaused: false, log: [] },
    });
    expect(activeCheckpointV1Schema.safeParse(checkpoint()).success).toBe(true);

    const result = advanceGame(state, 1000, rng);

    const parsed = activeCheckpointV1Schema.safeParse({
      schemaVersion: 1,
      session: { ...result.state, rngState: rng.getState(), isPaused: false, log: [] },
    });
    expect(parsed.success, parsed.error?.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('\n')).toBe(true);
    expect(eventsOf(result).filter(({ type }) => type === 'level_gained' || type === 'stat_gained')).toEqual([]);
    expect(eventsOf(result).some((event) => event.type === 'item_gained' && event.name === 'nit tail')).toBe(false);

    const headroomState = structuredClone(state);
    headroomState.character.Traits.Level = MAX_PERSISTED_VALUE - 1;
    for (const stat of Object.keys(headroomState.character.Stats) as Array<keyof CharacterSheet['Stats']>) {
      headroomState.character.Stats[stat] = MAX_PERSISTED_VALUE / 2;
    }
    headroomState.character.Inventory = headroomState.character.Inventory.map((item) => ({ ...item, qty: MAX_PERSISTED_VALUE - 1 }));
    headroomState.progression.completedTasks = MAX_PERSISTED_VALUE - 1;
    headroomState.progression.elapsedSeconds = MAX_PERSISTED_VALUE - 1;
    const headroomRng = new RandomGenerator('maximum-transition');

    advanceGame(headroomState, 1000, headroomRng);

    expect(headroomRng.getState()).toEqual(rng.getState());
  });

  it('does not mutate the previous inventory when loot stacks', () => {
    const character = createNewCharacter('Collector', 'Half Daemon', 'Robot Monk', 808);
    character.Inventory = [{ name: 'nit tail', qty: 1 }, { name: 'Unrelated Trinket', qty: 1 }];
    character.Quest = { ...character.Quest, currentProgress: 0, maxProgress: 99, history: [character.Quest.description] };
    character.Task = { description: 'Executing test monster...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    const snapshot = structuredClone(character.Inventory);

    const result = advanceGame(stateFor(character), 1, new RandomGenerator('stacked-loot'));

    expect(character.Inventory).toEqual(snapshot);
    expect(result.state.character.Inventory).toEqual([{ name: 'nit tail', qty: 2 }, { name: 'Unrelated Trinket', qty: 1 }]);
  });

  it('keeps a full accepted inventory valid when new loot drops', () => {
    const character = createNewCharacter('Collector', 'Half Daemon', 'Robot Monk', 811);
    character.Inventory = Array.from({ length: MAX_PERSISTED_ITEMS }, (_, index) => ({ name: `Item ${index}`, qty: 1 }));
    character.Task = { description: 'Executing test monster...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'one item too many' } };
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 10 };
    character.PendingTasks = undefined;
    expect(characterSheetSchema.safeParse(character).success).toBe(true);

    const result = advanceGame(stateFor(character), 1, new RandomGenerator('full-inventory'));

    expect(result.state.character.Inventory).toHaveLength(MAX_PERSISTED_ITEMS);
    expect(characterSheetSchema.safeParse(result.state.character).success).toBe(true);
    expect(eventsOf(result).some(({ type }) => type === 'item_gained')).toBe(false);
  });
});
