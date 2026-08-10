import { describe, expect, it } from 'vitest';
import { createNewCharacter, generateEquipUpgrade } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame, type GamePresentationSnapshot, type GameTransitionEvent } from '../../engine/transition';
import { activeCheckpointV1Schema } from '../../state/schemas';
import { encodePQWSave } from '../../state/saveManager';
import { projectWorld, type IdentifiedGameTransitionRecord, projectRoute } from '../../state/worldContext';
import { dungeonNamesAt, fieldNamesAt, raidNamesAt, substrateStage, townNamesAt } from '../../data/worldContext';
import { RAID_ACT_THRESHOLD } from '../../data/worldContext';

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 7 },
  act: 2,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 42,
  elapsedSeconds: 3671,
  activeQuest: { kind: 'exterminate', target: 'Nit|1|tail', targetIndex: 0 },
  ...overrides,
});

const source = (
  activityId: number,
  event: GameTransitionEvent,
  post = snapshot(),
): IdentifiedGameTransitionRecord => ({ activityId, record: { event, post } });

/**
 * The encoded save string, unwrapped.
 *
 * `encodePQWSave` validates against the schema the importer applies, so it can refuse — the export
 * path must never hand a player a file that cannot be imported. Every sheet here is legal, so a
 * refusal is a bug in the fixture and is raised as one.
 */
const encodedOf = (sheet: Parameters<typeof encodePQWSave>[0]): string => {
  const result = encodePQWSave(sheet);
  if (!result.ok) throw new Error(`expected a legal sheet to encode: ${result.error.message}`);
  return result.value;
};

