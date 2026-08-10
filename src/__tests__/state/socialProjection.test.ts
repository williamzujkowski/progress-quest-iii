import { describe, expect, it, vi } from 'vitest';
import { MAX_TEXT_CODE_POINTS } from '../../engine/text';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { advanceGame } from '../../engine/transition';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import { activeCheckpointV1Schema } from '../../state/schemas';
import { encodePQWSave } from '../../state/saveManager';
import { projectSocialBatch } from '../../state/socialProjection';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

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

const task = (type: 'heading' | 'selling' | 'kill' | 'cinematic') => ({
  type: 'task_started' as const,
  task: { description: 'Opaque canonical activity', durationMs: 1, elapsedMs: 0, type },
});

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

describe('project-owned simulated cast', () => {
  it('defines eight safe original personas in four interchangeable seats', () => {
    expect(SOCIAL_PERSONAS).toHaveLength(8);
    expect(new Set(SOCIAL_PERSONAS.map(({ id }) => id)).size).toBe(8);
    expect(new Set(SOCIAL_PERSONAS.map(({ seat }) => seat))).toEqual(new Set(['official', 'logistics', 'field', 'support']));
    for (const seat of ['official', 'logistics', 'field', 'support'] as const) {
      expect(SOCIAL_PERSONAS.filter((persona) => persona.seat === seat)).toHaveLength(2);
    }
    expect(SOCIAL_PERSONAS.every(({ voice }) => voice.register.length > 0 && voice.maxWords >= 12 && voice.maxWords <= 30)).toBe(true);
    // And the ceiling has to differentiate, or it is a field that describes nothing. All eight sat
    // at 30 against an observed maximum of 18 — a limit twelve words above anything that can reach
    // it cannot constrain a register.
    expect(new Set(SOCIAL_PERSONAS.map(({ voice }) => voice.maxWords)).size).toBeGreaterThan(2);
    // Shared within a seat, because a scene line names a seat and either of its personas may speak
    // it. A ceiling tighter on one than the other would fire only for the heroes who drew them.
    for (const seat of new Set(SOCIAL_PERSONAS.map(({ seat: value }) => value))) {
      const caps = new Set(SOCIAL_PERSONAS.filter((persona) => persona.seat === seat).map(({ voice }) => voice.maxWords));
      expect(caps.size, `${seat} personas must share one ceiling`).toBe(1);
    }
    expect(SOCIAL_PERSONAS.every(({ displayName }) => Array.from(displayName).length <= 48)).toBe(true);

    const serialized = JSON.stringify(SOCIAL_PERSONAS).toLowerCase();
    for (const forbidden of [
      'erenshor', 'simplayer', 'everquest', 'world of warcraft', 'ultima online',
      'kingdom of loathing', 'universal paperclips', 'zombo.com', 'douglas adams',
      'monty python', 'terry gilliam', 'mel brooks', 'http://', 'https://',
      // Half the cast is named like software, which is the joke and also the hazard: a handle that
      // evokes the era is fine, and one that names a real person borrows their identity for a bit.
      // Labs and model names are here on the separate ground that they date the writing.
      'turing', 'lovelace', 'mccarthy', 'minsky', 'weizenbaum', 'shannon', 'hopper',
      'hinton', 'lecun', 'bengio', 'sutskever', 'karpathy', 'goodfellow', 'schmidhuber',
      'openai', 'anthropic', 'deepmind', 'chatgpt', 'claude', 'gemini', 'copilot', 'llama',
    ]) expect(serialized).not.toContain(forbidden);
    expect(serialized).not.toMatch(/[<>\u202a-\u202e\u2066-\u2069]/u);
    expect(Array.from(serialized).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
    })).toBe(false);
  });
});

