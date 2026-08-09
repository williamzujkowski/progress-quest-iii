import { describe, expect, it } from 'vitest';
import { characterSheetSchema } from '../../state/schemas';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import { fileLoadout } from '../../engine/loadoutFiling';
import { projectAmbient } from '../../state/socialProjection';
import type { CharacterSheet } from '../../engine/types';
import type { HeroIdentity } from '../../state/socialProjection';

/**
 * The save boundary bounded how long a name could be and nothing about what could be in it.
 *
 * A name is not inert data here — it is interpolated into guild chatter, printed on the world
 * console, and read aloud through an `aria-live` region. A right-to-left override in a saved
 * loadout therefore rewrites lines the player never typed, on surfaces that had no idea they were
 * quoting an untrusted string. React escapes markup; it does not escape this.
 */

const BIDI_OVERRIDE = String.fromCodePoint(0x202e);
const NUL = String.fromCodePoint(0x00);
const ESCAPE = String.fromCodePoint(0x1b);
const DELETE = String.fromCodePoint(0x7f);
const LRM = String.fromCodePoint(0x200e);
const ISOLATE = String.fromCodePoint(0x2066);

/** The chatter is projected from an identity, not a sheet; the sheet only supplies the loadout. */
const SPEAKER: HeroIdentity = { name: 'Readable', race: 'Half Daemon', className: 'Robot Monk' };

const sheet = (): CharacterSheet =>
  structuredClone(createNewCharacter('Readable', 'Half Daemon', 'Robot Monk', new RandomGenerator('readable')));

const parse = (mutate: (draft: CharacterSheet) => void) => {
  const draft = sheet();
  mutate(draft);
  return characterSheetSchema.safeParse(draft);
};

describe('what a saved name is allowed to contain', () => {
  it('accepts an ordinary character sheet unchanged', () => {
    // The premise. A refinement that rejected everything would pass every test below and break the
    // game, so this is asserted before any of them.
    expect(characterSheetSchema.safeParse(sheet()).success).toBe(true);
  });

  it('refuses control and bidirectional characters wherever a name is stored', () => {
    for (const hostile of [NUL, ESCAPE, DELETE, LRM, BIDI_OVERRIDE, ISOLATE]) {
      const point = hostile.codePointAt(0)!.toString(16);
      expect(parse((d) => { d.Equip.Helm = `+9 Something${hostile} EVIL`; }).success, `Equip U+${point}`).toBe(false);
      expect(parse((d) => { d.Traits.Name = `Hero${hostile}`; }).success, `Name U+${point}`).toBe(false);
      expect(parse((d) => { d.Traits.Race = `Elf${hostile}`; }).success, `Race U+${point}`).toBe(false);
      expect(parse((d) => { d.Inventory = [{ name: `pelt${hostile}`, qty: 1 }]; }).success, `Inventory U+${point}`).toBe(false);
      expect(parse((d) => { d.Spells = [{ name: `Rite${hostile}`, level: 1 }]; }).success, `Spells U+${point}`).toBe(false);
      expect(parse((d) => { d.Quest.description = `Slay${hostile}`; }).success, `Quest U+${point}`).toBe(false);
      expect(parse((d) => { d.Task.description = `Executing${hostile}`; }).success, `Task U+${point}`).toBe(false);
    }
  });

  it('still accepts the punctuation the game itself generates', () => {
    // The failure mode of a character-class rule is rejecting legitimate saves, which here would
    // mean refusing to load a real player's game. The names this game makes carry curly apostrophes
    // and dashes, and there is no reason a character name should not carry an accent.
    // The astral character is here for the code-point iteration: scanned by UTF-16 unit instead, a
    // surrogate pair is two values neither of which is the character that was written.
    for (const ordinary of ['Sgt. Zoumpouk the Off-Prem Elf', 'a squire’s note', 'Zoë Ærlich', '—', 'Cc Line', '+9 Skeleton Key', 'Doomsday Vault \u{1F600}']) {
      expect(parse((d) => { d.Equip.Helm = ordinary; }).success, ordinary).toBe(true);
    }
  });
});

describe('what the filing is willing to quote', () => {
  const uncatalogued = '+9 Something Nobody Catalogued';

  it('will not cite a slot whose base noun it could not read', () => {
    // The item totals 9 on its assessor's mark alone, so the old `total > 0` filter admitted it and
    // the `?? name` fallback handed the whole generated string to the chatter.
    const hero = { ...sheet(), Equip: { ...sheet().Equip, Helm: uncatalogued, Hauberk: 'Cover Note' } };
    const filing = fileLoadout(hero);

    expect(filing.contributors.every(({ slot }) => slot !== 'Helm')).toBe(true);
    expect(filing.itemOfRecord?.slot).toBe('Hauberk');
  });

  it('reports no item of record at all when nothing worn can be read', () => {
    const hero = { ...sheet(), Equip: { ...sheet().Equip, Helm: uncatalogued } };
    const filing = fileLoadout(hero);

    expect(filing.itemOfRecord).toBeNull();
    expect(filing.contributors).toEqual([]);
  });

  it('keeps the unreadable slot out of the chatter across a long run', () => {
    // The assertion that would have caught this originally. A single projection proves nothing —
    // the lane is chosen by a stable hash, so the item lane only comes up some of the time.
    const hero = { ...sheet(), Equip: { ...sheet().Equip, Helm: uncatalogued, Hauberk: 'Cover Note' } };
    const filing = fileLoadout(hero);

    const spoken: string[] = [];
    for (let tasks = 0; tasks < 3000; tasks += 1) {
      for (const line of projectAmbient(SPEAKER, tasks, { loadout: filing })) spoken.push(line.text);
    }

    expect(spoken.length, 'expected the run to actually produce chatter').toBeGreaterThan(0);
    expect(spoken.some((text) => text.includes('Cover Note')), 'the readable slot is still quoted').toBe(true);
    expect(spoken.filter((text) => text.includes('Nobody Catalogued'))).toEqual([]);
    for (const text of spoken) expect(text, text).not.toMatch(/\d/);
  });
});
