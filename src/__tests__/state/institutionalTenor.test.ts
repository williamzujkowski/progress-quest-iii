import { describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { levelUpTime } from '../../engine/math';
import { advanceGame } from '../../engine/transition';
import { TENOR_LABELS, tenorFor, tenorLine } from '../../state/institutionalTenor';
import { projectWorld } from '../../state/worldContext';

describe('institutional tenor', () => {
  it('stays routine through the prologue and the first act', () => {
    // The tier that must dominate. Escalation only reads as escalation against the mundane.
    expect(tenorFor({ act: 0 })).toBe('routine');
    expect(tenorFor({ act: 1 })).toBe('routine');
  });

  it('rises by act, and only ever upward', () => {
    const order = ['routine', 'noted', 'ceremonial', 'mythic', 'infrastructural', 'autonomous'];
    let previous = -1;
    for (let act = 0; act <= 30; act += 1) {
      const rank = order.indexOf(tenorFor({ act }));
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
    expect(tenorFor({ act: 30 })).toBe('autonomous');
  });

  it('places the compute-industrial tiers where months of credited time are required', () => {
    // The same guard the mythic bound gets, for the same reason. An act costs
    // 3600 * (1 + 5 * act) seconds, so these bounds are about thirty-three and sixty-nine days of
    // credited time. Lowering either would put a tier about outlasting everyone's interest within
    // reach of a weekend, and this fails rather than letting that happen quietly.
    expect(tenorFor({ act: 17 })).toBe('mythic');
    expect(tenorFor({ act: 18 })).toBe('infrastructural');
    expect(tenorFor({ act: 25 })).toBe('infrastructural');
    expect(tenorFor({ act: 26 })).toBe('autonomous');
  });

  it('keeps the summit qualitative, claiming no quantity the engine does not model', () => {
    // The escalation borrows the vocabulary of a facility, and a facility is described in figures.
    // The engine models acts, levels, kills and gold; it does not model power, capacity or floor
    // space. A line quoting any of those would report state that exists nowhere, so no line at any
    // tier may carry a bare figure or a unit of a thing that is not simulated.
    for (const act of [0, 2, 5, 12, 18, 26]) {
      for (const location of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const line = tenorLine({ act, location, venue: 'town' });
        expect(line).not.toMatch(/\d/u);
        expect(line.toLowerCase()).not.toMatch(/\b(megawatt|kilowatt|watt|terabyte|petaflop|gigahertz|acres?|square (?:feet|metres|meters))\b/u);
      }
    }
  });

  it('takes escalation as technique without naming or reusing a researched source', () => {
    // Same contract the persona and chatter catalogues carry: outside work supplies abstract
    // technique only, never its own expression.
    const serialized = JSON.stringify(TENOR_LABELS).toLowerCase()
      + [0, 2, 5, 12, 18, 26].flatMap((act) =>
        ['a', 'b', 'c'].map((location) => tenorLine({ act, location, venue: 'town' }))).join(' ').toLowerCase();
    for (const forbidden of [
      'universal paperclips', 'paperclip', 'hypnodrone', 'von neumann', 'drifter',
      'erenshor', 'everquest', 'world of warcraft', 'kingdom of loathing',
    ]) expect(serialized).not.toContain(forbidden);
  });

  it('reaches the top tier only where a run has genuinely gone on', () => {
    // A guard against quietly lowering the bar later: if the summit becomes reachable early,
    // the joke stops being earned and this fails rather than silently cheapening.
    expect(tenorFor({ act: 4 })).not.toBe('mythic');
    expect(tenorFor({ act: 11 })).not.toBe('mythic');
    expect(tenorFor({ act: 12 })).toBe('mythic');
  });

  it('holds its line still while the hero does', () => {
    const context = { act: 6, location: 'the Auditable Wilds', venue: 'town' } as const;
    expect(tenorLine(context)).toBe(tenorLine(context));
    // And moves when the surroundings do, or it would read as a fixed caption.
    const lines = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((location) => tenorLine({ act: 6, location, venue: 'town' })),
    );
    expect(lines.size).toBeGreaterThan(1);
  });

  it('says something different at every tier', () => {
    const acts = [0, 2, 5, 12, 18, 26];
    const lines = acts.map((act) => tenorLine({ act, location: 'the same place', venue: 'town' }));
    expect(new Set(lines).size).toBe(acts.length);
  });

  it('names every tier it can produce', () => {
    for (const act of [0, 2, 5, 12, 18, 26]) {
      expect(TENOR_LABELS[tenorFor({ act })]).toBeTruthy();
    }
  });

  it('consumes no randomness, so a run is unchanged by reading it', () => {
    // The engine's continuation is the thing that must not move. Projecting and describing the
    // world between ticks has to leave the generator exactly where it was.
    const rng = new RandomGenerator('tenor-purity');
    let state = {
      character: createNewCharacter('Tenor', 'Half Daemon', 'Robot Monk', rng),
      progression: { experience: { currentSeconds: 0, maxSeconds: levelUpTime(1) }, completedTasks: 0, elapsedSeconds: 0 },
    };
    state = advanceGame(state, 5_000, rng).state;

    const before = rng.getState();
    const context = projectWorld({ kind: 'current', state }).context;
    tenorLine(context);
    tenorFor(context);

    expect(rng.getState()).toEqual(before);
  });
});