describe('deterministic social batch projection', () => {
  it('is byte-stable, does not mutate input, and uses no clock or random source', () => {
    const input = [source(40, { type: 'level_gained', level: 7 })];
    const before = JSON.stringify(input);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random forbidden'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock forbidden'); });

    const first = projectSocialBatch(input);
    const replay = projectSocialBatch(input);

    expect(JSON.stringify(replay)).toBe(JSON.stringify(first));
    expect(JSON.stringify(input)).toBe(before);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  it('coalesces one completed task into one scene using explicit event priority', () => {
    const post = snapshot({ completedTasks: 90 });
    const entries = projectSocialBatch([
      source(100, { type: 'equipment_gained', slot: 'Weapon', name: 'Thing' }, post),
      source(101, { type: 'quest_completed', description: 'Opaque' }, post),
      source(102, { type: 'level_gained', level: 7 }, post),
      source(103, task('kill'), post),
    ]);

    expect(new Set(entries.map(({ sceneId }) => sceneId)).size).toBe(1);
    expect(entries.every(({ sceneKind, sourceActivityId }) => sceneKind === 'level' && sourceActivityId === 102)).toBe(true);
    // Scene length is drawn rather than fixed at three, so this asserts the range the shape allows.
    // Pinning it to one number would only re-pin the liturgy this change exists to break.
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.length).toBeLessThanOrEqual(3);
  });

  it('selects a stable four-person cast from hero facts across reload-equivalent batches', () => {
    const makeBatch = (firstId: number, completedTasks: number) => [
      source(firstId, { type: 'level_gained', level: 7 }, snapshot({ completedTasks })),
      source(firstId + 1, { type: 'quest_started', description: 'Opaque' }, snapshot({ completedTasks: completedTasks + 1, activeQuest: { kind: 'deliver' } })),
      source(firstId + 2, { type: 'inventory_sold', gold: 11 }, snapshot({ completedTasks: completedTasks + 2, marketSale: { name: 'Hostile item', quantity: 2, gold: 11 } })),
      source(firstId + 3, task('heading'), snapshot({ completedTasks: completedTasks + 3, completedTask: 'selling', nextTask: 'heading' })),
    ];
    const castIds = (batch: readonly IdentifiedGameTransitionRecord[]) => new Set(
      projectSocialBatch(batch).filter(({ speaker }) => speaker.kind === 'cast').map(({ speaker }) => speaker.id),
    );

    expect(castIds(makeBatch(1, 10))).toEqual(castIds(makeBatch(100, 1000)));
    // Four distinct seats still get drawn across a batch; a single scene may now speak with fewer
    // voices than it writes, so the count is taken over the batch rather than over one scene.
    expect(castIds(makeBatch(1, 10)).size).toBeGreaterThanOrEqual(2);
  });

  it('consolidates past the cap and says truthfully how many', () => {
    const input = Array.from({ length: 12 }, (_unused, index) => source(
      200 + index,
      { type: 'quest_started', description: `Untrusted ${index}` },
      snapshot({ completedTasks: index, activeQuest: { kind: 'seek' } }),
    ));

    const entries = projectSocialBatch(input);
    const scenes = [...new Set(entries.map(({ sceneId }) => sceneId))];

    // Eight retained plus the row that explains the rest.
    expect(scenes).toHaveLength(9);
    expect(entries[0]).toMatchObject({ sceneKind: 'catch_up', channel: 'system' });
    // The figure is what this row exists for — it is the only place a returning watcher learns how
    // much they missed — so it is asserted separately from the wording around it.
    expect(entries[0]?.text).toContain('4 routine scenes');
    expect(entries[0]?.text).toMatch(/minuted rather than transcribed/);
    // And it speaks as the institution rather than as the transition layer, which is what it used
    // to do on the first line a returner reads.
    expect(entries[0]?.text).not.toMatch(/accelerated progress|social scene/);
    // How many lines each retained scene speaks is drawn. The invariant that matters is that every
    // one speaks at least once and never more than it wrote.
    for (const sceneId of scenes.slice(1)) {
      const spoken = entries.filter((entry) => entry.sceneId === sceneId);
      expect(spoken.length).toBeGreaterThanOrEqual(1);
      expect(spoken.length).toBeLessThanOrEqual(3);
    }
    // With every scene equally interesting the newest survive, so the batch still ends where it did.
    expect(entries.at(-1)?.sourceActivityId).toBe(211);
  });

  it('keeps the interesting scenes rather than whichever came last', () => {
    // The point of the change. A player tabbed out for ten minutes returns to one batch carrying
    // hundreds of scenes; taking the last few showed them whichever sales happened to fall at the
    // end, and consolidated the level-up away. `chooseCandidate` already ranks these — milestones at
    // 100 and 95, a level at 90, a sale at 60 — and nothing was using that ladder for this.
    const sale = (activityId: number) => source(
      activityId,
      { type: 'inventory_sold', gold: 12 },
      snapshot({ completedTasks: activityId, marketSale: { name: 'nit tail', quantity: 1, gold: 12 } }),
    );

    // One level early in the batch, then far more sales than the cap allows.
    const input = [
      source(300, { type: 'level_gained', level: 9 }, snapshot({ completedTasks: 0 })),
      ...Array.from({ length: 20 }, (_unused, index) => sale(301 + index)),
    ];

    const entries = projectSocialBatch(input);
    const kinds = new Set(entries.map(({ sceneKind }) => sceneKind));

    expect(kinds).toContain('level');
    expect(kinds).toContain('catch_up');
    // And it is still in the order it happened, not promoted to the top: a feed that reordered
    // itself by importance would stop being a transcript.
    const levelAt = entries.findIndex(({ sceneKind }) => sceneKind === 'level');
    const lastSaleAt = entries.map(({ sceneKind }) => sceneKind).lastIndexOf('market');
    expect(levelAt).toBeLessThan(lastSaleAt);
  });

  it('reports only typed level, quest scope, sale, equipment, location, and raid facts', () => {
    const hostile = '<b>Sir Untrusted</b>\u202e claimed 999 damage in Erenshor';
    const entries = projectSocialBatch([
      source(300, { type: 'level_gained', level: 1_000_000_000 }, snapshot({ completedTasks: 1, hero: { name: hostile, race: 'x', className: 'y', level: 1_000_000_000 } })),
      source(301, { type: 'quest_started', description: hostile }, snapshot({ completedTasks: 2, activeQuest: { kind: 'deliver', target: hostile } })),
      source(302, { type: 'inventory_sold', gold: 17 }, snapshot({ completedTasks: 3, marketSale: { name: hostile, quantity: 3, gold: 17 } })),
      source(303, { type: 'equipment_gained', slot: 'Weapon', name: hostile }, snapshot({ completedTasks: 4 })),
      source(304, task('cinematic'), snapshot({ completedTasks: 5, act: 10, nextTask: 'cinematic', interplotRole: 'nemesis' })),
    ]);
    const text = entries.map((entry) => entry.text).join(' ');

    expect(text).not.toContain(hostile);
    expect(text).not.toContain('Erenshor');
    expect(text).toContain('3');
    expect(text).toContain('17');
    expect(text).toContain('raid');
    expect(entries.every((entry) => Array.from(entry.text).length <= 180)).toBe(true);
    expect(entries.every(({ speaker }) => speaker.fictional)).toBe(true);
    expect(entries.filter(({ speaker }) => speaker.kind === 'hero').every(({ speaker }) => speaker.automaticHero)).toBe(true);
    expect(entries.filter(({ speaker }) => speaker.kind !== 'hero').every(({ speaker }) => !speaker.automaticHero)).toBe(true);
  });

  it('uses completed quest scope, source-neutral loot quantity, and the typed raid threshold', () => {
    const quest = projectSocialBatch([source(500, { type: 'quest_completed', description: 'Opaque' }, snapshot({
      completedQuest: { kind: 'deliver' },
      activeQuest: { kind: 'seek' },
    }))]);
    const loot = projectSocialBatch([source(501, { type: 'item_gained', name: '<b>Untrusted trophy</b>', quantity: 4 }, snapshot({ completedTasks: 43 }))]);
    const dungeon = projectSocialBatch([source(502, task('cinematic'), snapshot({ completedTasks: 44, act: 9, nextTask: 'cinematic', interplotRole: 'nemesis' }))]);
    const raid = projectSocialBatch([source(503, task('cinematic'), snapshot({ completedTasks: 45, act: 10, nextTask: 'cinematic', interplotRole: 'nemesis' }))]);

    expect(quest.map(({ text }) => text).join(' ')).toContain('travel');
    expect(quest.map(({ text }) => text).join(' ')).not.toContain('dungeon assignment');
    expect(loot.map(({ text }) => text).join(' ')).toContain('4');
    expect(loot.map(({ text }) => text).join(' ')).not.toContain('Untrusted trophy');
    expect(loot.every(({ sceneKind }) => sceneKind === 'loot')).toBe(true);
    expect(dungeon.map(({ text }) => text).join(' ')).toContain('dungeon');
    expect(dungeon.map(({ text }) => text).join(' ')).not.toContain('raid-class');
    expect(raid.map(({ text }) => text).join(' ')).toContain('raid-class');
  });

  it('distinguishes typed road departures from actual zone arrivals', () => {
    const departure = projectSocialBatch([source(504, task('heading'), snapshot({ completedTasks: 46, completedTask: 'selling', nextTask: 'heading' }))]);
    const arrival = projectSocialBatch([source(505, task('kill'), snapshot({ completedTasks: 47, completedTask: 'heading', nextTask: 'kill' }))]);
    const castText = (entries: readonly ReturnType<typeof projectSocialBatch>[number][]) => entries
      .filter(({ speaker }) => speaker.kind === 'cast')
      .map(({ text }) => text)
      .join(' ');

    expect(castText(departure)).not.toMatch(/\b(arrived|reached|located)\b/iu);
    expect(castText(departure)).toMatch(/\b(route|travel|road)\b/iu);
    expect(castText(arrival)).toMatch(/\b(arrived|reached|located)\b/iu);
  });

  it('keeps every reviewed variant plain, bounded, original, and mechanically conservative', () => {
    const variants = Array.from({ length: 40 }, (_, index) => [
      source(index * 10, { type: 'level_gained', level: index + 2 }, snapshot({ completedTasks: index * 10 })),
      source(index * 10 + 1, { type: 'quest_started', description: 'Opaque' }, snapshot({ completedTasks: index * 10 + 1, activeQuest: { kind: 'seek' } })),
      source(index * 10 + 2, { type: 'equipment_gained', slot: 'Weapon', name: 'Opaque' }, snapshot({ completedTasks: index * 10 + 2 })),
      source(index * 10 + 3, { type: 'inventory_sold', gold: 9 }, snapshot({ completedTasks: index * 10 + 3, marketSale: { name: 'Opaque', quantity: 2, gold: 9 } })),
      source(index * 10 + 4, { type: 'item_gained', name: 'Opaque', quantity: 2 }, snapshot({ completedTasks: index * 10 + 4 })),
      source(index * 10 + 5, task('cinematic'), snapshot({ completedTasks: index * 10 + 5, act: 10, nextTask: 'cinematic', interplotRole: 'nemesis' })),
    ].flatMap((record) => projectSocialBatch([record]))).flat();
    const text = variants.map((entry) => entry.text).join('\n').toLowerCase();

    for (const forbidden of [
      'erenshor', 'simplayer', 'everquest', 'world of warcraft', 'ultima online',
      'kingdom of loathing', 'universal paperclips', 'zombo.com', 'douglas adams',
      'monty python', 'terry gilliam', 'mel brooks', 'http://', 'https://',
    ]) expect(text).not.toContain(forbidden);
    expect(text).not.toMatch(/[<>\u202a-\u202e\u2066-\u2069]/u);
    expect(variants.every(({ text: utterance }) => Array.from(utterance).length <= 180)).toBe(true);
    expect(variants.every(({ text: utterance }) => !Array.from(utterance).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
    }))).toBe(true);
    expect(text).not.toMatch(/\b(dealt|damage|dps|healed|corpse|experience loss|player joined|server connected)\b/u);
    for (const entry of variants.filter(({ speaker }) => speaker.kind === 'cast')) {
      const persona = SOCIAL_PERSONAS.find(({ id }) => id === entry.speaker.id);
      expect(persona).toBeDefined();
      expect(entry.text.trim().split(/\s+/u).length).toBeLessThanOrEqual(persona?.voice.maxWords ?? 0);
    }
  });

  it('leaves authoritative state, records, saves, and gameplay RNG byte-identical', () => {
    const run = (enabled: boolean) => {
      const character = createNewCharacter('Social Parity Oracle', 'Half Daemon', 'Robot Monk', 'social-parity-character');
      character.Task = { description: 'Executing fixed paperwork...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
      character.Inventory = [{ name: 'nit tail', qty: 100 }];
      const rng = new RandomGenerator('social-parity-transition');
      const result = advanceGame({
        character,
        progression: { experience: { currentSeconds: 1, maxSeconds: 1 }, completedTasks: 0, elapsedSeconds: 0 },
      }, 120_000, rng);
      if (enabled) projectSocialBatch(result.records.map((record, activityId) => ({ activityId, record })));
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
      return {
        state: result.state,
        records: result.records,
        remainingElapsedMs: result.remainingElapsedMs,
        rng: rng.getState(),
        checkpoint: JSON.stringify(checkpoint),
        pqw: encodedOf(result.state.character),
      };
    };

    expect(run(true)).toEqual(run(false));
  });

  it('summarizes a real bounded engine catch-up burst', () => {
    const character = createNewCharacter('Catch-up Oracle', 'Half Daemon', 'Robot Monk', 'social-catch-up-character');
    character.Plot = { act: 1, currentProgress: 1, maxProgress: 1 };
    character.Quest = { description: 'Typed assignment', currentProgress: 1, maxProgress: 1, history: ['Typed assignment'], kind: 'deliver' };
    character.Task = { description: 'Executing fixed paperwork...', durationMs: 1, elapsedMs: 0, type: 'kill', loot: { type: 'fixed', item: 'nit tail' } };
    character.PendingTasks = undefined;
    character.Inventory = [{ name: 'nit tail', qty: 50 }, { name: 'old boot', qty: 50 }];
    character.Gold = 1_000_000;
    const result = advanceGame({
      character,
      progression: { experience: { currentSeconds: 1, maxSeconds: 1 }, completedTasks: 0, elapsedSeconds: 0 },
    }, 120_000, new RandomGenerator('social-catch-up-transition'));

    const entries = projectSocialBatch(result.records.map((record, activityId) => ({ activityId, record })));

    expect(result.records.length).toBeGreaterThan(10);
    expect(entries[0]?.sceneKind).toBe('catch_up');
    // One catch-up row plus the retained scenes, of drawn length. The row and the scene count are
    // the invariants; the line total is not one, and asserting it would re-pin the fixed shape.
    expect(new Set(entries.slice(1).map(({ sceneId }) => sceneId))).toHaveLength(8);
    // One row plus eight scenes of one to three lines each. The bound moved with the cap: a return
    // from ten minutes away is exactly when a player wants more than three scenes to scroll through,
    // and the feed drops whole scenes off its own end regardless.
    expect(entries.length).toBeGreaterThanOrEqual(9);
    expect(entries.length).toBeLessThanOrEqual(25);
  });

  it('returns nothing for routine records with no approved social scene', () => {
    expect(projectSocialBatch([
      source(400, { type: 'save_requested', characterName: 'Untrusted' }),
      source(401, { type: 'stat_gained', stat: 'STR', amount: 1 }, snapshot({ completedTasks: 43 })),
    ])).toEqual([]);
  });
});