describe('world context projection', () => {
  it('projects a deterministic departure and arrival when the hero gains a level', () => {
    const input = { kind: 'transition', source: source(40, { type: 'level_gained', level: 7 }) } as const;

    const first = projectWorld(input);
    const replay = projectWorld(input);

    expect(replay).toEqual(first);
    expect(first.context).toMatchObject({ venue: 'field', activity: 'advancement', level: 7, act: 2 });
    expect(first.notices.map(({ kind }) => kind)).toEqual(['departure', 'arrival']);
    expect(first.notices.every(({ sourceActivityId }) => sourceActivityId === 40)).toBe(true);
    expect(first.notices[0]?.text).not.toContain(first.context.location);
    expect(first.notices[1]?.text).toContain(first.context.location);
  });

  it('files the next hunting ground independently of an intervening boss cinematic', () => {
    const projection = projectWorld({
      kind: 'transition',
      source: source(47, { type: 'level_gained', level: 7 }, snapshot({ nextTask: 'cinematic', interplotRole: 'nemesis' })),
    });

    expect(projection.context.venue).toBe('dungeon');
    expect(projection.notices.find(({ kind }) => kind === 'arrival')?.text).toContain('// L7');
    expect(projection.notices.find(({ kind }) => kind === 'arrival')?.text).not.toContain(projection.context.location);
  });

  it('classifies market work from typed task facts instead of rendered descriptions', () => {
    const description = 'This wording is deliberately useless.';
    const road = projectWorld({
      kind: 'transition',
      source: source(41, { type: 'task_started', task: { description, durationMs: 1, elapsedMs: 0, type: 'heading_to_market' } }, snapshot({ nextTask: 'heading_to_market' })),
    });
    const sale = projectWorld({
      kind: 'transition',
      source: source(42, { type: 'task_started', task: { description, durationMs: 1, elapsedMs: 0, type: 'selling' } }, snapshot({ nextTask: 'selling' })),
    });

    expect(road.context).toMatchObject({ venue: 'road', activity: 'travel' });
    expect(sale.context).toMatchObject({ venue: 'town', activity: 'sell' });
    expect(road.context.location).not.toBe(sale.context.location);
  });

  it('announces market arrival and departure only at typed market boundaries', () => {
    const started = (activityId: number, completedTask: GamePresentationSnapshot['completedTask'], nextTask: 'selling' | 'heading') => projectWorld({
      kind: 'transition',
      source: source(activityId, {
        type: 'task_started',
        task: { description: 'Opaque transition', durationMs: 1, elapsedMs: 0, type: nextTask },
      }, snapshot({ completedTask, nextTask })),
    });

    expect(started(100, 'heading_to_market', 'selling').notices.map(({ kind }) => kind)).toEqual(['arrival']);
    expect(started(101, 'selling', 'selling').notices).toEqual([]);
    expect(started(102, 'selling', 'heading').notices.map(({ kind }) => kind)).toEqual(['departure']);
    expect(started(103, 'act_marker', 'heading').notices).toEqual([]);
    expect(started(104, 'heading', 'selling').notices).toEqual([]);
  });

  it('classifies typed quest scope without parsing the quest description', () => {
    const projection = projectWorld({
      kind: 'transition',
      source: source(
        43,
        { type: 'quest_started', description: 'Opaque assignment prose' },
        snapshot({ activeQuest: { kind: 'deliver' } }),
      ),
    });

    expect(projection.context.assignmentScope).toBe('travel');
    expect(projection.notices).toEqual([
      expect.objectContaining({ kind: 'assignment', sourceActivityId: 43 }),
    ]);
  });

  it('uses the completed quest identity instead of the replacement quest identity', () => {
    const projection = projectWorld({
      kind: 'transition',
      source: source(143, { type: 'quest_completed', description: 'Opaque completed quest' }, snapshot({
        completedQuest: { kind: 'deliver' },
        activeQuest: { kind: 'seek' },
      })),
    });

    expect(projection.context.assignmentScope).toBe('travel');
  });

  it('derives reachable filing rarity from generated quality composition while denying combat effects', () => {
    const labels = new Set<string>();
    for (let level = 1; level <= 60; level += 1) {
      for (let sample = 0; sample < 80; sample += 1) {
        const upgrade = generateEquipUpgrade(new RandomGenerator(`rarity:${level}:${sample}`), level);
        const projection = projectWorld({
          kind: 'transition',
          source: source(44, { type: 'equipment_gained', ...upgrade }, snapshot({ hero: { ...snapshot().hero, level } })),
        });
        if (projection.equipment) labels.add(projection.equipment.label);
        expect(projection.equipment?.quality).toBe(level);
        expect(projection.equipment?.combatContribution).toBe('none');
      }
    }

    expect(labels).toEqual(new Set(['questionable', 'serviceable', 'notable', 'legendary']));
  });

  it('frames only typed nemesis openings and escalates them to raids at Act 10', () => {
    const opening = (act: number, interplotRole?: 'nemesis') => projectWorld({
      kind: 'transition',
      source: source(48 + act, {
        type: 'task_started',
        task: { description: 'Opaque cinematic', durationMs: 1, elapsedMs: 0, type: 'cinematic' },
      }, snapshot({ act, nextTask: 'cinematic', ...(interplotRole ? { interplotRole } : {}) })),
    });

    expect(opening(9, 'nemesis').context.venue).toBe('dungeon');
    expect(opening(10, 'nemesis').context.venue).toBe('raid');
    expect(opening(10, 'nemesis').notices[0]?.text).toContain('Raid-class');
    expect(opening(10).context.venue).toBe('cinematic');
    expect(opening(10).notices).toEqual([]);
  });

  it('reports each typed market sale and the field return in sequence', () => {
    const transitions = [
      source(200, { type: 'task_started', task: { description: 'x', durationMs: 1, elapsedMs: 0, type: 'heading_to_market' } }, snapshot({ completedTask: 'act_marker', nextTask: 'heading_to_market' })),
      source(201, { type: 'task_started', task: { description: 'x', durationMs: 1, elapsedMs: 0, type: 'selling' } }, snapshot({ completedTask: 'heading_to_market', nextTask: 'selling' })),
      source(202, { type: 'inventory_sold', gold: 15 }, snapshot({ completedTask: 'selling', nextTask: 'selling', marketSale: { name: 'nit tail', quantity: 3, gold: 15 } })),
      source(203, { type: 'inventory_sold', gold: 10 }, snapshot({ completedTask: 'selling', nextTask: 'buying', marketSale: { name: 'old boot', quantity: 2, gold: 10 } })),
      source(204, { type: 'task_started', task: { description: 'x', durationMs: 1, elapsedMs: 0, type: 'buying' } }, snapshot({ completedTask: 'selling', nextTask: 'buying' })),
      source(205, { type: 'task_started', task: { description: 'x', durationMs: 1, elapsedMs: 0, type: 'heading' } }, snapshot({ completedTask: 'buying', nextTask: 'heading' })),
      source(206, { type: 'task_started', task: { description: 'x', durationMs: 1, elapsedMs: 0, type: 'kill' } }, snapshot({ completedTask: 'heading', nextTask: 'kill' })),
    ];
    const filings = transitions.flatMap((record) => projectWorld({ kind: 'transition', source: record }).notices);

    expect(filings.map(({ kind }) => kind)).toEqual(['departure', 'arrival', 'commerce', 'commerce', 'commerce', 'departure', 'arrival']);
    expect(filings[2]?.text).toContain('3× nit tail');
    expect(filings[3]?.text).toContain('2× old boot');
  });

  it('announces the canonical kill-to-market encumbrance boundary', () => {
    const character = createNewCharacter('Burdened Oracle', 'Half Daemon', 'Robot Monk', 'world-market-boundary');
    character.Plot = { act: 1, currentProgress: 0, maxProgress: 100 };
    character.PendingTasks = undefined;
    character.Inventory = [{ name: 'nit tail', qty: 100 }];
    character.Task = { description: 'Executing fixed paperwork...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    const result = advanceGame({ character, progression: { experience: { currentSeconds: 0, maxSeconds: 10 }, completedTasks: 0, elapsedSeconds: 0 } }, 1, new RandomGenerator('world-market-transition'));
    const record = result.records.find(({ event }) => event.type === 'task_started' && event.task.type === 'heading_to_market');
    expect(record).toBeDefined();
    if (!record) throw new Error('Expected canonical market departure');

    expect(projectWorld({ kind: 'transition', source: { activityId: 300, record } }).notices.map(({ kind }) => kind)).toEqual(['departure']);
  });

  it('keeps hostile sale names bounded and preserves exact quantity and gold metadata', () => {
    const hostileName = `${'x'.repeat(160)}\u202egold 999\u2066`;
    const projection = projectWorld({
      kind: 'transition',
      source: source(301, { type: 'inventory_sold', gold: 17 }, snapshot({
        marketSale: { name: hostileName, quantity: 3, gold: 17 },
      })),
    });
    const text = projection.notices[0]?.text ?? '';

    expect(text).toMatch(/^Sold 3× /);
    expect(text).toMatch(/ for 17 gold\.$/);
    expect(text).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/u);
    expect(Array.from(text).length).toBeLessThanOrEqual(180);
  });

  it('certifies only an explicit typed spell reward', () => {
    const projection = projectWorld({
      kind: 'transition',
      source: source(
        45,
        { type: 'quest_completed', description: 'Opaque completed quest' },
        snapshot({ spellRewards: [{ name: 'Quick Win', level: 2, source: 'quest' }] }),
      ),
    });

    expect(projection.context.activity).toBe('quest');
    expect(projection.notices).toEqual([
      expect.objectContaining({ kind: 'training', sourceActivityId: 45 }),
    ]);
    expect(projection.notices[0]?.text).toContain('quest reward');
    expect(projection.notices[0]?.text).toContain('no combat effect');
  });

  it('keeps finite names legible at absurd progression values', () => {
    const projection = projectWorld({
      kind: 'transition',
      source: source(
        46,
        { type: 'level_gained', level: 1_000_000_000 },
        snapshot({ hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 1_000_000_000 }, act: 1_000_000_000 }),
      ),
    });

    expect(projection.context.location).toMatch(/1\.00e9/);
    expect(projection.context.spokenLocation).toContain('1 billion');
    expect(projection.context.location.length).toBeLessThanOrEqual(80);
    expect(projection.notices.every(({ text }) => text.length <= 180)).toBe(true);
  });

  it('leaves canonical state, event order, save bytes, and gameplay RNG identical when enabled', () => {
    const run = (enabled: boolean) => {
      const character = createNewCharacter('Parity Oracle', 'Half Daemon', 'Robot Monk', 'world-parity-character');
      character.Plot = { act: 1, currentProgress: 1, maxProgress: 1 };
      character.Quest = { description: 'Typed assignment', currentProgress: 1, maxProgress: 1, history: ['Typed assignment'], kind: 'deliver' };
      character.Task = { description: 'Executing fixed paperwork...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
      character.PendingTasks = undefined;
      character.Inventory = [{ name: 'nit tail', qty: 50 }, { name: 'old boot', qty: 50 }];
      character.Gold = 1_000_000;
      const rng = new RandomGenerator('world-parity-transition');
      const result = advanceGame({
        character,
        progression: { experience: { currentSeconds: 1, maxSeconds: 1 }, completedTasks: 0, elapsedSeconds: 0 },
      }, 120_000, rng);
      const recordsBefore = JSON.stringify(result.records);
      if (enabled) result.records.forEach((record, activityId) => projectWorld({ kind: 'transition', source: { activityId, record } }));
      const checkpoint = activeCheckpointV1Schema.parse({
        schemaVersion: 1,
        session: {
          ...result.state,
          rngState: rng.getState(),
          pendingElapsedMs: result.remainingElapsedMs,
          isPaused: false,
          log: result.records.slice(-50).map(({ event }) => event.type),
        },
      });
      const checkpointBytes = JSON.stringify(checkpoint);
      const pqwBytes = encodedOf(result.state.character);
      return {
        state: result.state,
        records: result.records,
        recordsUnmutated: JSON.stringify(result.records) === recordsBefore,
        remainingElapsedMs: result.remainingElapsedMs,
        rng: rng.getState(),
        checkpointBytes,
        pqwBytes,
      };
    };

    const enabled = run(true);
    expect(enabled.recordsUnmutated).toBe(true);
    const eventTypes = new Set(enabled.records.map(({ event }) => event.type));
    for (const type of ['level_gained', 'quest_completed', 'act_completed', 'inventory_sold', 'equipment_purchased'] as const) {
      expect(eventTypes.has(type)).toBe(true);
    }
    expect(enabled).toEqual(run(false));
  });
});

