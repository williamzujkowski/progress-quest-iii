import { describe, expect, it } from 'vitest';
import { DOCKET_LINES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';
import { EMPTY_CASELOAD, type Caseload } from '../../state/caseload';

/**
 * The first thing the institution's own filing cabinet has ever said out loud.
 *
 * `projectAmbient` read three things — hero, task counter, loadout — while the store calling it held
 * `caseload`, `commendations`, `specimens` and a live `roster` on the same line, every one of them a
 * memory that outlives the hero and none of them reaching a word of chat.
 *
 * The caseload goes first because its joke is already set up, by the game, at length: the watcher has
 * been seeing one name go past in the activity log for an hour. The register is reclassification —
 * an adversary quietly moved into the column marked colleague, with the forms filled in accordingly
 * — and never a tally, which the panel already gives better.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;

const caseload = (targets: Record<string, number>): Caseload => ({ ...EMPTY_CASELOAD, targets });

const lanesOf = (memory: Parameters<typeof projectAmbient>[2], tasks = 2000) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task, memory)[0]);

const GNOLL = caseload({ 'Gnoll|2|hide': 31, 'Nit|1|tail': 4 });

describe('the guild says the name on the docket', () => {
  it('reaches the lane, which every assertion below depends on', () => {
    const lanes = new Set(lanesOf({ caseload: GNOLL }).map((entry) => entry?.sceneId.split(':')[2]));
    expect(lanes.has('docket')).toBe(true);
  });

  it('quotes the most-filed target, through the name a reader recognises', () => {
    // The caseload keys on a composite — `Gnoll|2|hide` — that appears on no surface. `displayTarget`
    // is what the quest panel already uses, and a lane quoting the raw key would be the institution
    // reading its own primary key aloud.
    const spoken = lanesOf({ caseload: GNOLL }).filter((entry) => entry?.sceneId.includes(':docket'));
    expect(spoken.length).toBeGreaterThan(0);
    for (const entry of spoken) {
      expect(entry!.text, entry!.text).toContain('Gnoll');
      expect(entry!.text, entry!.text).not.toContain('|');
      expect(entry!.text, entry!.text).not.toContain('{docket}');
    }
  });

  it('names the most-filed target and not merely some target', () => {
    // Two entries, and the runner-up must never be the one cited — otherwise the lane is quoting
    // whichever key the map happened to iterate first, which is an ordering fact rather than an
    // observation about this hero.
    const spoken = lanesOf({ caseload: GNOLL }).filter((entry) => entry?.sceneId.includes(':docket'));
    for (const entry of spoken) expect(entry!.text, entry!.text).not.toContain('Nit');
  });

  it('never states the count, which is the whole difference between a colleague and a tally', () => {
    // `mostLitigated` returns the number and this lane declines it. "Filed against forty times" is a
    // statistic the dossier already gives better; "still no reply" is a person.
    for (const { text } of DOCKET_LINES) {
      expect(text, text).not.toMatch(/\{count\}|\d/);
      expect(text, text).toContain('{docket}');
    }
  });

  it('falls back rather than inventing a party, on an empty caseload and on no caseload at all', () => {
    // Both are ordinary. A fresh roster has filed nothing, and every caller that knows less than the
    // store — which is every test in this suite — passes no memory at all. Falling back rather than
    // falling silent, because a lane producing nothing would quietly lower the rate the cadence was
    // tuned to.
    for (const memory of [{}, { caseload: EMPTY_CASELOAD }, { caseload: caseload({}) }]) {
      const entries = lanesOf(memory);
      expect(entries.filter(Boolean).length, JSON.stringify(memory)).toBeGreaterThan(1500);
      for (const entry of entries) {
        expect(entry?.sceneId, entry?.text).not.toContain(':docket');
        expect(entry?.text, entry?.text).not.toContain('the file');
      }
    }
  });

  it('stays deterministic, because every projection here is asserted byte-stable', () => {
    const once = JSON.stringify(lanesOf({ caseload: GNOLL }, 300));
    const twice = JSON.stringify(lanesOf({ caseload: GNOLL }, 300));
    expect(once).toBe(twice);
  });
});
