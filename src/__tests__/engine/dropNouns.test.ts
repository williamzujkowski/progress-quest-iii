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
  it('never uses a word the monster name already contains', () => {
    /*
     * Anywhere in the name, not just the end. My first version of this compared the drop to the
     * *last* word and separately looked for adjacent duplicates in the joined string — and both
     * missed `Wisp of Scope` dropping a `wisp`, which repeats the first word and puts three words
     * between the two copies. The mutation restoring it passed, which is how I found out.
     *
     * The rendered form is `${name} ${item}` lowercased, so any shared word is a stutter to a
     * reader whether or not the two land next to each other.
     */
    for (const { name, item } of MONSTERS) {
      const words = new Set(name.toLowerCase().split(/\s+/u));
      for (const part of item.toLowerCase().split(/\s+/u)) {
        expect(words.has(part), `"${name} ${item}" says "${part}" twice`).toBe(false);
      }
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
