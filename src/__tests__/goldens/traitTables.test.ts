import { plural as pluralize } from '../../engine/text';
import { describe, expect, it } from 'vitest';
import { MONSTER_PREFIXES } from '../../engine/sim';
import { isUnrenderable } from '../../engine/text';
import {
  ALL_STATS,
  ARMORS,
  BORING_ITEMS,
  DEFENSE_ATTRIB,
  DEFENSE_BAD,
  EQUIP_SLOTS,
  IMPRESSIVE_TITLES,
  ITEM_ATTRIB,
  ITEM_OFS,
  KLASSES,
  MONSTERS,
  OFFENSE_ATTRIB,
  OFFENSE_BAD,
  PRIME_STATS,
  RACES,
  SHIELDS,
  SPECIALS,
  SPELLS,
  TITLES,
  WEAPONS,
} from '../../data/traits';

/**
 * Structural goldens for the tables in `src/data/traits.ts`.
 *
 * This file used to read `pq-web-src/config.js` and deep-equal fourteen tables against it. That
 * submodule is gone, and the obvious replacement — snapshotting `config.js` into a fixture and
 * diffing `traits.ts` against the copy — would have been a test comparing the data to itself.
 * Any edit that damaged the tables would have been made in one place and the test would still
 * have passed, because nothing would regenerate the fixture. So the checks here changed shape.
 *
 * WHAT THIS CATCHES, and it is worth being precise because the previous test caught more:
 *
 * - An entry added to or removed from any table. Every count below is asserted exactly. Counts
 *   are not cosmetic: the engine draws from these tables with `rng.pick` and `rng.random(length)`
 *   (`src/engine/sim.ts`), so a table's length is an argument to the PRNG. Adding one monster
 *   silently rewrites every generated world downstream of that draw for every existing seed.
 * - Corruption of an entry's shape — a name/quality pair that stopped being a pair, a monster
 *   missing a drop, a race whose bonus names a stat the engine does not have.
 * - Empty or whitespace-only names, which is what a botched find-and-replace tends to leave.
 * - Accidental deduplication or accidental duplication. Two duplicates in these tables are
 *   deliberate and are pinned as such: `BORING_ITEMS` carries 'writ' twice, and `MONSTERS` lists
 *   'Nit' at two different levels. Removing either would change draw weights.
 * - The equipment ladders being sorted, reversed, or otherwise reordered. `WEAPONS`, `SHIELDS`,
 *   `ARMORS`, and `OFFENSE_ATTRIB` ascend by quality; the other modifier tables deliberately do
 *   not, so they are not held to it.
 *
 * WHAT THIS CANNOT CATCH, stated plainly rather than left to be discovered: a changed spelling, a
 * changed quality number, a swapped pair of adjacent entries that keeps the ladder ascending, or
 * a wholesale rewrite of the wording. Diffing against the original source was the only thing that
 * ever caught those, and nothing in this repository can do it now.
 *
 * That is not the whole picture, though. The fifteen transition goldens in
 * `src/__tests__/fixtures/goldens/` were recorded against the original build and reach specific
 * table entries through their pinned seeds — renaming a monster or a boring item that any of
 * those recorded runs happens to draw still fails `transitionParity.test.ts`. The coverage is
 * real but incidental, and it is a sample rather than a sweep.
 */

/*
 * The four modifier counts moved once, deliberately, and the reasoning belongs beside them.
 *
 * Everywhere else in this file a changed count means a rewritten world, because a table's length is
 * an argument to the PRNG. The four modifier tables are the exception, and the exception is
 * structural rather than lucky: they are read by `rng` in exactly one place — the modifier loop in
 * `generateEquipUpgrade` — and that loop is gated on `plus !== 0`. Every recorded fixture is level
 * 1-5, and the one that reaches equipment generation draws a base whose quality equals its level, so
 * the loop body never executes there and the tables' lengths are never asked for.
 *
 * Verified rather than argued: extending these four leaves all fifteen transition goldens passing,
 * while a one-entry change to `ARMORS` — a table read outside the gate — fails seven of them.
 */
