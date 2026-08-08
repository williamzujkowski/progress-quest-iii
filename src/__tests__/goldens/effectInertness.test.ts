import { describe, expect, it } from 'vitest';
import { encounterSpeedMultiplier, loadoutQuality } from '../../engine/loadout';
import { storageAllowance } from '../../engine/storage';
import { marketFavour } from '../../engine/marketFavour';
import { clawbackPerMille } from '../../engine/clawback';
import { bulkStacks } from '../../engine/bulkDisposal';
import { hagglingFavour, nimbleStacks } from '../../engine/heroAptitude';
import { createNewCharacter } from '../../engine/sim';
import { RandomGenerator } from '../../engine/prng';
import type { CharacterSheet, StatsMap } from '../../engine/types';

/**
 * The guard ADR 0010 promises: every engine effect derived from a loadout, a stat or a spell must
 * return its identity at the state the recordings are in.
 *
 * The recordings cannot be re-recorded. So an effect that forgets this should fail *here*, naming
 * itself, rather than as an unexplained diff in a fixture nobody can regenerate. ADR 0008 got its
 * reasoning wrong twice by argument; this replaces the argument with an assertion.
 *
 * The effect list below is maintained by hand — nothing can enumerate "every effect" — which makes
 * it exactly the kind of guard that quietly covers less than it claims. Two things push back on
 * that: the fixture state is read from the fixtures themselves rather than restated here, and it is
 * asserted to still be what this file expects.
 */

/**
 * Every recording, imported rather than walked.
 *
 * `import.meta.glob` with `eager` resolves at build time, so a fixture added to the directory is
 * picked up without anyone remembering to list it — which is the property that matters, since the
 * premise asserted below is about *all* the recordings.
 */
const FIXTURES = import.meta.glob('../fixtures/goldens/**/*.json', { eager: true }) as Record<string, { default: unknown }>;

interface FixtureShape {
  input?: { sheet?: { Equips?: Record<string, string>; Stats?: Record<string, number> } };
  expected?: { equipment?: [string, string][]; spells?: [string, string, number][]; task?: { tag?: string } };
}

const fixtures = (): FixtureShape[] => Object.values(FIXTURES).map((module) => module.default as FixtureShape);

function readFixtureState(): { equipment: Record<string, Set<string>>; stats: Set<number>; spells: Set<string> } {
  const equipment: Record<string, Set<string>> = {};
  const stats = new Set<number>();
  const spells = new Set<string>();

  for (const fixture of fixtures()) {
    for (const [slot, name] of Object.entries(fixture.input?.sheet?.Equips ?? {})) {
      (equipment[slot] ??= new Set()).add(name);
    }
    for (const [slot, name] of fixture.expected?.equipment ?? []) {
      (equipment[slot] ??= new Set()).add(name);
    }
    for (const value of Object.values(fixture.input?.sheet?.Stats ?? {})) stats.add(value);
    for (const [name, , rank] of fixture.expected?.spells ?? []) spells.add(`${name}:${rank}`);
  }
  return { equipment, stats, spells };
}

const ordinaryStats = (): StatsMap => {
  const character = createNewCharacter('Inert', 'Half Daemon', 'Robot Monk', new RandomGenerator('inert'));
  return Object.fromEntries(Object.keys(character.Stats).map((stat) => [stat, 10])) as StatsMap;
};

/**
 * The loadout every fixture *starts* in. This is the one ADR 0008's rule is about.
 */
const inputLoadout = (): CharacterSheet['Equip'] => ({ ...emptyLoadout(), Weapon: 'Sharp Rock', Hauberk: '-3 Boilerplate' });

/**
 * The widest loadout any fixture ever reaches, including the two items gained mid-transition.
 *
 * Note what this is *not*: no single fixture is ever in this state. `Lanyard` arrives in
 * `act-transition.json` and `Framework` in the two `purchase-exit-price` fixtures, and no fixture
 * gains both. It is the union, and it is the conservative thing for a slot-keyed effect to be inert
 * at, because such an effect does not care which fixture it is in.
 */
const widestLoadout = (): CharacterSheet['Equip'] =>
  ({ ...inputLoadout(), Helm: 'Lanyard', Gauntlets: 'Framework' });

const emptyLoadout = (): CharacterSheet['Equip'] => {
  const character = createNewCharacter('Inert', 'Half Daemon', 'Robot Monk', new RandomGenerator('inert'));
  return Object.fromEntries(Object.keys(character.Equip).map((slot) => [slot, ''])) as CharacterSheet['Equip'];
};

