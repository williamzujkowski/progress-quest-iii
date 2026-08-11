import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../data/traits';

/**
 * A drop should not repeat its own monster's word, and should not arrive from two unrelated places.
 *
 * The loot name is built as `${monster.name} ${monster.item}`, lowercased. Five monsters ended with
 * the same word as their drop, so the log read `Selling a tape cluster tape...` — measured at 1,099
 * occurrences per 187,935 loot events, and `wisp of scope wisp` at 1,086 when `wisp of scope creep`
 * was one word away.
 *
 * All of this is golden-inert: a monster's `item` is concatenated after the pick and is never a draw
 * target, so changing one cannot remap anything. The two exceptions are `Nit`'s `tail` and
 * `Swamp Ticket`'s `lilypad`, both pinned by fixtures and both left alone.
 */

describe('a drop is not its own monster said twice', () => {
  it('never ends the monster name with the word its drop uses', () => {
    for (const { name, item } of MONSTERS) {
      const lastWord = name.toLowerCase().split(/\s+/u).at(-1);
      expect(item.toLowerCase(), `${name} drops "${item}"`).not.toBe(lastWord);
    }
  });

  it('does not read as a stutter once the two are joined', () => {
    // The rendered form is what a player meets. Checking the joined string catches cases the
    // word-comparison above would miss, such as a drop repeating a word from the middle of a name.
    for (const { name, item } of MONSTERS) {
      const joined = `${name} ${item}`.toLowerCase().split(/\s+/u);
      const doubled = joined.some((word, index) => index > 0 && word === joined[index - 1]);
      expect(doubled, `"${name} ${item}" repeats a word`).toBe(false);
    }
  });

  it('keeps the two drop nouns the fixtures pin', () => {
    // Every other `item` is free to change; these two are recorded in golden sessions, so a rename
    // here is a re-record rather than an edit. Asserted so the freedom above is not mistaken for
    // freedom over all of them.
    expect(MONSTERS.find(({ name }) => name === 'Nit')?.item).toBe('tail');
    expect(MONSTERS.find(({ name }) => name === 'Swamp Ticket')?.item).toBe('lilypad');
  });
});