const COUNTS: [string, readonly unknown[], number][] = [
  ['MONSTERS', MONSTERS, 232],
  ['ITEM_OFS', ITEM_OFS, 52],
  ['SPELLS', SPELLS, 47],
  ['BORING_ITEMS', BORING_ITEMS, 42],
  ['WEAPONS', WEAPONS, 39],
  ['SPECIALS', SPECIALS, 37],
  ['ITEM_ATTRIB', ITEM_ATTRIB, 33],
  ['RACES', RACES, 21],
  ['ARMORS', ARMORS, 20],
  ['KLASSES', KLASSES, 18],
  ['SHIELDS', SHIELDS, 16],
  ['DEFENSE_BAD', DEFENSE_BAD, 17],
  ['IMPRESSIVE_TITLES', IMPRESSIVE_TITLES, 14],
  ['EQUIP_SLOTS', EQUIP_SLOTS, 11],
  ['OFFENSE_ATTRIB', OFFENSE_ATTRIB, 19],
  ['DEFENSE_ATTRIB', DEFENSE_ATTRIB, 17],
  ['OFFENSE_BAD', OFFENSE_BAD, 12],
  ['TITLES', TITLES, 9],
  ['ALL_STATS', ALL_STATS, 8],
  ['PRIME_STATS', PRIME_STATS, 6],
];

const NAME_TABLES: [string, readonly string[]][] = [
  ['SPELLS', SPELLS],
  ['SPECIALS', SPECIALS],
  ['ITEM_ATTRIB', ITEM_ATTRIB],
  ['ITEM_OFS', ITEM_OFS],
  ['BORING_ITEMS', BORING_ITEMS],
  ['TITLES', TITLES],
  ['IMPRESSIVE_TITLES', IMPRESSIVE_TITLES],
  ['EQUIP_SLOTS', EQUIP_SLOTS],
];

const QUALITY_TABLES: [string, readonly [string, number][]][] = [
  ['OFFENSE_ATTRIB', OFFENSE_ATTRIB],
  ['DEFENSE_ATTRIB', DEFENSE_ATTRIB],
  ['SHIELDS', SHIELDS],
  ['ARMORS', ARMORS],
  ['WEAPONS', WEAPONS],
  ['OFFENSE_BAD', OFFENSE_BAD],
  ['DEFENSE_BAD', DEFENSE_BAD],
];

/** Tables whose entry order is a quality ladder the engine walks. The rest are ordered but flat. */
const ASCENDING_TABLES: [string, readonly [string, number][]][] = [
  ['OFFENSE_ATTRIB', OFFENSE_ATTRIB],
  ['SHIELDS', SHIELDS],
  ['ARMORS', ARMORS],
  ['WEAPONS', WEAPONS],
];

