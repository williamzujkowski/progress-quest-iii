import { describe, expect, it } from 'vitest';
import { ARMOUR_BY_SLOT, armourNameForSlot, armourTableForSlot } from '../../data/armourBySlot';
import { ARMORS, DEFENSE_ATTRIB, DEFENSE_BAD, EQUIP_SLOTS } from '../../data/traits';
import { analyzeItemMechanics } from '../../engine/itemMechanics';
import type { ArmourSlot } from '../../engine/types';

const ARMOUR_SLOTS = EQUIP_SLOTS.filter((slot): slot is ArmourSlot => slot !== 'Weapon' && slot !== 'Shield');

describe('armour named by where it is worn', () => {
  it('answers position for position, at the shared rating', () => {
    // The whole change rests on this. A name added or removed rather than substituted shifts every
    // tier above it, and the draw would then land on a different quality than the engine computed.
    for (const slot of ARMOUR_SLOTS) {
      const table = armourTableForSlot(slot);
      expect(table, `${slot} must answer for every shared entry`).toHaveLength(ARMORS.length);
      table.forEach(([, value], index) => expect(value, `${slot}[${index}] rating`).toBe(ARMORS[index]![1]));
    }
  });

  it('keeps the three names recorded sessions pin', () => {
    // These appear in goldens captured from the original web port. They cannot be re-recorded, so
    // the cells are fixed and the vocabularies are built around them.
    expect(armourNameForSlot('Helm', 0)).toBe('Lanyard');
    expect(armourNameForSlot('Gauntlets', 4)).toBe('Framework');
    expect(armourNameForSlot('Hauberk', 2)).toBe('Boilerplate');
  });

  it('gives no two slots the same word', () => {
    // The defect: nine slots drew from one table, so every character wore some noun two or three
    // times over. Measured at 60 of 60 characters before this.
    const seen = new Map<string, string>();
    for (const [slot, names] of Object.entries(ARMOUR_BY_SLOT)) {
      for (const name of names) {
        const other = seen.get(name);
        expect(other, `"${name}" is in both ${other} and ${slot}`).toBeUndefined();
        seen.set(name, slot);
      }
    }
  });

  it('lets no name hide inside another, or inside a modifier', () => {
    // `analyzeItemMechanics` matches by substring and takes the first hit in table order, so
    // "Reserve" sitting inside "Strategic Reserve" silently reports the wrong rating — and a base
    // containing a modifier word is read as modifier plus nothing. Both happened while writing this.
    for (const [slot, names] of Object.entries(ARMOUR_BY_SLOT)) {
      for (const name of names) {
        for (const other of names) {
          if (name !== other) expect(other.includes(name), `"${name}" hides inside "${other}" in ${slot}`).toBe(false);
        }
        for (const [modifier] of [...DEFENSE_ATTRIB, ...DEFENSE_BAD]) {
          expect(name.includes(modifier), `modifier "${modifier}" hides inside "${name}" in ${slot}`).toBe(false);
        }
      }
    }
  });

  it('recovers the exact rating the engine used, for every slot and tier', () => {
    // The point of the whole exercise: a renaming that the analyser cannot follow would leave the
    // tooltips blank and `loadoutQuality` reading zero for eight slots in nine.
    for (const slot of ARMOUR_SLOTS) {
      ARMORS.forEach(([, rating], index) => {
        const name = armourNameForSlot(slot, index);
        const quality = analyzeItemMechanics({ kind: 'equipment', name, slot }).quality;
        expect(quality?.base?.value, `${slot} "${name}"`).toBe(rating);
      });
    }
  });

  it('refuses the two slots that have no armour vocabulary', () => {
    // These used to answer, and the answer was plausible and wrong: `armourNameForSlot('Weapon', 3)`
    // returned `Charter` where `WEAPONS` holds `Stub`, and `armourTableForSlot('Weapon')` returned
    // `ARMORS`. Harmless only because both callers branch on those slots before arriving — and the
    // test that stood here asserted the wrong answer was correct, so a future caller would have
    // inherited a real-looking table for the wrong slot with a green suite behind it.
    //
    // The refusal is at the type, which is the only kind that cannot be ignored at a call site.
    // @ts-expect-error Weapon is not an armour slot.
    expect(() => armourTableForSlot('Weapon')).toBeDefined();
    // @ts-expect-error Shield is not an armour slot.
    expect(() => armourNameForSlot('Shield', 0)).toBeDefined();

    // And every slot that does have one is still answered, or the refusal would be over-broad.
    for (const slot of ARMOUR_SLOTS) {
      expect(armourTableForSlot(slot)).toHaveLength(ARMORS.length);
      expect(armourNameForSlot(slot, 0)).not.toBe('');
    }
  });

  it('survives an index it has no answer for', () => {
    // Runs inside the transition. A name that cannot be found is a worse reason to stop a session
    // than a name that is merely generic.
    expect(armourNameForSlot('Helm', 999)).toBe('');
    expect(armourNameForSlot('Helm', -1)).toBe('');
  });

  it('names no real vendor, product, or person', () => {
    const serialized = JSON.stringify(ARMOUR_BY_SLOT).toLowerCase();
    for (const forbidden of [
      'aws', 'amazon', 'azure', 'google', 'microsoft', 'oracle', 'nvidia', 'intel', 'apple',
      'kubernetes', 'docker', 'jira', 'slack', 'github', 'postgres', 'redis', 'nginx',
      'openai', 'anthropic', 'deepmind', 'chatgpt', 'claude', 'gemini', 'copilot', 'llama',
      'turing', 'lovelace', 'mccarthy', 'minsky', 'hopper', 'torvalds', 'stallman',
    ]) expect(serialized, `armour vocabularies must not name ${forbidden}`).not.toContain(forbidden);
  });
});