const qualityOf = (equip: CharacterSheet['Equip']): number =>
  loadoutQuality({ ...createNewCharacter('I', 'Half Daemon', 'Robot Monk', new RandomGenerator('i')), Equip: equip });

describe('the state the recordings are actually in', () => {
  it('is still four equipment strings, all stats at ten, and two rank-one spells', () => {
    // The premise every assertion below rests on. Read from the fixtures rather than restated, so a
    // recording that ever changed shape fails here with an explanation instead of quietly widening
    // what the guard beneath it is checking.
    const { equipment, stats, spells } = readFixtureState();

    const worn = new Set(Object.values(equipment).flatMap((names) => [...names]).filter(Boolean));
    expect([...worn].sort()).toEqual(['-3 Boilerplate', 'Framework', 'Lanyard', 'Sharp Rock']);
    expect([...stats]).toEqual([10]);
    expect([...spells].sort()).toEqual(['Quick Win:1', 'Wet Signature:1']);

    // The seven slots the structural half of ADR 0010's licence depends on.
    for (const slot of ['Shield', 'Brassairts', 'Vambraces', 'Gambeson', 'Cuisses', 'Greaves', 'Sollerets']) {
      expect([...(equipment[slot] ?? [])].filter(Boolean), `${slot} must never be equipped`).toEqual([]);
    }
  });

  it('never both hands the hero equipment and prices a kill in the same transition', () => {
    // The property ADR 0008's rule actually rests on, and it is sharper than the rule as written.
    //
    // "Inert at `loadoutQuality === 0`" is true of the loadout every fixture starts in. It is *not*
    // true once `Lanyard` or `Framework` arrives: those total 1 and 5, so the multiplier at the
    // widest loadout is 0.994, not 1. The recordings survive anyway because the two sets are
    // disjoint — every fixture that gains equipment ends on a cinematic, a market walk or a purchase,
    // and every fixture that pins a kill duration is still in the starting loadout when it does.
    //
    // That disjointness is load-bearing and nothing else asserts it, so a fixture that ever both
    // gained an item and priced a kill would silently invalidate the licence.
    for (const fixture of fixtures()) {
      const gained = (fixture.expected?.equipment ?? [])
        .filter(([slot, name]) => name && name !== fixture.input?.sheet?.Equips?.[slot]);
      if (gained.length === 0) continue;
      expect(fixture.expected?.task?.tag ?? '', `gained ${JSON.stringify(gained)}`).not.toMatch(/^kill\|/);
    }
  });
});

describe('every engine effect is inert at that state', () => {
  const input = inputLoadout();
  const widest = widestLoadout();
  const stats = ordinaryStats();

  // One entry per effect. Adding an effect without adding it here is the failure this cannot catch,
  // which is why ADR 0010 names this list as the thing to extend.
  //
  // `widestInert` records whether the effect is also the identity once the two mid-transition items
  // arrive. Every slot-keyed effect is, because none of them reads Helm or Gauntlets. The encounter
  // multiplier is not, and that is not a defect — it is why the disjointness asserted above is the
  // thing holding ADR 0008 up.
  const effects: [name: string, at: (equip: CharacterSheet['Equip']) => number, identity: number, widestInert: boolean][] = [
    ['encounterSpeedMultiplier (ADR 0008)', (equip) => encounterSpeedMultiplier(qualityOf(equip)), 1, false],
    ['storageAllowance — carrying capacity', storageAllowance, 0, true],
    ['marketFavour — terms at market', marketFavour, 1, true],
    ['clawbackPerMille — second drop', clawbackPerMille, 0, true],
    ['bulkStacks — stacks cleared per second', bulkStacks, 1, true],
    ['nimbleStacks — extra stacks from DEX', () => nimbleStacks(stats), 0, true],
    ['hagglingFavour — margin from CHA', () => hagglingFavour(stats), 1, true],
  ];

  for (const [name, at, identity, widestInert] of effects) {
    it(`${name} returns its identity in the starting loadout`, () => {
      expect(at(input)).toBe(identity);
    });

    it(`${name} ${widestInert ? 'is also inert' : 'is deliberately not inert'} once the gained items arrive`, () => {
      // Asserted in both directions. Recording that the encounter multiplier stops being the
      // identity here is the point: it is the one effect whose safety rests on which task the
      // fixture ends on rather than on the arithmetic.
      if (widestInert) expect(at(widest)).toBe(identity);
      else expect(at(widest)).not.toBe(identity);
    });
  }

  it('checks every effect the engine currently has', () => {
    // A count, so that deleting an entry to make a failure go away is itself a failure. The number
    // moves deliberately, in the same commit that adds or removes an effect.
    expect(effects).toHaveLength(7);
  });
});