function duplicatesOf(values: readonly string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

describe('trait table structure', () => {
  it.each(COUNTS)('holds exactly the recorded number of %s entries', (_name, table, expected) => {
    expect(table).toHaveLength(expected);
  });

  it.each(NAME_TABLES)('gives every %s entry a non-empty name', (_name, table) => {
    expect(table.filter((entry) => typeof entry !== 'string' || entry.trim() === '')).toEqual([]);
  });

  it.each(QUALITY_TABLES)('gives every %s entry a non-empty name and an integer quality', (_name, table) => {
    expect(
      table.filter(
        (entry) =>
          !Array.isArray(entry)
          || entry.length !== 2
          || typeof entry[0] !== 'string'
          || entry[0].trim() === ''
          || !Number.isInteger(entry[1]),
      ),
    ).toEqual([]);
  });

  it.each(ASCENDING_TABLES)('keeps %s ordered by ascending quality', (_name, table) => {
    const qualities = table.map(([, quality]) => quality);

    expect(qualities).toEqual([...qualities].sort((left, right) => left - right));
  });

  // Sign is the whole distinction between the good and bad modifier tables: `generateEquipUpgrade`
  // picks between them by whether the hero out-levels the item, then subtracts the value. A stray
  // minus sign in OFFENSE_ATTRIB would make good gear worse without changing any name.
  it.each([
    ['OFFENSE_ATTRIB', OFFENSE_ATTRIB],
    ['DEFENSE_ATTRIB', DEFENSE_ATTRIB],
  ] as [string, readonly [string, number][]][])('keeps every %s bonus positive', (_name, table) => {
    expect(table.filter(([, quality]) => quality <= 0)).toEqual([]);
  });

  it.each([
    ['OFFENSE_BAD', OFFENSE_BAD],
    ['DEFENSE_BAD', DEFENSE_BAD],
  ] as [string, readonly [string, number][]][])('keeps every %s penalty negative', (_name, table) => {
    expect(table.filter(([, quality]) => quality >= 0)).toEqual([]);
  });

  it.each([
    ['SHIELDS', SHIELDS],
    ['ARMORS', ARMORS],
    ['WEAPONS', WEAPONS],
  ] as [string, readonly [string, number][]][])('keeps every %s quality non-negative', (_name, table) => {
    expect(table.filter(([, quality]) => quality < 0)).toEqual([]);
  });

  it.each([
    ['SPELLS', SPELLS],
    ['SPECIALS', SPECIALS],
    ['ITEM_ATTRIB', ITEM_ATTRIB],
    ['ITEM_OFS', ITEM_OFS],
    ['TITLES', TITLES],
    ['IMPRESSIVE_TITLES', IMPRESSIVE_TITLES],
    ['EQUIP_SLOTS', EQUIP_SLOTS],
  ] as [string, readonly string[]][])('lists every %s entry once', (_name, table) => {
    expect(duplicatesOf(table)).toEqual([]);
  });

  it.each(QUALITY_TABLES)('lists every %s name once', (_name, table) => {
    expect(duplicatesOf(table.map(([name]) => name))).toEqual([]);
  });

  // The one deliberate repeat, pinned rather than tolerated. See the comment above the table:
  // deduplicating 'writ' would change how often it is drawn, so the test asserts the repeat
  // exists, asserts it is the only one, and asserts it happens exactly twice.
  it('repeats writ in BORING_ITEMS, and repeats nothing else', () => {
    expect(duplicatesOf(BORING_ITEMS)).toEqual(['writ']);
    expect(BORING_ITEMS.filter((item) => item === 'writ')).toHaveLength(2);
  });

  it('gives every monster a name, a non-negative integer level, and a drop', () => {
    expect(
      MONSTERS.filter(
        ({ name, level, item }) =>
          typeof name !== 'string'
          || name.trim() === ''
          || !Number.isInteger(level)
          || level < 0
          || typeof item !== 'string'
          || item === '',
      ),
    ).toEqual([]);
  });

  // Names repeat where levels differ — 'Nit' is both a level 0 and a level 1 encounter, and the
  // quest system addresses monsters by index, so collapsing the two would shift every later index.
  it('lists every monster entry once, allowing a repeated name at a different level', () => {
    expect(duplicatesOf(MONSTERS.map((monster) => JSON.stringify(monster)))).toEqual([]);
    expect(duplicatesOf(MONSTERS.map(({ name }) => name))).toEqual(['Nit']);
  });

  it.each([
    ['RACES', RACES],
    ['KLASSES', KLASSES],
  ] as [string, readonly { name: string; stats: readonly string[] }[]][])(
    'gives every %s entry a unique name and at least one real stat bonus',
    (_name, table) => {
      expect(duplicatesOf(table.map(({ name }) => name))).toEqual([]);
      expect(
        table.filter(
          ({ name, stats }) =>
            name.trim() === ''
            || stats.length === 0
            || stats.some((stat) => !(ALL_STATS as readonly string[]).includes(stat)),
        ),
      ).toEqual([]);
    },
  );

  it('keeps the prime stats in the order everything else reads them in', () => {
    // Pinned as a literal on purpose. ALL_STATS is *derived* from PRIME_STATS, so any assertion
    // relating the two restates the derivation and cannot fail — the previous version here was
    // `expect(ALL_STATS).toEqual([...PRIME_STATS, 'HP Max', 'MP Max'])`, a character-for-character
    // copy of traits.ts:5, and reversing PRIME_STATS left all 71 assertions in this file green.
    //
    // The order is the contract: it decides the sequence stats appear in on the hero banner and in
    // the character creator. A golden that pins a load-bearing literal is doing its job when
    // editing the source line fails it. That is the opposite of the tautology it replaces, which
    // could only fail when the source line was edited in a way that broke its own restatement.
    expect(PRIME_STATS).toEqual(['STR', 'CON', 'DEX', 'INT', 'WIS', 'CHA']);
  });

  it('adds exactly the two maxima to the prime stats, and nothing else', () => {
    // The structural half, which does not restate the derivation: the extras are these two, they
    // come last, and nothing is repeated.
    expect(ALL_STATS).toHaveLength(PRIME_STATS.length + 2);
    expect(ALL_STATS.filter((stat) => !PRIME_STATS.includes(stat as never))).toEqual(['HP Max', 'MP Max']);
    expect(new Set(ALL_STATS).size).toBe(ALL_STATS.length);
  });

  // `generateEquipUpgrade` branches on these two slots by name to choose which quality table an
  // upgrade is drawn from. Everything else falls through to armour.
  it('opens the equipment slots with Weapon and Shield', () => {
    expect(EQUIP_SLOTS.slice(0, 2)).toEqual(['Weapon', 'Shield']);
  });

  it('declares no monster-modifier table', async () => {
    // MON_MODS was sixteen entries read by nothing, here or in the implementation it descended
    // from, and every one of them was inherited wording. A table nothing calls cannot be justified
    // by fidelity to behaviour it never took part in, so it is gone rather than rewritten. This
    // asserts the absence so it cannot drift back in as a copy.
    const traits = await import('../../data/traits') as Record<string, unknown>;
    expect(Object.keys(traits)).not.toContain('MON_MODS');
  });
});

/**
 * What race and class are worth, held still while their names are free to change.
 *
 * These two tables are the ones nothing pins by content — deliberately, so the vocabulary can be
 * rewritten. But the entries are not only names: each grants stat bonuses at character
 * creation, which this build applies and the original never did. So a rewrite that reaches for a
 * funnier word and takes a different `stats` array with it would rebalance the game, and the only
 * symptom would be characters quietly rolling differently.
 *
 * The counts below are therefore the half that must survive a rename. They say nothing about what
 * anything is called, which is the point: rename freely, and this fails the moment the arithmetic
 * moves with the words.
 *
 * If a rebalance is ever intended, these numbers are meant to be edited in the same commit that
 * causes it — the failure is a question, not a verdict.
 */
describe('what race and class are worth', () => {
  const tally = (table: readonly { readonly stats: readonly string[] }[]) => {
    const perStat: Record<string, number> = {};
    const perWidth: Record<number, number> = {};
    for (const entry of table) {
      for (const stat of entry.stats) perStat[stat] = (perStat[stat] ?? 0) + 1;
      perWidth[entry.stats.length] = (perWidth[entry.stats.length] ?? 0) + 1;
    }
    return { perStat, perWidth };
  };

  it('grants the same spread of race bonuses however the races are named', () => {
    expect(tally(RACES).perStat).toEqual({
      CHA: 2, CON: 5, DEX: 5, 'HP Max': 2, INT: 2, 'MP Max': 2, STR: 4, WIS: 4,
    });
  });

  it('grants the same spread of class bonuses however the classes are named', () => {
    // No HP Max anywhere in this table, which is a real asymmetry with RACES rather than an
    // oversight: constitution is the racial axis and the classes leave it alone.
    expect(tally(KLASSES).perStat).toEqual({
      CHA: 2, CON: 4, DEX: 4, INT: 5, 'MP Max': 1, STR: 3, WIS: 5,
    });
  });

  it('keeps the ratio of one-stat to two-stat entries', () => {
    // The generous entries are the scarce ones, and staying scarce is what keeps a rewrite from
    // making every option a two-stat option because the names happened to suggest it.
    expect(tally(RACES).perWidth).toEqual({ 1: 16, 2: 5 });
    expect(tally(KLASSES).perWidth).toEqual({ 1: 12, 2: 6 });
  });
});

/**
 * Names no shipped string may contain, in one place.
 *
 * There were two of these lists, checked against two different corpora, and they had drifted: eight
 * names were in one only and `kevlar` in the other. Neither covered `MONSTERS` — the largest table
 * in the game at 232 entries, in the most product-adjacent register it has — or `SPELLS`, so the
 * guard passed green over both.
 *
 * Matched as substrings, which is the only tool available and is why the list needs judgement rather
 * than enthusiasm. `meta` is deliberately absent: it is inside `Bare Metal`, a shipped armour name
 * and an ordinary technical term, and a guard that fails on it teaches the next person to weaken the
 * guard. The vendor is caught by `facebook` instead.
 */
/**
 * Strings reviewed and kept, which the substring guard would otherwise reject.
 *
 * Kept deliberately tiny, and each entry carries its reason. An allowlist is the failure mode of a
 * guard like this — it can grow until it swallows the rule — so the bar is that the collision has to
 * be *accidental*, not merely inconvenient.
 */
const REVIEWED_COLLISIONS: readonly [string, string][] = [
  // Ordinary workplace vocabulary for somebody who changes jobs often. The collision with a real
  // computer scientist is a substring accident and the phrase is squarely in this game's register.
  ['job hopper', 'hopper'],
];

const withoutReviewedCollisions = (serialized: string): string =>
  REVIEWED_COLLISIONS.reduce((text, [phrase]) => text.replaceAll(phrase, ''), serialized);

/**
 * Everything a player can read that comes out of the trait tables, in one place.
 *
 * Built once and shared, because the test proving the guard covers these tables built its own copy
 * and therefore proved nothing: dropping `MONSTERS` from the guard left the coverage assertion
 * passing against its private corpus. A guard and its coverage check reading two different arrays is
 * the same defect this file was opened to fix, one level up.
 */
const GUARDED_TRAITS = [...RACES, ...KLASSES, ...MONSTERS, ...SPELLS];

const FORBIDDEN_NAMES: readonly string[] = [
  // Vendors and clouds.
  'aws', 'amazon', 'azure', 'google', 'microsoft', 'oracle', 'ibm', 'apple', 'facebook',
  'nvidia', 'intel', 'salesforce', 'vmware', 'cloudflare', 'datadog', 'atlassian', 'sap',
  // Products and platforms whose names would otherwise fit this register far too well.
  'kubernetes', 'docker', 'terraform', 'jira', 'slack', 'github', 'gitlab', 'jenkins',
  'splunk', 'grafana', 'kafka', 'hadoop', 'postgres', 'mysql', 'redis', 'nginx',
  'systemd', 'ansible', 'databricks', 'snowflake', 'servicenow', 'workday', 'kevlar',
  // Labs and models, on the separate ground that they date the writing.
  'openai', 'anthropic', 'deepmind', 'chatgpt', 'claude', 'gemini', 'copilot', 'llama',
  // People.
  //
  // No exemptions, including the willing kind. The owner's own EverQuest handle came up as the one
  // name that could defensibly ship — consent is not in question for a name that is yours — and the
  // owner was asked directly and declined. Recorded here so it is not raised a third time, and
  // because "the rule holds even where it did not have to" is worth more than the nod would have
  // been: guildmates' twenty-year-old character names and named public figures stay out because
  // they were never asked, and a list with one exception invites a second.
  'turing', 'lovelace', 'mccarthy', 'minsky', 'hopper', 'torvalds', 'stallman', 'ritchie',
];

describe('the compute-industrial trait catalogue', () => {
  // Written in the manner of the social catalogue's own guard. These tables moved from 2002 high
  // fantasy to job titles that should not exist, and the hazard the register brings with it
  // is naming something real: a vendor, a product, a model, or a person. An invented Vermineer is
  // the joke; a real trademark in a shipped table is somebody else's property doing the work.
  const serialized = withoutReviewedCollisions(JSON.stringify(GUARDED_TRAITS).toLowerCase());

  it('names no real vendor, product, model, or person', () => {
    for (const forbidden of FORBIDDEN_NAMES) expect(serialized, `trait tables must not name ${forbidden}`).not.toContain(forbidden);
  });

  it('carries no markup, links, control characters, or bidirectional overrides', () => {
    // These strings reach the DOM as a hero's race and class and are spoken by the screen-reader
    // path, so the same envelope the social catalogue holds applies here.
    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('https://');
    // Scanned as strings rather than as JSON, for the reason the social catalogue's guard now gives:
    // `JSON.stringify` escapes everything below 0x20, so that half of this could never fail.
    for (const { name } of [...RACES, ...KLASSES]) {
      expect(isUnrenderable(name), name).toBe(false);
      expect(name, name).not.toMatch(/[<>]/u);
    }
  });

  it('pluralizes every race into something a quest line can print', () => {
    // transition.ts renders `the <Title> of the <plural race>`. plural() is naive by design, so a
    // race ending in -y or -us would print as "Standbies" or "Nimbi". Asserting the round trip here
    // keeps that a property of the table rather than something noticed in a screenshot.
    for (const { name } of RACES) {
      const plural = pluralize(name);
      expect(plural, `${name} pluralizes to itself`).not.toBe(name);

      // The rules plural() applies that produce nonsense on a name shaped like these. A prefix
      // comparison cannot express this: the previous version dropped the last two characters
      // before comparing, so "Standby" -> "Standbies" and "Nimbus" -> "Nimbi" both passed it, and
      // those are precisely the outputs it was written to forbid. Naming the endings states the
      // constraint directly, and stays true for a name nobody has written yet.
      expect(name.endsWith('y'), `${name} would print as ${plural}`).toBe(false);
      expect(name.endsWith('us'), `${name} would print as ${plural}`).toBe(false);
    }
  });

  it('keeps every name inside the width the loadout and hero banner allow', () => {
    for (const { name } of [...RACES, ...KLASSES]) {
      expect(Array.from(name).length, `${name} is too long to print`).toBeLessThanOrEqual(24);
      expect(name.trim(), `${name} has stray whitespace`).toBe(name);
    }
  });
});

describe('the item vocabulary the generator composes', () => {
  const ITEM_TABLES = {
    WEAPONS, ARMORS, SHIELDS, OFFENSE_ATTRIB, OFFENSE_BAD, DEFENSE_ATTRIB, DEFENSE_BAD,
  } as const;
  const bases = (table: readonly (readonly [string, number])[]) => table.map(([name]) => name);
  const GROUPS = [
    ['weapon', bases(WEAPONS), [...bases(OFFENSE_ATTRIB), ...bases(OFFENSE_BAD)]],
    ['shield', bases(SHIELDS), [...bases(DEFENSE_ATTRIB), ...bases(DEFENSE_BAD)]],
    ['armour', bases(ARMORS), [...bases(DEFENSE_ATTRIB), ...bases(DEFENSE_BAD)]],
  ] as const;

  it('never lets a modifier and a base contain one another', () => {
    // Learned by breaking it. `Chartered` was a defence modifier while `Charter` was an armour
    // base, and every `Chartered <armour>` in the game collapsed onto one fallback tooltip,
    // because resolving a generated name means finding the base inside it. One word being a
    // prefix of another silently destroyed 144 distinct items and nothing named the cause.
    for (const [label, baseNames, modifiers] of GROUPS) {
      for (const modifier of modifiers) {
        for (const base of baseNames) {
          expect(modifier.includes(base), `${label}: modifier "${modifier}" contains base "${base}"`).toBe(false);
          expect(base.includes(modifier), `${label}: base "${base}" contains modifier "${modifier}"`).toBe(false);
        }
      }
    }
  });

  it('never lets one base contain another within a slot group', () => {
    // Same failure in the other direction: `Leaf Mandate` and `Broad Mandate` both resolved to
    // `Mandate` and shared a tooltip.
    for (const [label, baseNames] of GROUPS) {
      for (const outer of baseNames) {
        for (const inner of baseNames) {
          if (outer === inner) continue;
          expect(outer.includes(inner), `${label}: base "${outer}" contains base "${inner}"`).toBe(false);
        }
      }
    }
  });

  it('keeps modifiers short enough that two of them survive the tooltip', () => {
    // itemDetails renders `Its <modifier> file was ...` through boundedLabel(modifier, _, 20), and
    // a generated item can carry two modifiers joined by " and ". A pair over the bound is
    // truncated mid-word, which is how two different items start reading identically.
    for (const table of [
      [...OFFENSE_ATTRIB, ...OFFENSE_BAD],
      [...DEFENSE_ATTRIB, ...DEFENSE_BAD],
    ]) {
      for (const [modifier] of table) {
        expect(Array.from(modifier).length, `${modifier} is too long to pair`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('actually has the tables it claims to guard in front of it', () => {
    // The guard only fails when there is something to catch, so a mutation removing a table from the
    // corpus passes on a clean catalogue — which is exactly how `MONSTERS` and `SPELLS` went
    // uncovered in the first place. This pins the coverage rather than the outcome.
    const corpus = JSON.stringify(GUARDED_TRAITS).toLowerCase();

    expect(corpus, 'races must be in the corpus').toContain(RACES[0]!.name.toLowerCase());
    expect(corpus, 'classes must be in the corpus').toContain(KLASSES[0]!.name.toLowerCase());
    expect(corpus, 'monsters must be in the corpus').toContain(MONSTERS[0]!.name.toLowerCase());
    expect(corpus, 'spells must be in the corpus').toContain(SPELLS[0]!.toLowerCase());
  });

  it('keeps the reviewed-collision list honest', () => {
    // An allowlist is the failure mode of a substring guard: it can grow until it swallows the rule,
    // and an entry naming nothing shipped is a loophole waiting for someone to walk through. Every
    // entry must earn its place by actually colliding with something in the catalogue.
    const everything = JSON.stringify([
      ...GUARDED_TRAITS,
      ...Object.values(ITEM_TABLES).flat(), ...ITEM_ATTRIB, ...ITEM_OFS, ...SPECIALS, ...BORING_ITEMS,
    ]).toLowerCase();

    expect(REVIEWED_COLLISIONS.length, 'a long allowlist is a guard that has given up').toBeLessThanOrEqual(3);
    for (const [phrase, forbidden] of REVIEWED_COLLISIONS) {
      expect(everything, `${phrase} is allowlisted but nothing ships it`).toContain(phrase);
      expect(phrase, `${phrase} must actually collide with ${forbidden}`).toContain(forbidden);
    }
  });

  it('covers the monster prefixes the engine composes, which live outside the data tables', () => {
    // Twenty-two prefixes in `sim.ts` compose with a creature by level difference — `dead`,
    // `comatose`, `foetal`, `Were-`, `messianic` and the rest. They are shipped strings a player
    // reads on every kill, they sit in `src/engine/` rather than `src/data/`, and no content test
    // looked at them at all.
    //
    // Asserted against the same list as everything else, and against the same register rules. They
    // are also the last vocabulary in the game inherited rather than rewritten, which is worth
    // knowing about separately from whether they name anything real.
    // Read from the engine rather than copied. A first version listed them here and compared the
    // list against `sim.ts` as text, which is a guard checking its own copy — the exact shape this
    // file exists to catch. `MONSTER_PREFIXES` is now the one source and the engine composes from it.
    const serialized = withoutReviewedCollisions(JSON.stringify(Object.values(MONSTER_PREFIXES).flat()).toLowerCase());

    for (const forbidden of FORBIDDEN_NAMES) {
      expect(serialized, `monster prefixes must not name ${forbidden}`).not.toContain(forbidden);
    }
    expect(serialized).not.toContain('http');
    expect(serialized).not.toMatch(/[<>\u202a-\u202e\u2066-\u2069]/u);
    // The premise, per group rather than in total: an empty export passes every assertion above, and
    // a total threshold is too loose to notice one group going empty — emptying `remote` left
    // twenty-five prefixes and a passing test.
    for (const [group, words] of Object.entries(MONSTER_PREFIXES)) {
      expect(words.length, `${group} must still have prefixes in it`).toBeGreaterThan(0);
    }
  });

  it('names no real vendor, product, model, or person', () => {
    // The corpus is pinned, not assembled and trusted. This scan is built inline from five sources,
    // and cutting it to `ITEM_ATTRIB` alone leaves the file 83/83 green — so a table dropped from the
    // list silently stops being scanned, which is this file's own documented failure mode on a
    // different corpus. The count below is what makes the omission a failure rather than a shrug.
    const corpus = [...Object.values(ITEM_TABLES).flat(), ...ITEM_ATTRIB, ...ITEM_OFS, ...SPECIALS, ...BORING_ITEMS];

    // Each source is checked against the corpus by name, not by arithmetic over the same expression
    // that built it. A count compared against a sum of the same five terms is a tautology — drop a
    // term from both and it still passes, which is the trap this assertion exists to close rather
    // than to re-enter.
    for (const [label, table] of [
      ['ITEM_TABLES', Object.values(ITEM_TABLES).flat()],
      ['ITEM_ATTRIB', ITEM_ATTRIB],
      ['ITEM_OFS', ITEM_OFS],
      ['SPECIALS', SPECIALS],
      ['BORING_ITEMS', BORING_ITEMS],
    ] as const) {
      expect(table.length, `${label} must not be empty`).toBeGreaterThan(0);
      for (const entry of table) expect(corpus, `${label} must be in the scan`).toContain(entry);
    }

    const serialized = withoutReviewedCollisions(JSON.stringify(corpus).toLowerCase());
    for (const forbidden of FORBIDDEN_NAMES) expect(serialized, `item vocabulary must not name ${forbidden}`).not.toContain(forbidden);
    expect(serialized).not.toContain('http');
    expect(serialized).not.toMatch(/[<>\u202a-\u202e\u2066-\u2069]/u);
  });
});
