import { describe, expect, it } from 'vitest';
import { ENCOUNTER_SECONDS_PRECISION, projectCounterfactual } from '../../engine/loadoutFiling';
import { encounterSpeedMultiplier, loadoutQuality } from '../../engine/loadout';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import type { CharacterSheet } from '../../engine/types';

/**
 * The engine computes both figures and reports one. `generateMonsterTask` derives the canonical
 * duration — opponent puissance over character level, exactly as the original did — then multiplies
 * it away before returning. The unmultiplied number is discarded at the moment it is used, and
 * nothing has ever named it.
 */

const hero = (overrides: Partial<CharacterSheet> = {}): CharacterSheet => {
  const character = createNewCharacter('Compared', 'Half Daemon', 'Robot Monk', new RandomGenerator('compared'));
  return {
    ...character,
    Task: { description: 'Executing a Nit...', durationMs: 4000, elapsedMs: 0, type: 'kill' },
    ...overrides,
  };
};

const equipped = (equip: Partial<CharacterSheet['Equip']>): CharacterSheet => {
  const base = hero();
  return { ...base, Equip: { ...base.Equip, ...equip } };
};

describe('a comparison that shows no difference is not a comparison', () => {
  /*
   * The guard was `multiplier >= 1`, which catches only a loadout worth exactly zero. The console
   * prints one decimal place, so any multiplier close enough to one produced two identical strings
   * and the line read "scheduled at 6.0s; would have taken 6.0s" — a number beside itself, on the
   * one surface that exists to make an invisible mechanic attributable.
   *
   * Worst in the early game, which is when the loadout is nearly worthless and a new reader is most
   * likely to be working out what the console means.
   */
  const printed = (ms: number) => (ms / 1000).toFixed(ENCOUNTER_SECONDS_PRECISION);

  it('stays away whenever the two figures would print the same', () => {
    // Swept rather than sampled: every combination that reaches this function must either be null or
    // show two visibly different figures. A single fixture would prove nothing about the boundary.
    let shown = 0;
    for (const helm of ['+1 Lanyard', '+3 Lanyard', '+5 Hard Hat', '+9 Master Agreement', '+40 Regency']) {
      for (const durationMs of [1500, 2000, 4000, 6000, 9000, 14000, 30000]) {
        const character = { ...equipped({ Helm: helm }), Task: { description: 'Executing a Nit...', durationMs, elapsedMs: 0, type: 'kill' as const } };
        const counterfactual = projectCounterfactual(character);
        if (counterfactual === null) continue;
        shown += 1;
        expect(printed(counterfactual.actualMs), `${helm} at ${durationMs}ms`)
          .not.toBe(printed(counterfactual.canonicalMs));
      }
    }
    // The premise: a guard that suppressed everything would satisfy the loop above vacuously.
    expect(shown).toBeGreaterThan(10);
  });

  it('still reports the difference once it is large enough to see', () => {
    // The other direction. Suppressing an identical rendering must not suppress a real one — the
    // line is the only place the loadout's effect is ever named.
    const counterfactual = projectCounterfactual({
      ...equipped({ Helm: '+40 Regency' }),
      Task: { description: 'Executing a Nit...', durationMs: 14000, elapsedMs: 0, type: 'kill' },
    });

    expect(counterfactual).not.toBeNull();
    expect(printed(counterfactual!.canonicalMs)).not.toBe(printed(counterfactual!.actualMs));
    expect(counterfactual!.canonicalMs).toBeGreaterThan(counterfactual!.actualMs);
  });

  it('suppresses the case that was shipping, rather than only cases nobody hits', () => {
    // A near-worthless loadout on a six-second encounter, which is the state a new character spends
    // its first minutes in. Both sides rounded to 6.0s.
    //
    // `+3 Lanyard` rather than `+1`: the starting sheet carries a `-3 Burlap` that cancels a +1
    // outright, leaving quality 0 and a multiplier of exactly 1 — which the *old* guard already
    // caught. Quality 1 is the smallest loadout that does something and still prints nothing, so it
    // is the case this change is actually about.
    const character = {
      ...equipped({ Helm: '+3 Lanyard' }),
      Task: { description: 'Executing a Nit...', durationMs: 6000, elapsedMs: 0, type: 'kill' as const },
    };
    const quality = loadoutQuality(character);
    // The premise again: this must be a loadout that does something, or the old guard would have
    // caught it and there would be nothing new here.
    expect(encounterSpeedMultiplier(quality)).toBeLessThan(1);
    expect(projectCounterfactual(character)).toBeNull();
  });
});

describe('the road not taken', () => {
  it('reports the duration the original formula would have produced', () => {
    // Recovered by division rather than recomputed. Recomputing the canonical formula here would be
    // two derivations of one number, which is how they drift apart.
    const character = equipped({ Helm: 'Final Say', Hauberk: 'Lender of Last Resort' });
    const counterfactual = projectCounterfactual(character);

    expect(counterfactual).not.toBeNull();
    expect(counterfactual!.actualMs).toBe(character.Task.durationMs);
    const multiplier = encounterSpeedMultiplier(loadoutQuality(character));
    expect(counterfactual!.canonicalMs).toBe(Math.round(character.Task.durationMs / multiplier));
  });

  it('always reports the original as the slower of the two', () => {
    // The direction is the whole claim. A loadout shortens encounters, so the counterfactual must be
    // longer than what is actually scheduled — never shorter, never equal.
    for (const helm of ['Corner Office', 'Casting Vote', 'Final Say']) {
      const counterfactual = projectCounterfactual(equipped({ Helm: helm }));
      expect(counterfactual, helm).not.toBeNull();
      expect(counterfactual!.canonicalMs, helm).toBeGreaterThan(counterfactual!.actualMs);
    }
  });

  it('says nothing when the loadout changes nothing', () => {
    // Every new character. A line reading "would have taken the same" is noise dressed as
    // information, and `loadoutQuality` floors at zero so the multiplier is exactly one.
    const starting = hero();
    expect(loadoutQuality(starting)).toBe(0);
    expect(projectCounterfactual(starting)).toBeNull();
  });

  it('says nothing about a task the loadout does not touch', () => {
    // A market walk has no counterfactual. Inventing one would be the tooltip failure this codebase
    // keeps correcting — a figure asserted about something the arithmetic never reached.
    for (const type of ['selling', 'buying', 'heading_to_market', 'cinematic'] as const) {
      const character = equipped({ Helm: 'Final Say' });
      expect(projectCounterfactual({ ...character, Task: { ...character.Task, type } }), type).toBeNull();
    }
  });

  it('says nothing about a duration it cannot read', () => {
    // Reachable from an imported save, where the task is whatever the file said.
    const character = equipped({ Helm: 'Final Say' });
    for (const durationMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(projectCounterfactual({ ...character, Task: { ...character.Task, durationMs } }), String(durationMs)).toBeNull();
    }
  });

  it('is a pure function of the sheet', () => {
    const character = equipped({ Helm: 'Final Say' });
    const before = JSON.stringify(character);

    expect(projectCounterfactual(character)).toEqual(projectCounterfactual(character));
    expect(JSON.stringify(character)).toBe(before);
  });
});
