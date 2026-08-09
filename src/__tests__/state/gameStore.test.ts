import { beforeEach, describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { levelUpTime } from '../../engine/math';
import { createNewCharacter } from '../../engine/sim';
import type { StatsMap } from '../../engine/types';
import { createActivityEntries, useGameStore } from '../../state/gameStore';
import { MAX_SOCIAL_ENTRIES, MAX_WORLD_NOTICES } from '../../data/limits';
import { PRIME_STATS } from '../../data/traits';

function fixedKillCharacter() {
  const character = structuredClone(useGameStore.getState().character);
  character.Inventory = [];
  character.Quest = { ...character.Quest, currentProgress: 0, maxProgress: 99, history: [character.Quest.description] };
  character.Task = {
    description: 'Executing test monster...',
    durationMs: 1,
    elapsedMs: 0,
    type: 'kill',
    loot: { type: 'fixed', item: 'nit tail' },
  };
  return character;
}

describe('Game Store State Machine', () => {
  beforeEach(() => {
    useGameStore.getState().startSession({ source: 'creation', name: 'TestHero', race: 'Double Tenant', klass: 'Incident Paladin', seed: 'test-session' });
  });

  it('initializes character with level 1 and valid stats', () => {
    const { character } = useGameStore.getState();
    expect(character.Traits.Name).toBe('TestHero');
    expect(character.Traits.Level).toBe(1);
    expect(character.Traits.Race).toBe('Double Tenant');
    expect(character.Traits.Class).toBe('Incident Paladin');
    expect(character.Task).toBeDefined();
    // "valid stats" was asserted via toBeDefined() on Task, a field the constructor always sets, so
    // zeroing every stat survived it. These are the bounds a 3d6 roll cannot leave.
    for (const stat of PRIME_STATS) {
      const value = character.Stats[stat];
      expect(Number.isInteger(value), `${stat} is ${value}`).toBe(true);
      expect(value, `${stat} is ${value}`).toBeGreaterThanOrEqual(3);
      expect(value, `${stat} is ${value}`).toBeLessThanOrEqual(18);
    }
  });

  it('does not advance tick when paused', () => {
    const store = useGameStore.getState();
    store.togglePause();
    const initialElapsed = store.character.Task.elapsedMs;
    const initialSocialEntries = store.socialEntries;

    store.tick(500);

    const updatedChar = useGameStore.getState().character;
    expect(updatedChar.Task.elapsedMs).toBe(initialElapsed);
    expect(useGameStore.getState().socialEntries).toBe(initialSocialEntries);
  });

  it('installs one transition atomically and presents events newest first', () => {
    const character = fixedKillCharacter();
    useGameStore.setState({ character, log: [], rng: new RandomGenerator('atomic-transition') });
    let notifications = 0;
    const unsubscribe = useGameStore.subscribe(() => { notifications += 1; });

    useGameStore.getState().tick(1);
    unsubscribe();

    const updated = useGameStore.getState();
    expect(notifications).toBe(1);
    expect(updated.character.Inventory).toEqual([{ name: 'nit tail', qty: 1 }]);
    expect(updated.log[0]?.message).toBe(updated.character.Task.description);
    expect(updated.log[1]?.message).toBe('Gained a nit tail');
    expect(new Set(updated.log.map(({ id }) => id)).size).toBe(updated.log.length);
  });

  it('preserves retained activity identities when the 50-entry cap shifts', () => {
    const character = fixedKillCharacter();
    const existing = createActivityEntries(
      Array.from({ length: 50 }, (_, index) => `Existing ${index + 1}`),
      0,
    ).reverse();
    const retained = existing[25];
    useGameStore.setState({ character, log: existing, nextActivityId: 50, rng: new RandomGenerator('stable-activity') });

    useGameStore.getState().tick(1);

    const updated = useGameStore.getState();
    expect(updated.log).toHaveLength(50);
    expect(updated.log.slice(0, 2).map(({ id }) => id)).toEqual([51, 50]);
    expect(updated.log.find(({ id }) => id === retained?.id)).toBe(retained);
    expect(updated.log.some(({ id }) => id === existing.at(-1)?.id)).toBe(false);
    expect(new Set(updated.log.map(({ id }) => id)).size).toBe(50);
  });

  it('retains bounded world notices separately from authoritative activity', () => {
    const character = fixedKillCharacter();
    const progression = {
      experience: { currentSeconds: 1, maxSeconds: 1 },
      completedTasks: 0,
      elapsedSeconds: 0,
    };
    useGameStore.setState({
      character,
      progression,
      log: [],
      worldNotices: [],
      nextActivityId: 0,
      rng: new RandomGenerator('world-notice-transition'),
    });

    useGameStore.getState().tick(1);

    const updated = useGameStore.getState();
    const levelActivity = updated.log.find(({ message }) => message === 'Gained a Level');
    expect(levelActivity).toBeDefined();
    expect(updated.worldNotices.map(({ kind }) => kind)).toEqual(['training', 'arrival', 'departure']);
    expect(updated.worldNotices.every(({ sourceActivityId }) => sourceActivityId === levelActivity?.id)).toBe(true);
    expect(updated.worldNotices).toHaveLength(Math.min(3, MAX_WORLD_NOTICES));
    // Scene length is drawn now, so the assertion is that the scene arrived whole rather than that
    // it was three lines. Retention still works on whole scenes, which is what this covers.
    expect(updated.socialEntries.length).toBeGreaterThanOrEqual(1);
    expect(updated.socialEntries.length).toBeLessThanOrEqual(3);
    expect(updated.socialEntries.every(({ sceneKind }) => sceneKind === 'level')).toBe(true);
  });

  it("keeps each feed's identity on a tick that adds nothing to it", () => {
    // Zustand compares by reference, so a fresh array holding the same contents is a re-render.
    // These three spreads used to run unconditionally: measured over 2 000 real ticks, identity
    // changed 2 000 times while the activity log's head changed 32 and the chatter feed's 7. That
    // woke both feeds twenty times a second to rebuild about 138 keyed rows, including the tab that
    // is hidden, and `LogFeed` re-derives the world projection in its render body — 33 item
    // analyses. The tick handler went from 25.6 µs to 6.8 µs when this stopped.
    //
    // Asserted as "identity moves only when contents move", which is the property rather than the
    // count: a version that cached too eagerly and stopped updating a feed at all fails the second
    // half, and the version this replaced fails the first.
    useGameStore.getState().startSession({
      source: 'creation', name: 'Churn', race: 'Double Tenant', klass: 'Incident Paladin', seed: 'churn-seed',
    });
    for (let warm = 0; warm < 200; warm += 1) useGameStore.getState().tick(1000);

    let identityChanged = 0;
    let contentsChanged = 0;
    let previous = useGameStore.getState().socialEntries;
    for (let tick = 0; tick < 400; tick += 1) {
      useGameStore.getState().tick(50);
      const current = useGameStore.getState().socialEntries;
      if (current !== previous) identityChanged += 1;
      if (current[0]?.id !== previous[0]?.id || current.length !== previous.length) contentsChanged += 1;
      previous = current;
    }

    // The premise: a run in which the feed never moved would make the equality trivially true.
    expect(contentsChanged, 'the feed has to actually move during the run').toBeGreaterThan(0);
    expect(identityChanged, 'a new array must mean new contents').toBe(contentsChanged);
    expect(identityChanged, 'and it must not churn every tick').toBeLessThan(200);
  });

  it('retains newest-first social entries without cutting a scene at the cap', () => {
    const character = fixedKillCharacter();
    const existing = Array.from({ length: MAX_SOCIAL_ENTRIES / 3 }, (_, scene) => Array.from({ length: 3 }, (_, line) => ({
      id: `existing:${scene}:${line}`,
      sceneId: `existing:${scene}`,
      sceneKind: 'quest' as const,
      sourceActivityId: scene,
      channel: 'guild' as const,
      speaker: { id: 'fixture', kind: 'cast' as const, displayName: 'Fixture', role: 'Fixture', fictional: true as const, automaticHero: false },
      text: `Existing ${scene}:${line}`,
    })).toReversed()).flat();
    useGameStore.setState({
      character,
      progression: { experience: { currentSeconds: 1, maxSeconds: 1 }, completedTasks: 0, elapsedSeconds: 0 },
      log: [],
      worldNotices: [],
      socialEntries: existing,
      nextActivityId: 500,
      rng: new RandomGenerator('social-cap-transition'),
    });

    useGameStore.getState().tick(1);

    const retained = useGameStore.getState().socialEntries;
    expect(retained.length).toBeLessThanOrEqual(MAX_SOCIAL_ENTRIES);
    expect(retained[0]?.sceneKind).toBe('level');
    // Every retained scene must be whole, and "whole" is the count it was seeded with rather than a
    // range. The previous bounds were `>= 1` and `<= 3`: the first is structurally guaranteed, since
    // the sceneId came out of `retained` in the first place, and the second only pins how long a
    // scene is authored. A cap that cut a three-line scene down to two satisfied both — which is
    // precisely the half-cut this test is named for.
    // Seeded scenes are three lines each; anything the tick added is whole by construction, so its
    // own retained count is the reference.
    const seeded = new Map<string, number>();
    for (const entry of existing) seeded.set(entry.sceneId, (seeded.get(entry.sceneId) ?? 0) + 1);

    const scenes = new Set(retained.map(({ sceneId }) => sceneId));
    expect(scenes.size, 'the fixture must retain more than one scene, or wholeness is trivial').toBeGreaterThan(1);
    for (const sceneId of scenes) {
      const spoken = retained.filter((entry) => entry.sceneId === sceneId);
      const expected = seeded.get(sceneId);
      if (expected === undefined) continue;
      expect(spoken.length, `${sceneId} was cut`).toBe(expected);
    }
  });

  it('drains bounded catch-up remainder on a later scheduler tick', () => {
    useGameStore.getState().tick(1_000_000_000);
    expect(useGameStore.getState().progression.completedTasks).toBe(100);

    useGameStore.getState().tick(1);

    expect(useGameStore.getState().progression.completedTasks).toBe(200);
  });

  it('uses and defensively copies an accepted complete stat roll', () => {
    const acceptedStats: StatsMap = { STR: 18, CON: 17, DEX: 16, INT: 15, WIS: 14, CHA: 13, 'HP Max': 35, 'MP Max': 27 };

    useGameStore.getState().startSession({ source: 'creation', name: 'RolledHero', race: 'Double Tenant', klass: 'Incident Paladin', seed: 'accepted-roll', stats: acceptedStats });
    acceptedStats.STR = 1;

    expect(useGameStore.getState().character.Stats).toEqual({ STR: 18, CON: 17, DEX: 16, INT: 15, WIS: 14, CHA: 13, 'HP Max': 35, 'MP Max': 27 });
  });

  it('replays creation deterministically from the explicit session seed', () => {
    const request = { source: 'creation', name: 'ReplayHero', race: 'Off-Prem Elf', klass: 'Vermineer', seed: 'replay-seed' } as const;
    useGameStore.getState().startSession(request);
    const firstCharacter = structuredClone(useGameStore.getState().character);
    const firstRngState = useGameStore.getState().rng.getState();

    useGameStore.getState().startSession(request);

    expect(useGameStore.getState().character).toEqual(firstCharacter);
    expect(useGameStore.getState().rng.getState()).toEqual(firstRngState);
  });

  it('loads a character through a complete fresh game session', () => {
    const loaded = createNewCharacter('ImportedHero', 'Rounding Error', 'Incident Paladin', new RandomGenerator('saved-character'));
    const previousRng = useGameStore.getState().rng;
    const previousSessionGeneration = useGameStore.getState().sessionGeneration;
    useGameStore.getState().togglePause();

    useGameStore.getState().startSession({ source: 'import', character: loaded });

    const session = useGameStore.getState();
    expect(session.character).toEqual(loaded);
    expect(session.character).not.toBe(loaded);
    expect(session.rng).not.toBe(previousRng);
    expect(session.sessionGeneration).toBe(previousSessionGeneration + 1);
    expect(session.isPaused).toBe(false);
    expect(session.log.map(({ message }) => message)).toEqual(['Loaded character ImportedHero from save data.']);
    expect(session.socialEntries).toEqual([]);
    expect(session.progression).toEqual({
      experience: { currentSeconds: 0, maxSeconds: levelUpTime(loaded.Traits.Level) },
      completedTasks: 0,
      elapsedSeconds: 0,
    });

    loaded.Gold = 999;
    expect(session.character.Gold).not.toBe(999);
  });

  it('restores a validated complete session through one atomic store action', () => {
    const character = createNewCharacter('RestoredHero', 'Off-Prem Elf', 'Vermineer', 704);
    const rng = new RandomGenerator('restored-rng');
    rng.random(100);
    const rngState = rng.getState();
    const progression = { experience: { currentSeconds: 4, maxSeconds: 9 }, completedTasks: 3, elapsedSeconds: 12 };
    const previousSessionGeneration = useGameStore.getState().sessionGeneration;

    useGameStore.getState().restoreSession({ character, rngState, progression, pendingElapsedMs: 37, isPaused: true, log: ['Restored event'] });
    const restored = useGameStore.getState();

    expect(restored.character).toEqual(character);
    expect(restored.character).not.toBe(character);
    expect(restored.rng.getState()).toEqual(rngState);
    expect(restored.sessionGeneration).toBe(previousSessionGeneration + 1);
    expect(restored.progression).toEqual(progression);
    expect(restored.pendingElapsedMs).toBe(37);
    expect(restored.isPaused).toBe(true);
    expect(restored.log.map(({ message }) => message)).toEqual(['Restored event']);
    expect(restored.socialEntries).toEqual([]);
  });
});
