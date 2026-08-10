import { describe, expect, it } from 'vitest';
import { projectSocialBatch } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * The scene that had the item in hand and never said its name.
 *
 * `event.name` and `event.slot` were both available and neither was used, so a `legendary`
 * acquisition read identically to a `serviceable` one apart from one adjective — and getting an
 * upgrade is *the* guild-chat moment. The world console already named it properly; the scene did not.
 *
 * Naming it also repaired a rendering defect rather than only a flat one. `world.equipment.label`
 * was interpolated at sentence position one, so three of six openings began lower-case:
 * *"receipt filed as notable."*, *"serviceable equipment receipt confirmed."*
 */

const snapshot = (): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 30 },
  act: 4,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 400,
  elapsedSeconds: 20_000,
});

const scenes = (name: string, slot = 'Hauberk', draws = 30) =>
  Array.from({ length: draws }, (_unused, index) => projectSocialBatch([{
    activityId: index * 3,
    record: {
      event: { type: 'equipment_gained', slot, name } as GameTransitionEvent,
      post: { ...snapshot(), completedTasks: 400 + index * 7 },
    },
  } as IdentifiedGameTransitionRecord])).flat();

describe('an acquisition names what was acquired', () => {
  it('never opens a sentence in lower case', () => {
    // The defect was structural, not stylistic: a label interpolated at position one. Swept over
    // several gradings so no single draw can hide it.
    for (const name of ['+3 Bonded Burlap', '+9 Audited Insured Burn Bag', '+40 Hallowed Act of Parliament']) {
      for (const { text } of scenes(name)) expect(text, text).not.toMatch(/^[a-z]/);
    }
  });

  it('quotes the item and the slot the engine actually awarded', () => {
    const spoken = scenes('+3 Bonded Burlap').map(({ text }) => text);
    expect(spoken.some((text) => text.includes('+3 Bonded Burlap'))).toBe(true);
    expect(spoken.some((text) => text.includes('Hauberk'))).toBe(true);
    // And never a slot it did not go into.
    for (const text of spoken) expect(text, text).not.toMatch(/\bGauntlets\b|\bSollerets\b/);
  });

  it('says something different for the rarest grade', () => {
    // A legendary acquisition used to read identically to a serviceable one. Asserted as a
    // difference between gradings rather than against fixed phrasing.
    const ordinary = new Set(scenes('+3 Bonded Burlap').map(({ text }) => text.replace('+3 Bonded Burlap', 'X')));
    const legendary = new Set(scenes('+9 Audited Insured Burn Bag').map(({ text }) => text.replace('+9 Audited Insured Burn Bag', 'X')));

    expect(legendary.size).toBeGreaterThan(0);
    for (const text of legendary) expect(ordinary.has(text), `both gradings say: ${text}`).toBe(false);
  });

  it('still says the thing does nothing in a fight', () => {
    // The one claim worth repeating, because it is the truth the whole loadout rests on. It must
    // survive the rewrite even though three restatements of it did not.
    const everything = [...scenes('+3 Bonded Burlap'), ...scenes('+9 Audited Insured Burn Bag')].map(({ text }) => text);
    expect(everything.some((text) => /combat contribution|combat effect|Combat contribution/i.test(text))).toBe(true);
  });
});
