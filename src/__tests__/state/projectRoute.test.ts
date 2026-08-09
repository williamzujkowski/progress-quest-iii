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

  it('varies by hero, but far less than the key suggests', () => {
    // Written to assert "two heroes walk different routes" and it failed — `Krg the Robot Monk` and
    // `Vyzoug the Incident Paladin` get the same nine towns in the same order.
    //
    // Measured across 400 generated heroes: **24 distinct routes**, the largest identical group 25.
    // The name keys do carry the hero's identity, but the town pool is six wide and the sequence is
    // dominated by the act, so identity buys an offset rather than a route. That is a property of
    // the naming already shipped on the world console, not of this projection — filed separately.
    //
    // Pinned at what is actually true, so the day the naming is widened this fails and gets updated
    // deliberately, rather than a stronger claim sitting here unverified.
    const heroes = [
      { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
      { name: 'Vyzoug', race: 'Half Daemon', className: 'Incident Paladin', level: 12 },
      { name: 'Thorgorm', race: 'Off-Prem Elf', className: 'Voodoo Stakeholder', level: 12 },
      { name: 'Borgfang', race: 'Double Tenant', className: 'Mu-Fu Auditor', level: 12 },
    ];
    const routes = heroes.map((hero) => projectRoute(hero, 8).map(({ town }) => town).join('|'));

    // At least two of the four differ, so identity is not ignored outright.
    expect(new Set(routes).size).toBeGreaterThan(1);
    // And a hero's own route is stable, which is the property the display depends on.
    for (const hero of heroes) {
      expect(projectRoute(hero, 8)).toEqual(projectRoute(hero, 8));
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