describe('sited substrate', () => {
  const POOLS = [fieldNamesAt, townNamesAt, dungeonNamesAt, raidNamesAt];

  it('sites nothing before the first threshold', () => {
    // The world the hero started in has to be the world for a long time, or its arrival is not an
    // arrival. Acts 0 to 4 are roughly the first two days of credited time.
    for (const at of POOLS) {
      for (let act = 0; act < 5; act += 1) expect(at(act)).toEqual(at(0));
    }
    expect(substrateStage(4)).toBe(0);
  });

  it('sites more at each threshold and never fewer', () => {
    expect(substrateStage(5)).toBe(1);
    expect(substrateStage(11)).toBe(1);
    expect(substrateStage(12)).toBe(2);
    let previous = 0;
    for (let act = 0; act <= 40; act += 1) {
      const stage = substrateStage(act);
      expect(stage).toBeGreaterThanOrEqual(previous);
      previous = stage;
    }
    for (const at of POOLS) {
      expect(at(5).length).toBeGreaterThan(at(4).length);
      expect(at(12).length).toBeGreaterThan(at(5).length);
    }
  });

  it('adds alongside the original world rather than over it', () => {
    // The distinction the whole conceit rests on. If an original name ever stopped being
    // reachable, this would be a re-theme instead of an accretion.
    for (const at of POOLS) {
      for (const original of at(0)) {
        expect(at(5)).toContain(original);
        expect(at(40)).toContain(original);
      }
    }
  });

  it('keeps a saturating act inside the last pool', () => {
    for (const at of POOLS) {
      expect(at(Number.MAX_SAFE_INTEGER)).toEqual(at(12));
      // An act past every threshold belongs in the last pool. Reporting the base pool here would
      // describe the most advanced world imaginable as the one nothing has arrived in yet.
      expect(at(Number.POSITIVE_INFINITY)).toEqual(at(12));
    }
    // An unreadable act sites nothing, which is the safe direction to fail in.
    expect(substrateStage(Number.NaN)).toBe(0);
  });

  it('draws a projected location from the pool its act has unlocked, and stays deterministic', () => {
    const at = (act: number) => projectWorld({
      kind: 'transition',
      source: source(1, { type: 'level_gained', level: 7 }, snapshot({ act })),
    }).context;
    expect(at(1)).toEqual(at(1));

    // This asserted `at(30).location !== at(1).location` until the races were renamed. The picked
    // name is `choose(fieldNamesAt(act), '<name>:<race>:<class>:field:<level>')` — a hash of the
    // hero's race string — so whether two acts happen to land on different entries is a property
    // of that string, not of the substrate. One race name later, both acts hashed onto
    // 'Provisional Badlands' and a passing test started failing without any behaviour changing.
    //
    // The pool tests above already prove acts widen what the world can be called. What belongs
    // here is that the projection actually draws from the pool for its own act, which is the wiring
    // the sampled comparison was standing in for and could only ever check by luck.
    const entry = (act: number) => at(act).location.split(' // ')[0] ?? '';
    expect(fieldNamesAt(1)).toContain(entry(1));
    expect(fieldNamesAt(30)).toContain(entry(30));
    expect(fieldNamesAt(30).length).toBeGreaterThan(fieldNamesAt(1).length);
  });

  it.each([
    ['field', fieldNamesAt, 'kill'],
    ['town', townNamesAt, 'selling'],
  ] as const)('reaches %s names that only a late act unlocks', (label, pool, nextTask) => {
    // One venue per naming function. townName and milestoneName had no wiring assertion at all —
    // fieldName was the only one the sampled comparison ever touched, and it could not see the act
    // being ignored either.
    const lateOnly = pool(30).filter((name) => !pool(0).includes(name));
    expect(lateOnly.length, `act 30 unlocks no ${label} names of its own`).toBeGreaterThan(0);

    const drawn = new Set<string>();
    for (let index = 0; index < 60; index += 1) {
      const context = projectWorld({
        kind: 'transition',
        source: source(1, { type: 'level_gained', level: 7 }, snapshot({
          act: 30,
          nextTask,
          completedTask: nextTask,
          hero: { name: `Hero ${index}`, race: 'Sub-Subprocessor', className: 'Robot Monk', level: 7 },
        })),
      }).context;
      drawn.add(context.location.split(' // ')[0] ?? '');
    }

    expect(
      lateOnly.some((name) => drawn.has(name)),
      `sixty heroes at act 30 drew only ${[...drawn].join(', ')}, none unlocked by that act`,
    ).toBe(true);
  });

});

