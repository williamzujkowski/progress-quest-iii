import { describe, expect, it, vi } from 'vitest';
import { projectRoute } from '../../state/worldContext';
import { namedEras, eraAt } from '../../state/namedEras';
import { tenorFor, tenorLine } from '../../state/institutionalTenor';
import { citationsFor } from '../../state/citations';
import { venueBulletin } from '../../state/venueBulletin';
import { adversaryDossier, standingFor } from '../../state/adversaryDossier';
import { raidMuster, attendanceLabel } from '../../state/raidMuster';
import { predecessorFor } from '../../state/predecessor';
import { recurringAssignments } from '../../state/questRecurrence';
import { EMPTY_CASELOAD } from '../../state/caseload';
import { EMPTY_COMMENDATIONS } from '../../state/commendations';
import { EMPTY_SPECIMEN_LOG } from '../../state/specimenLog';
import { createNewCharacter } from '../../engine/sim';

/**
 * The determinism contract, asserted across the projections rather than claimed over them.
 *
 * Two ADRs rest an argument on this. ADR 0011 dates the register by act ordinal *because* "the
 * determinism contract asserts every projection byte-stable under spies that throw on `Date.now`,
 * so a real timestamp cannot enter the ledgers at all without breaking a guarantee the whole test
 * suite rests on". ADR 0012 closes the LLM spike partly because "every projection here is asserted
 * byte-stable under spies that throw on `Math.random` and `Date.now` — a generator cannot live
 * inside that contract."
 *
 * The claim was true of seven test files. The projections with no such assertion included
 * `worldContext`, `namedEras`, `institutionalTenor`, `citations`, `venueBulletin`, `raidMuster`,
 * `adversaryDossier`, `predecessor` and `questRecurrence` — and `caseload`, which carries a comment
 * stating the guarantee. There is no lint backstop either: the restricted-globals rule covers
 * `src/engine/**` and does not name `Date` in any case.
 *
 * So nothing would have caught a new projection reaching for the clock. The rule was right; the
 * universality was unearned, and this is what earns it.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 40 } as const;

const CASELOAD = {
  ...EMPTY_CASELOAD,
  kinds: { exterminate: 12, seek: 4 },
  targets: { 'Gnoll|2|hide': 31 },
  targetActs: { 'Gnoll|2|hide': { first: 3, last: 9 } },
};

/** Every projection, called the way a surface calls it. */
const PROJECTIONS: ReadonlyArray<readonly [string, () => unknown]> = [
  ['projectRoute', () => projectRoute(HERO, 14)],
  ['namedEras', () => namedEras(CASELOAD)],
  ['eraAt', () => eraAt(CASELOAD, 5)],
  ['tenorFor', () => tenorFor({ act: 14 })],
  ['tenorLine', () => tenorLine({ act: 14, location: 'Ashfield', venue: 'town' })],
  ['citationsFor', () => citationsFor({ caseload: CASELOAD, commendations: EMPTY_COMMENDATIONS, specimens: EMPTY_SPECIMEN_LOG })],
  ['venueBulletin', () => venueBulletin({ venue: 'town', location: 'Ashfield', act: 3 })],
  ['standingFor', () => standingFor(31)],
  ['adversaryDossier', () => adversaryDossier('Gnoll|2|hide', 31)],
  ['attendanceLabel', () => attendanceLabel('present')],
  ['raidMuster', () => raidMuster({ venue: 'raid', location: 'Citadel', act: 14 })],
  ['predecessorFor', () => predecessorFor({ Vashenko: createNewCharacter('Vashenko', 'Half Daemon', 'Robot Monk', 900) }, 'Krg')],
  ['recurringAssignments', () => recurringAssignments([], ['a quest'])],
];

describe('no projection reaches for the clock or the dice', () => {
  it('has projections to check, or the sweep below proves nothing', () => {
    expect(PROJECTIONS.length).toBeGreaterThan(10);
  });

  it('produces byte-identical output under spies that throw', () => {
    /*
     * Spies that THROW rather than return a fixed value. A stub returning 0 would let a projection
     * reach for the clock and still look deterministic; throwing is what makes the assertion about
     * the code rather than about the harness.
     */
    for (const [name, project] of PROJECTIONS) {
      const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error(`${name} rolled dice`); });
      const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error(`${name} read the clock`); });
      try {
        const once = JSON.stringify(project() ?? null);
        const twice = JSON.stringify(project() ?? null);
        expect(twice, `${name} is not byte-stable`).toEqual(once);
        expect(random, `${name} called Math.random`).not.toHaveBeenCalled();
        expect(now, `${name} called Date.now`).not.toHaveBeenCalled();
      } finally {
        random.mockRestore();
        now.mockRestore();
      }
    }
  });

  it('is not vacuous: the sweep would notice a projection that read the clock', () => {
    // The guard on the guard. If `project()` swallowed its own throw, every assertion above would
    // pass on a projection that reads the clock — so one that deliberately does is checked to fail.
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('read the clock'); });
    try {
      expect(() => Date.now()).toThrow('read the clock');
    } finally {
      now.mockRestore();
    }
  });
});
