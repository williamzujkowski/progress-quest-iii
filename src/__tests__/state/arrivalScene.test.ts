import { describe, expect, it } from 'vitest';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { projectSocialBatch, projectAmbient } from '../../state/socialProjection';
import { scheduleChatter, NEW_CADENCE, type ChatterCadence } from '../../state/chatterSchedule';
import { fileLoadout } from '../../engine/loadoutFiling';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * The first thing a new player sees, which used to be nothing.
 *
 * `LogFeed` opens on Chatter. A new character's first twenty-eight seconds are the prologue, whose
 * durations are fixed and sum to exactly that — and no prologue task is a market or kill boundary,
 * so `chooseCandidate` offered nothing for any of them. The silence was not the cadence gate
 * declining to speak; nothing was ever proposed to it. Measured at 28.0s on every seed, because a
 * fixed sequence cannot vary.
 *
 * One scene fixes it, on the first prologue step only. Five would be five scenes, and a guild that
 * narrates every beat of somebody's backstory is the caption track this channel was rebuilt to stop
 * being.
 */

const HEROES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fen'] as const;

const firstLine = (name: string) => {
  let state: GameTransitionState = {
    character: createNewCharacter(name, 'Half Daemon', 'Robot Monk', new RandomGenerator(name)),
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const rng = new RandomGenerator(`${name}:run`);
  let cadence: ChatterCadence = NEW_CADENCE;
  let elapsedMs = 0;

  // Driven at the real tick so the answer is in the units a player waits in.
  for (let tick = 0; tick < 4000; tick += 1) {
    const result = advanceGame(state, 50, rng);
    state = result.state;
    elapsedMs += 50;
    if (result.records.length === 0) continue;
    const sources = result.records.map((record, index) => ({ activityId: tick * 100 + index, record })) as IdentifiedGameTransitionRecord[];
    const tasks = sources.at(-1)!.record.post.completedTasks;
    const scheduled = scheduleChatter(
      projectSocialBatch(sources, state.character.Quest.history),
      cadence,
      tasks,
      () => projectAmbient(sources.at(-1)!.record.post.hero, tasks, { loadout: fileLoadout(state.character) }),
    );
    cadence = scheduled.cadence;
    if (scheduled.entries.length > 0) return { elapsedMs, kind: scheduled.entries[0]!.sceneKind, text: scheduled.entries[0]!.text };
  }
  return null;
};

const arrivalsFor = (name: string) => {
  let state: GameTransitionState = {
    character: createNewCharacter(name, 'Half Daemon', 'Robot Monk', new RandomGenerator(name)),
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const rng = new RandomGenerator(`${name}:scene`);
  const scenes = new Set<string>();
  const texts: string[] = [];

  for (let tick = 0; tick < 4000; tick += 1) {
    const result = advanceGame(state, 50, rng);
    state = result.state;
    if (result.records.length === 0) continue;
    const sources = result.records.map((record, index) => ({ activityId: tick * 100 + index, record })) as IdentifiedGameTransitionRecord[];
    for (const entry of projectSocialBatch(sources, state.character.Quest.history)) {
      if (entry.sceneKind !== 'arrival') continue;
      scenes.add(entry.sceneId);
      texts.push(entry.text);
    }
  }
  return { scenes, texts };
};

describe('the guild says something when the file is opened', () => {
  it('speaks inside the first few seconds rather than after the whole prologue', () => {
    for (const name of HEROES) {
      const first = firstLine(name);
      expect(first, `${name}: nothing was ever said`).not.toBeNull();
      // 28.0s before, uniformly, because the prologue is a fixed sequence. Bounded well under that
      // rather than pinned at the measured 2.0s, so a cadence change has room without this becoming
      // a re-record of an exact figure.
      expect(first!.elapsedMs, `${name}: first line at ${first!.elapsedMs}ms — ${first!.text}`).toBeLessThan(10_000);
      expect(first!.kind, `${name}: ${first!.text}`).toBe('arrival');
    }
  });

  it('happens once, not once per prologue beat', () => {
    // The prologue has five steps. Scening all of them would put three lines against each, which is
    // the caption track rather than a greeting.
    for (const name of HEROES) {
      expect(arrivalsFor(name).scenes.size, `${name}`).toBe(1);
    }
  });

  it('does not come back later in the run', () => {
    // A file is opened once. If this fired again it would be a different thing wearing the same
    // words, and the second one would arrive when nobody is new any more.
    const { texts } = arrivalsFor('Ada');
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.length).toBeLessThanOrEqual(3);
  });

  it('has more than one thing to say across heroes', () => {
    // Drawn per hero, so two players starting at the same moment do not read the same sentence. A
    // single-variant greeting is the shape of a hard-coded string rather than a channel.
    const openings = new Set(HEROES.map((name) => arrivalsFor(name).texts[0]));
    expect(openings.size, [...openings].join(' | ')).toBeGreaterThan(1);
  });

  it('is heard whole, not guaranteed-heard and then truncated', () => {
    /*
     * `arrival` is in `ALWAYS_HEARD`, so the cadence layer may never silence it — and `spokenLines`
     * has a matching exemption from the `SCENE_LENGTHS` truncation that it was not added to. The
     * greeting was therefore guaranteed to arrive and then cut, and three seeds in four lost the
     * third line: the punchline, and the first thing the hero ever says.
     *
     * Asserted as a count rather than on the text, because the point is that nothing downstream may
     * shorten this scene, whichever variant it draws.
     */
    for (const name of HEROES) {
      const { texts } = arrivalsFor(name);
      expect(texts.length, `${name}: ${texts.join(' | ')}`).toBe(3);
    }
  });

  it('gives every variant its own setup, since a player sees exactly one', () => {
    /*
     * Variant 4 opened "There will be consequences. The cupboard has been opened." while the cupboard
     * was introduced only in variant 1 — a referent three quarters of players never meet. A variant
     * is the whole of somebody's first impression, so it has to stand on its own.
     *
     * Checked within a scene and in order, not across the flattened set: variant 1's hero line says
     * "The cupboard" perfectly well, because that variant's own previous line put one there. The
     * rule is that a definite reference must follow its introduction inside the same airing, which
     * is the thing that was actually broken.
     */
    for (const name of HEROES) {
      const { texts } = arrivalsFor(name);
      texts.forEach((text, index) => {
        if (!/\bThe cupboard\b/.test(text)) return;
        const introduced = texts.slice(0, index).some((earlier) => /\bcupboard\b/i.test(earlier));
        expect(introduced, `${name}: "${text}" refers to a cupboard nothing before it mentioned`).toBe(true);
      });
    }
  });

  it('quotes no figures at second two', () => {
    // The hero has done nothing yet, so a number here would be one the player has had no chance to
    // see — and the arrival lines are also a newcomer's first read of what this panel is.
    for (const name of HEROES) {
      for (const text of arrivalsFor(name).texts) {
        expect(text, `${name}: ${text}`).not.toMatch(/\d/);
      }
    }
  });
});