describe('the market scene reports a sale accurately', () => {
  const sold = (quantity: number, gold: number) =>
    source(90, { type: 'inventory_sold', gold }, snapshot({ marketSale: { name: 'Trap Ticket Shag', quantity, gold } }));

  it('names the thing it sold, rather than counting anonymous units', () => {
    // `marketSale` carried the name all along and the scene threw it away, so the busiest line in
    // the game said "1 unit became 1 gold" — true, uninformative, and wasting the funniest string
    // available. A sale is the last time that item is ever mentioned.
    const one = projectSocialBatch([sold(1, 1)]).map(({ text }) => text).join(' | ');
    expect(one).toContain('Trap Ticket Shag became 1 gold');
    expect(one).not.toContain('unit');

    // A stack still says how many, because "became 12 gold" alone loses the size of the sale.
    const many = projectSocialBatch([sold(4, 12)]).map(({ text }) => text).join(' | ');
    expect(many).toContain('4 × Trap Ticket Shag became 12 gold');
  });

  it('bounds a name an imported save could make arbitrarily long', () => {
    // This text reaches the DOM and is spoken by the screen-reader path.
    const long = source(91, { type: 'inventory_sold', gold: 5 }, snapshot({
      marketSale: { name: 'X'.repeat(400), quantity: 1, gold: 5 },
    }));
    for (const { text } of projectSocialBatch([long])) {
      expect(Array.from(text).length).toBeLessThanOrEqual(MAX_TEXT_CODE_POINTS);
    }
  });

  it('says nothing at all about a sale of nothing', () => {
    // Every character starts with a `{ name: 'Gold', qty: 0 }` placeholder at the head of the
    // inventory and the selling task takes the head unconditionally, so the first market trip of
    // every character used to announce "0 units became 0 gold" to the guild.
    expect(projectSocialBatch([sold(0, 0)])).toEqual([]);

    // Only when it is genuinely empty. A free item is still a sale, and so is one that pays.
    expect(projectSocialBatch([sold(1, 0)]).length).toBeGreaterThan(0);
    expect(projectSocialBatch([sold(0, 5)]).length).toBeGreaterThan(0);
  });
});

