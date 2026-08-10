import { describe, expect, it } from 'vitest';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { advanceGame, type GameTransitionState } from '../../engine/transition';
import { projectSocialBatch } from '../../state/socialProjection';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';
import { SPELLS } from '../../data/traits';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * Every cast line the game actually speaks, measured against its speaker's own cap.
 *
 * There was already a cap assertion. It ran over a hand-built list of variants, so it measured the
 * fixed frames and could not see a line whose length depends on interpolated content — and the
 * registrar's level-up line interpolates a spell name. Most spell names are two words, so the line
 * shipped at 22 against a cap of 21, on the *first* level-up, about twenty-six minutes into a new
 * character's life. Three breaches in a simulated hour, and nothing red.
 *
 * The failure class is the one worth naming: an assertion that checks the shape it was written for
 * rather than the shape that ships. A word cap is a property of rendered output, so it has to be
 * measured on rendered output.
 *
 * The hand-built list still earns its place — it reaches variants play would take a very long time
 * to produce — but it cannot be the only check.
 */

const PLAY_SEEDS = ['cap-a', 'cap-b', 'cap-c'] as const;

/** Long enough to pass several level-ups, which is where the breach lived. */
const TICKS = 4000;

const spokenLines = (seed: string) => {
  let state: GameTransitionState = {
    character: createNewCharacter('Spoken', 'Half Daemon', 'Robot Monk', new RandomGenerator(seed)),
    progression: { experience: { currentSeconds: 0, maxSeconds: 100 }, completedTasks: 0, elapsedSeconds: 0 },
  };
  const rng = new RandomGenerator(`${seed}:run`);
  const lines: { id: string; text: string }[] = [];

  for (let tick = 0; tick < TICKS; tick += 1) {
    const result = advanceGame(state, 1000, rng);
    state = result.state;
    if (result.records.length === 0) continue;
    const sources = result.records.map((record, index) => ({ activityId: tick * 100 + index, record })) as IdentifiedGameTransitionRecord[];
    // Projected, not scheduled: the cadence gate decides whether a line is *heard*, and a line that
    // breaches its cap is wrong whether or not this particular run happened to draw it.
    for (const entry of projectSocialBatch(sources, state.character.Quest.history)) {
      if (entry.speaker.kind !== 'cast') continue;
      lines.push({ id: entry.speaker.id, text: entry.text });
    }
  }
  return lines;
};

const wordsIn = (text: string) => text.trim().split(/\s+/u).length;

describe('nobody in the cast says more than their voice allows', () => {
  it('reaches enough of the cast for the sweep to mean something', () => {
    // Without this, a projection change that silenced the cast entirely would leave every assertion
    // below vacuously true — which is exactly the shape of failure this file exists to catch.
    const spoken = new Set(PLAY_SEEDS.flatMap((seed) => spokenLines(seed)).map(({ id }) => id));
    expect(spoken.size).toBeGreaterThan(3);
  });

  it('keeps every spoken line inside its speaker cap, across real play', () => {
    for (const seed of PLAY_SEEDS) {
      for (const { id, text } of spokenLines(seed)) {
        const persona = SOCIAL_PERSONAS.find((candidate) => candidate.id === id);
        expect(persona, `${seed}: unknown speaker ${id}`).toBeDefined();
        expect(wordsIn(text), `${seed} [${id}] ${wordsIn(text)}>${persona?.voice.maxWords}: ${text}`)
          .toBeLessThanOrEqual(persona?.voice.maxWords ?? 0);
      }
    }
  });

  it('holds even for the longest name the game can interpolate', () => {
    /*
     * Play draws the spell it happens to draw. The breach depended on the interpolated name being
     * two words, and the longest in the table is four — so a line that fits today can breach on a
     * draw this sweep did not make, and a sweep that never draws it would report all clear forever.
     *
     * Measured directly instead: the longest name against every frame that interpolates one. This
     * is the assertion that survives the table gaining a longer entry.
     */
    const longest = SPELLS.reduce((best, name) => (wordsIn(name) > wordsIn(best) ? name : best), SPELLS[0]!);
    expect(wordsIn(longest)).toBeGreaterThan(1);

    for (const seed of PLAY_SEEDS) {
      for (const { id, text } of spokenLines(seed)) {
        const persona = SOCIAL_PERSONAS.find((candidate) => candidate.id === id);
        // Only frames that actually interpolate a spell name can grow. Matched longest-first, so a
        // name that contains another name is not mistaken for the shorter one.
        const drawn = [...SPELLS].sort((a, b) => b.length - a.length).find((name) => text.includes(name));
        if (drawn === undefined) continue;
        // Swapped rather than padded: the line already carries a name of its own length, so adding
        // the longest name's word count would double-count the one that is there. Getting this
        // backwards is what made the first version of this test report a breach that did not exist.
        const worstCase = wordsIn(text) - wordsIn(drawn) + wordsIn(longest);
        expect(worstCase, `${seed} [${id}] with "${longest}" in place of "${drawn}": ${text}`)
          .toBeLessThanOrEqual(persona?.voice.maxWords ?? 0);
      }
    }
  });
});
