import { describe, expect, it } from 'vitest';
import { projectRoute, projectWorld } from '../../state/worldContext';
import type { GamePresentationSnapshot } from '../../engine/transition';

/**
 * The route is recomputed, never remembered — every place name in this game is already a pure
 * function of the hero's identity and an act, so an act the hero finished names its own town on
 * demand. That is what lets a service record exist without a schema change.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 };

const snapshot = (act: number, overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { ...HERO, level: 12 },
  act,
  completedTask: 'kill',
  nextTask: 'buying',
  completedTasks: 40,
  elapsedSeconds: 100,
  ...overrides,
});

describe('where the paperwork has sent the hero', () => {
  it('names every act reached, oldest first, and marks the current one', () => {
    const route = projectRoute(HERO, 4);

    expect(route.map(({ act }) => act)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(route.filter(({ current }) => current).map(({ act }) => act)).toEqual([4]);
  });

  it('leaves the act ahead unnamed', () => {
    // The owner's own suggestion, and the cheaper option: not naming a place preserves the discovery
    // for free, and an institution that has not yet decided where you are going is the register.
    const route = projectRoute(HERO, 3);
    const ahead = route.at(-1)!;

    expect(ahead.act).toBe(4);
    expect(ahead.town).toBeNull();
    expect(ahead.dungeon).toBeNull();
    expect(ahead.raid).toBeNull();
    for (const stop of route.slice(0, -1)) expect(stop.town, `act ${stop.act}`).not.toBeNull();
  });

  it('agrees with the world console about where the hero is standing', () => {
    // The assertion this exists for. Two derivations of one name is how they drift apart, and a
    // route that disagreed with the console about the hero's own town would be worse than no route.
    for (const act of [0, 1, 5, 12]) {
      const consoleName = projectWorld({
        kind: 'transition',
        source: { activityId: 1, record: { event: { type: 'save_requested', characterName: HERO.name }, post: snapshot(act, { nextTask: 'buying' }) } },
      }).context.location;
      const routeTown = projectRoute(HERO, act).find((stop) => stop.current)?.town;

      expect(consoleName, `act ${act}`).toContain(routeTown!);
    }
  });

  it('gives different heroes different routes', () => {
    // This test used to assert the opposite, because the naming used to deserve it: a per-hero index
    // into a six-wide pool meant the act dominated, and two heroes whose keys landed on the same
    // offset agreed at every act for ever. Measured then: 400 heroes, **24 distinct routes**, the
    // largest identical group 25.
    //
    // The pool is now shuffled per hero and the act indexes into the ordering, so the available
    // sequences go from the pool's length to its factorial out of the same vocabulary. Measured
    // now: **312 distinct routes**, largest identical group 3.
    const heroes = [
      { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
      { name: 'Vyzoug', race: 'Half Daemon', className: 'Incident Paladin', level: 12 },
      { name: 'Thorgorm', race: 'Off-Prem Elf', className: 'Voodoo Stakeholder', level: 12 },
      { name: 'Borgfang', race: 'Double Tenant', className: 'Mu-Fu Auditor', level: 12 },
    ];
    const routes = heroes.map((hero) => projectRoute(hero, 8).map(({ town }) => town).join('|'));

    // All four differ, which the previous naming could not manage.
    expect(new Set(routes).size).toBe(heroes.length);
    // And a hero's own route is stable, which is the property the display depends on.
    for (const hero of heroes) expect(projectRoute(hero, 8)).toEqual(projectRoute(hero, 8));
  });

  it('sends one hero to different towns as the acts pass', () => {
    // The other half, and the one a per-hero shuffle could quietly lose: an ordering indexed by act
    // must still advance. A hero who saw the same town in every act would be worse than before.
    const towns = projectRoute({ name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 }, 5)
      .slice(0, -1)
      .map(({ town }) => town);

    expect(new Set(towns).size).toBe(towns.length);
  });

  it('still names a place when the step it is given is unreadable', () => {
    // Field names are indexed by the hero's level, which comes off the sheet and is whatever an
    // imported save said. A negative or non-finite step must land on a real name rather than
    // `undefined`, because this string is printed on the world console every tick.
    const bad = (level: number) => projectWorld({
      kind: 'transition',
      source: {
        activityId: 1,
        record: {
          event: { type: 'save_requested', characterName: HERO.name },
          post: snapshot(3, { hero: { ...HERO, level }, nextTask: 'kill' }),
        },
      },
    }).context.location;

    for (const level of [Number.NaN, Number.POSITIVE_INFINITY, -1, -1000]) {
      const location = bad(level);
      expect(location, String(level)).not.toContain('undefined');
      expect(location.length, String(level)).toBeGreaterThan(1);
    }
  });

  it('stays bounded for a hero deep into the acts', () => {
    // A service record forty acts long would be the longest thing on the page, and the interesting
    // end of it is the recent one.
    const route = projectRoute(HERO, 400);

    expect(route.length).toBeLessThanOrEqual(13);
    expect(route.at(-2)?.act).toBe(400);
    expect(route.at(-1)?.act).toBe(401);
  });

  it('is a pure function, and the same call twice is the same answer', () => {
    expect(JSON.stringify(projectRoute(HERO, 6))).toBe(JSON.stringify(projectRoute(HERO, 6)));
  });

  it('says nothing for an act it cannot read', () => {
    // Reachable from an imported save, where the act is whatever the file said.
    expect(projectRoute(HERO, Number.NaN)).toEqual([]);
    expect(projectRoute(HERO, -1)).toEqual([]);
  });
});
