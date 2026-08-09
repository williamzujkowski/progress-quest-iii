import { describe, expect, it } from 'vitest';
import { MAX_NAMED_ERAS, eraAt, namedEras } from '../../state/namedEras';
import { EMPTY_CASELOAD, type Caseload } from '../../state/caseload';
import { tenorFor } from '../../state/institutionalTenor';

/**
 * What the file calls its own periods.
 *
 * The complaint this answers is that `institutionalTenor` escalates on the act and nothing else, so
 * every save passes through the same six tiers at the same six moments. The dated register is where
 * one run differs from another, and a matter that recurred across several acts is what those acts
 * were about.
 */

const filed = (targets: Record<string, [count: number, first: number, last: number]>): Caseload => ({
  ...EMPTY_CASELOAD,
  targets: Object.fromEntries(Object.entries(targets).map(([target, [count]]) => [target, count])),
  targetActs: Object.fromEntries(Object.entries(targets).map(([target, [, first, last]]) => [target, { first, last }])),
});

describe('an era is the register with a name attached', () => {
  it('states the file’s own two figures', () => {
    const [era] = namedEras(filed({ 'Gnoll|2|collar': [14, 3, 7] }));

    expect(era).toEqual({ name: 'Gnoll', first: 3, last: 7, phrase: 'the Gnoll years, Acts 3 through 7' });
  });

  it('names nothing for a matter confined to one act', () => {
    // One act is a period the way one day is an era. The register already states the date; what it
    // does not support is a name.
    expect(namedEras(filed({ Imp: [40, 4, 4] }))).toEqual([]);
    expect(namedEras(filed({ Imp: [40, 4, 5] })).length).toBe(1);
  });

  it('prefers the longest period, then the most filed', () => {
    const eras = namedEras(filed({
      Brief: [90, 1, 3],
      Long: [2, 1, 9],
      Middling: [5, 1, 6],
    }));

    expect(eras.map(({ name }) => name)).toEqual(['Long', 'Middling', 'Brief']);
  });

  it('names no more than a handful', () => {
    const many = filed(Object.fromEntries(
      Array.from({ length: 20 }, (_unused, index) => [`Matter ${index}`, [10, 1, index + 3] as [number, number, number]]),
    ));

    expect(namedEras(many)).toHaveLength(MAX_NAMED_ERAS);
  });

  it('says nothing at all about a ledger with no register', () => {
    // Every ledger written before the dated register is one of these: counts, no spans.
    expect(namedEras({ ...EMPTY_CASELOAD, targets: { Gnoll: 40 } })).toEqual([]);
  });
});

describe('the file describes its periods without addressing anyone', () => {
  it('uses no second person', () => {
    // ADR 0011. The register is global, so an act ordinal in it may belong to a character retired
    // several heroes ago — the file may name its own periods and may not tell the reader they
    // lived through them.
    for (const era of namedEras(filed({ Gnoll: [14, 3, 7], Kobold: [9, 2, 8] }))) {
      expect(era.phrase.toLowerCase(), era.phrase).not.toMatch(/\byou\b|\byour\b|\bwe\b|\bour\b/);
    }
  });

  it('does not rank, conclude, or claim one era followed another', () => {
    // Two matters recurring over the same acts is the ordinary case, not a conflict to resolve. A
    // phrase implying succession would be asserting a shape the register cannot support.
    const said = namedEras(filed({ Gnoll: [14, 3, 7], Kobold: [9, 3, 7] })).map(({ phrase }) => phrase).join(' | ');

    expect(said.toLowerCase()).not.toMatch(/\bthen\b|\bafter\b|\bfollowed\b|\bfirst\b|\bfinally\b|\bgreatest\b|\bmost important\b/);
  });
});

describe('the current period', () => {
  it('is the era the act falls inside', () => {
    const caseload = filed({ Gnoll: [14, 3, 7] });

    expect(eraAt(caseload, 5)?.name).toBe('Gnoll');
    expect(eraAt(caseload, 3)?.name).toBe('Gnoll');
    expect(eraAt(caseload, 7)?.name).toBe('Gnoll');
    expect(eraAt(caseload, 8)).toBeNull();
  });

  it('holds still where two eras overlap, rather than flickering', () => {
    // Eras overlap by nature, so "the current one" has to be decided by something that does not move
    // between consecutive quests. The longest wins: picking the most recently filed would rename the
    // period every time the other matter came up.
    const caseload = filed({ Long: [2, 1, 9], Short: [90, 4, 6] });

    for (const act of [4, 5, 6]) expect(eraAt(caseload, act)?.name, `act ${act}`).toBe('Long');
  });

  it('differs between two runs where the tenor cannot', () => {
    // The whole point. `tenorFor` is a function of the act, so two saves at the same act are
    // identical there and always will be; the register is where they differ.
    const one = filed({ Gnoll: [14, 2, 9] });
    const other = filed({ Kobold: [11, 2, 9] });

    expect(tenorFor({ act: 5 })).toBe(tenorFor({ act: 5 }));
    expect(eraAt(one, 5)?.phrase).not.toBe(eraAt(other, 5)?.phrase);
  });
});
