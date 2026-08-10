import { describe, expect, it } from 'vitest';
import { adversaryDossier, standingFor } from '../../state/adversaryDossier';

describe('adversary standing', () => {
  it('rises with the docket count and never falls', () => {
    let previous = -1;
    const order = ['unfiled', 'known', 'habitual', 'nemesis'];
    for (const dockets of [0, 1, 7, 8, 24, 25, 400]) {
      const rank = order.indexOf(standingFor(dockets));
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
    expect(standingFor(0)).toBe('unfiled');
    expect(standingFor(400)).toBe('nemesis');
  });
});

describe('adversary dossier', () => {
  it('reports nothing when the engine named no target', () => {
    // An unnamed quest has no adversary, and inventing one is a claim this project does not make.
    expect(adversaryDossier(undefined, 4)).toBeNull();
    expect(adversaryDossier('', 4)).toBeNull();
  });

  it('states the count plainly beside the flourish', () => {
    // The joke decorates a fact; it never stands in for one.
    expect(adversaryDossier('Kickoff Meeting', 14)?.summary).toMatch(/^14 dockets on file\. /);
    expect(adversaryDossier('Interim Policy', 1)?.summary).toMatch(/^1 docket on file\. /);
  });

  it('says so rather than reporting a bare zero, and says it once', () => {
    // The tally is absent at zero rather than reading "Nothing previously filed." `standingFor`
    // returns `unfiled` exactly when the count is nought, so that sentence always landed beside an
    // `unfiled` opening — and all three of those already say there is no prior file. The panel read
    // "Nothing previously filed. No prior file. A new folder has been opened with some optimism."
    const summary = adversaryDossier('Nit', 0)!.summary;
    expect(summary).not.toContain('Nothing previously filed');
    // The requirement the tally existed for still holds: no bare zero, and the absence is stated.
    expect(summary).not.toMatch(/\b0\b/);
    expect(summary).toMatch(/no prior file|Unrepresented in the archive|First instance on record/i);
  });

  it('never states the absence twice, whichever opening is drawn', () => {
    // Three openings and a hash that picks between them, so one target proves nothing. Swept, and
    // asserted as a shape rather than against a list of phrasings a future opening would evade.
    const ABSENCE = /\bno prior file\b|\bnothing previously filed\b|\bunrepresented\b|\bfirst instance\b|\bnot on file\b/gi;
    for (const target of ['Nit', 'Kickoff Meeting', 'Interim Policy', 'Green-Screen App', 'Duke', 'fruit fly', 'Gnoll', 'Rat']) {
      const summary = adversaryDossier(target, 0)!.summary;
      expect(summary.match(ABSENCE) ?? [], summary).toHaveLength(1);
    }
  });

  it('holds still for one adversary and differs between them', () => {
    expect(adversaryDossier('Kickoff Meeting', 14)).toEqual(adversaryDossier('Kickoff Meeting', 14));
    const summaries = new Set(
      ['Kickoff Meeting', 'Interim Policy', 'Green-Screen App', 'fruit fly', 'Duke'].map((t) => adversaryDossier(t, 14)?.summary),
    );
    expect(summaries.size).toBeGreaterThan(1);
  });

  it('refuses a count that is not a count', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const dossier = adversaryDossier('Kickoff Meeting', bad);
      expect(dossier?.dockets).toBe(0);
      // Same as a genuine zero: the opening carries it, and no bare figure appears.
      expect(dossier?.summary).not.toMatch(/\b0\b|NaN|Infinity/);
      expect(dossier?.summary).toMatch(/no prior file|Unrepresented in the archive|First instance on record/i);
    }
    // A fractional count is floored rather than rendered with a decimal point.
    expect(adversaryDossier('Kickoff Meeting', 3.7)?.dockets).toBe(3);
  });

  it('never implies the adversary is more dangerous for being familiar', () => {
    // CONTEXT.md's bar: encounter time depends on opponent puissance and character level only.
    // A long history must not read as a threat rating.
    const forbidden = /danger|tough|stronger|harder|weaker|damage|resist|threat level/i;
    for (const dockets of [0, 1, 8, 25, 500]) {
      expect(adversaryDossier('Kickoff Meeting', dockets)!.summary).not.toMatch(forbidden);
    }
  });
});