describe('the service record names no raid before there are raids', () => {
  /*
   * Every route stop was filled with a town, a dungeon and a raid. But `venueForTask` only resolves
   * 'raid' from `RAID_ACT_THRESHOLD` upward, so a raid named at act 2 is a place the game cannot
   * send anyone — the record was inventing a posting.
   *
   * Reproduced before the fix: `projectRoute(hero, 1)` returned
   * `{ act: 0, town: "New Requisition", dungeon: "The Unbudgeted Depths", raid: "Citadel of
   * Necessary Meetings" }`.
   *
   * The existing guard in `serviceRecord` tests the *hero's* act, so a hero past act 0 cleared it
   * and had raid-less stops rendered anyway. Whether a raid exists is a property of the stop.
   */
  const hero = { name: 'Routed', race: 'Half Daemon', className: 'Robot Monk', level: 40 } as const;

  it('leaves the raid unnamed below the threshold', () => {
    for (const stop of projectRoute(hero, RAID_ACT_THRESHOLD - 1, 20)) {
      expect(stop.raid, `act ${stop.act} named a raid`).toBeNull();
    }
  });

  it('names one at and above the threshold, so the fix is a boundary rather than a removal', () => {
    const stops = projectRoute(hero, RAID_ACT_THRESHOLD + 3, 20);
    const named = stops.filter((stop) => stop.raid !== null);
    expect(named.length, 'no raid named at any act').toBeGreaterThan(0);
    for (const stop of named) expect(stop.act).toBeGreaterThanOrEqual(RAID_ACT_THRESHOLD);
    // And the towns are untouched: they are named at every act reached, and the console names them
    // there too. The stop past the hero's act is excluded because it is deliberately unnamed — an
    // institution that has not decided where you are going yet is this game's register, and that
    // blank is a feature rather than the defect above.
    for (const stop of stops.filter(({ act }) => act <= RAID_ACT_THRESHOLD + 3)) {
      expect(stop.town, `act ${stop.act}`).not.toBeNull();
    }
  });
});