describe('scenes are not all the same shape', () => {
  it('varies its length across a run, and leans short', () => {
    // Range assertions elsewhere permit a constant three, so they do not guard this at all — a
    // mutation restoring the fixed liturgy passed every one of them. The distribution is the change,
    // so the distribution is what gets asserted.
    const lengths = Array.from({ length: 400 }, (_, index) => {
      const entries = projectSocialBatch([
        source(600 + index, { type: 'item_gained', name: 'Thing', quantity: 1 }, snapshot({ completedTasks: 40 + index })),
      ]);
      return entries.length;
    });

    const counts = new Map<number, number>();
    for (const length of lengths) counts.set(length, (counts.get(length) ?? 0) + 1);

    // Every scene speaks, and none speaks more than it wrote.
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(3);
    // More than one shape occurs, which is the whole point.
    expect(counts.size).toBeGreaterThan(1);
    // And single lines are the most common, because most utterances in a channel are.
    const one = counts.get(1) ?? 0;
    expect(one).toBeGreaterThan(counts.get(2) ?? 0);
    expect(one).toBeGreaterThan(counts.get(3) ?? 0);
    expect(one / lengths.length).toBeGreaterThan(0.4);
  });

  it('keeps the line carrying the facts', () => {
    // The opening line interpolates the quantity; the lines after it are commentary. A shortened
    // scene that dropped the opening told the player nothing about what had happened.
    for (let index = 0; index < 60; index += 1) {
      const entries = projectSocialBatch([
        source(700 + index, { type: 'item_gained', name: 'Thing', quantity: 3 }, snapshot({ completedTasks: 90 + index })),
      ]);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0]?.text).toContain('3');
    }
  });
});

