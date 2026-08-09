import { describe, expect, it } from 'vitest';
import { projectCounterfactual } from '../../engine/loadoutFiling';
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
