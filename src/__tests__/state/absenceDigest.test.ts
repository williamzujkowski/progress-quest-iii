import { describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { levelUpTime } from '../../engine/math';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { EMPTY_DIGEST, accumulateDigest, describeDigest, isEmptyDigest } from '../../state/absenceDigest';
import { useGameStore } from '../../state/gameStore';

describe('absence digest', () => {
  it('says nothing when the absence produced nothing', () => {
    // A short absence, or one spent entirely inside a single long task, is a real outcome. A row
    // of zeroes would make an uneventful absence look like a broken one.
    expect(isEmptyDigest(EMPTY_DIGEST)).toBe(true);
    expect(describeDigest(EMPTY_DIGEST)).toBeNull();
  });

  it('counts only what it claims to count', () => {
    const digest = accumulateDigest(EMPTY_DIGEST, [
      { type: 'level_gained', level: 2 },
      { type: 'quest_completed', description: 'a matter' },
      { type: 'gold_received', amount: 40 },
      { type: 'gold_received', amount: 2 },
      { type: 'act_completed', act: 1 },
      { type: 'stat_gained', stat: 'HP Max', amount: 3 },
    ] as never);
    expect(digest).toEqual({ levels: 1, quests: 1, acts: 1, gold: 42 });
  });

  it('names only the things that happened', () => {
    const line = describeDigest({ levels: 2, quests: 0, acts: 0, gold: 300 })!;
    expect(line).toContain('2 levels');
    expect(line).toContain('300 gold');
    expect(line).not.toContain('quest');
    expect(line).not.toContain('act');
    // Singular where singular is meant.
    expect(describeDigest({ levels: 1, quests: 1, acts: 1, gold: 0 })!).toContain('1 level, 1 quest, 1 act');
  });

  it('claims no mechanic the engine does not model', () => {
    const line = describeDigest({ levels: 9, quests: 9, acts: 9, gold: 9 })!;
    expect(line).not.toMatch(/damage|stronger|power|bonus|faster than/i);
  });
});

describe('the digest against a real drain', () => {
  const originalState = useGameStore.getState();

  it('reports once when the backlog finishes, and never during ordinary play', () => {
    useGameStore.setState(originalState, true);
    useGameStore.getState().startSession({
      source: 'creation', name: 'Returner', race: 'Half Daemon', klass: 'Incident Paladin', seed: 5150,
    });

    // Ordinary play: every tick spends its own 50ms, so nothing is ever banked.
    for (let step = 0; step < 200; step += 1) useGameStore.getState().tick(50);
    expect(useGameStore.getState().log.some(({ message }) => message.startsWith('Backlog processed'))).toBe(false);

    // A closed session credits a lump of time, which takes many ticks to work through.
    useGameStore.getState().tick(45 * 60 * 1000);
    expect(useGameStore.getState().pendingElapsedMs).toBeGreaterThan(0);
    for (let guard = 0; guard < 20_000 && useGameStore.getState().pendingElapsedMs > 0; guard += 1) {
      useGameStore.getState().tick(50);
    }

    const digests = useGameStore.getState().log.filter(({ message }) => message.startsWith('Backlog processed'));
    expect(digests).toHaveLength(1);
    // The closing clause now varies with magnitude, so this matches the figure-bearing half and the
    // presence of a closing rather than one fixed sentence. `digestClosing` has its own cases.
    expect(digests[0]!.message).toMatch(/The absence produced .+\. [A-Z].+\.$/);

    // And the counting stops: further ordinary play adds no second digest.
    for (let step = 0; step < 200; step += 1) useGameStore.getState().tick(50);
    expect(useGameStore.getState().log.filter(({ message }) => message.startsWith('Backlog processed'))).toHaveLength(1);
    useGameStore.setState(originalState, true);
  });

  it('reports totals that match the drained batch', () => {
    // Counted from the raw events rather than through accumulateDigest, which is what makes this a
    // parity check at all. The previous version built `expected` with accumulateDigest and then
    // asserted describeDigest echoed the number accumulateDigest had produced — the digest agreeing
    // with itself, which is exactly what the comment here claimed it was avoiding. Changing
    // `levels + 1` to `levels + 2` survived it.
    const rng = new RandomGenerator('digest-parity');
    let state = {
      character: createNewCharacter('Parity', 'Half Daemon', 'Incident Paladin', rng),
      progression: { experience: { currentSeconds: 0, maxSeconds: levelUpTime(1) }, completedTasks: 0, elapsedSeconds: 0 },
    };
    let expected = EMPTY_DIGEST;
    let observedLevelEvents = 0;
    for (let step = 0; step < 45 * 60 * 20; step += 1) {
      const result = advanceGame(state, 50, rng);
      state = result.state;
      const events = result.records.map(({ event }) => event);
      observedLevelEvents += events.filter((event) => event.type === 'level_gained').length;
      expected = accumulateDigest(expected, events);
    }
    expect(expected.levels).toBeGreaterThan(0);
    // The independent count: one per level_gained event the engine emitted, tallied here rather
    // than by the function under test.
    expect(expected.levels).toBe(observedLevelEvents);
    expect(describeDigest(expected)).toContain(`${observedLevelEvents} level`);
  });
});

describe('a digest belongs to one absence', () => {
  const originalState = useGameStore.getState();

  /** Runs one character's credited absence to completion and returns the line it filed. */
  const digestFor = (name: string, seed: number, precededByAbandonedDrain: boolean) => {
    useGameStore.setState(originalState, true);

    if (precededByAbandonedDrain) {
      useGameStore.getState().startSession({
        source: 'creation', name: 'Abandoned', race: 'Half Daemon', klass: 'Incident Paladin', seed: 999,
      });
      useGameStore.getState().tick(6 * 60 * 60 * 1000);
      // A handful of ticks only, so the backlog is still deep when the character is replaced.
      for (let step = 0; step < 5; step += 1) useGameStore.getState().tick(50);
      expect(useGameStore.getState().pendingElapsedMs).toBeGreaterThan(0);
    }

    useGameStore.getState().startSession({
      source: 'creation', name, race: 'Half Daemon', klass: 'Incident Paladin', seed,
    });
    useGameStore.getState().tick(20 * 60 * 1000);
    for (let guard = 0; guard < 20_000 && useGameStore.getState().pendingElapsedMs > 0; guard += 1) {
      useGameStore.getState().tick(50);
    }

    const digests = useGameStore.getState().log.filter(({ message }) => message.startsWith('Backlog processed'));
    expect(digests).toHaveLength(1);
    return digests[0]!.message;
  };

  it('does not carry an abandoned drain into the next character', () => {
    // The accumulator is module-level. Without a reset when the session changes, an interrupted
    // drain survives whoever interrupted it and reports their work as the next character's.
    // The same character with the same seed must file the same line either way.
    const alone = digestFor('Beta', 222, false);
    const afterAbandonment = digestFor('Beta', 222, true);

    expect(afterAbandonment).toBe(alone);
    useGameStore.setState(originalState, true);
  });
});

describe('the digest counts the gold a player actually earns', () => {
  /*
   * It folded only `gold_received`, which needs `generateItemReward` to return 'Gold' — and that
   * needs more than 250 distinct names in the bag. Every gold a hero earns in ordinary play arrives
   * as `inventory_sold` instead.
   *
   * Measured over twelve simulated hours to level 23: `gold_received` fired zero times while sales
   * brought in 805,161 gold. So the return-from-away summary said "none of it witnessed" after an
   * absence that earned six figures, on the one screen whose whole job is saying what was missed.
   *
   * Driven through the real engine rather than hand-built events, because a hand-built fixture is
   * what let this through: the original suite never exercised `inventory_sold` at all.
   */
  const playedAway = (seed: string, seconds: number) => {
    let state: GameTransitionState = {
      character: createNewCharacter('Away', 'Half Daemon', 'Robot Monk', new RandomGenerator(seed)),
      progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
    };
    const rng = new RandomGenerator(`${seed}:away`);
    let digest = EMPTY_DIGEST;
    let sold = 0;
    for (let second = 0; second < seconds; second += 1) {
      const result = advanceGame(state, 1000, rng);
      state = result.state;
      const events = result.records.map(({ event }) => event);
      digest = accumulateDigest(digest, events);
      for (const event of events) if (event.type === 'inventory_sold') sold += event.gold;
    }
    return { digest, sold };
  };

  it('reports the gold that sales brought in', () => {
    const { digest, sold } = playedAway('away-a', 3600);
    expect(sold, 'the run earned nothing to report').toBeGreaterThan(0);
    expect(digest.gold).toBe(sold);
  });

  it('does not call an hour of earnings an empty absence', () => {
    // `isEmptyDigest` gates whether the summary is shown at all, so a digest that misses the only
    // income a hero has can suppress the notice entirely on a quiet-but-profitable absence.
    for (const seed of ['away-a', 'away-b']) {
      const { digest } = playedAway(seed, 3600);
      expect(isEmptyDigest(digest), `${seed}: ${JSON.stringify(digest)}`).toBe(false);
      expect(digest.gold, `${seed}`).toBeGreaterThan(0);
    }
  });
});