describe('the written scene banks', () => {
  /** Every line the event scenes can produce, gathered by projecting each kind many times. */
  const spokenTexts = (kind: 'loot' | 'market'): string[] => {
    const texts = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      const post = snapshot({ completedTasks: 40 + index, marketSale: { name: 'Thing', quantity: 2, gold: 5 } });
      const event = kind === 'loot'
        ? { type: 'item_gained' as const, name: 'Thing', quantity: 2 }
        : { type: 'inventory_sold' as const, gold: 5 };
      for (const entry of projectSocialBatch([source(900 + index, event, post)])) texts.add(entry.text);
    }
    return [...texts];
  };

  it('writes enough variants for the two kinds that dominate the feed', () => {
    // Loot and market are 90% of event traffic. With three market variants the same sentence
    // arrived twice inside one unscrolled panel; the pool is what fixes that, not suppression.
    expect(spokenTexts('market').length).toBeGreaterThanOrEqual(14);
    expect(spokenTexts('loot').length).toBeGreaterThanOrEqual(18);
  });

  it('does not lean on the construction that is already a fingerprint', () => {
    // "emotionally complete and legally decorative" is the best move in this project's kit, and at
    // its current density it is recognisable. New writing must not add to it.
    const paired = [...spokenTexts('loot'), ...spokenTexts('market')]
      .filter((text) => /\b\w+ly \w+ and \w+ly \w+/.test(text));
    expect(paired.length, `paired-modifier lines: ${paired.join(' | ')}`).toBeLessThanOrEqual(2);
  });

  it('carries lines that are not jokes', () => {
    // A channel where every utterance is a polished aphorism reads as generated however good each
    // aphorism is. The same argument the ambient bank already won.
    const short = [...spokenTexts('loot'), ...spokenTexts('market')]
      .filter((text) => text.split(/\s+/).length <= 2);
    expect(short.length).toBeGreaterThan(0);
  });
});

