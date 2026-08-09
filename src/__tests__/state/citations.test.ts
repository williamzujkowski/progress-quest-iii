import { describe, expect, it } from 'vitest';
import { CITATION_IDS, CITATION_THRESHOLDS, citationsFor, type CitationLedgers } from '../../state/citations';
import { EMPTY_COMMENDATIONS } from '../../state/commendations';
import { EMPTY_CASELOAD, QUEST_KINDS } from '../../state/caseload';
import { EMPTY_SPECIMEN_LOG } from '../../state/specimenLog';
import { EQUIP_SLOTS } from '../../data/traits';

/**
 * Achievements over ledgers that already exist, under the criterion the backlog took from
 * `loadoutFiling.ts`: the moment a set reads as something to pursue, the joke becomes a spreadsheet
 * the player is forbidden to fill in.
 */

const EMPTY: CitationLedgers = {
  commendations: EMPTY_COMMENDATIONS,
  caseload: EMPTY_CASELOAD,
  specimens: EMPTY_SPECIMEN_LOG,
};

/** A record with everything at once, so a rule that never holds shows up as a gap. */
const EVERYTHING: CitationLedgers = {
  commendations: {
    highestLevel: 40,
    largestSale: 9_000,
    questsCompleted: 500,
    actsCompleted: 12,
    exhibit: Object.fromEntries(EQUIP_SLOTS.map((slot, index) => [
      slot,
      { name: `Exhibit ${slot}`, label: index === 0 ? 'legendary' : 'notable', quality: 10 + index },
    ])),
  },
  caseload: {
    kinds: Object.fromEntries(QUEST_KINDS.map((kind) => [kind, 20])),
    targets: { 'A Recurring Matter': 40 },
    // Dated, because a real ledger is. No citation reads the register — a citation states that
    // something happened, and the register states when, which is the next child epic's business.
    targetActs: { 'A Recurring Matter': { first: 2, last: 9 } },
  },
  specimens: { specimens: Array.from({ length: 300 }, (_unused, index) => `item:Specimen ${index}`) },
};

describe('citations only ever state what already holds', () => {
  it('says nothing at all about a record with nothing in it', () => {
    // Not "eight locked entries". Nothing.
    expect(citationsFor(EMPTY)).toEqual([]);
  });

  it('produces no flag, count or denominator a surface could render as a target', () => {
    // The shape is the safeguard. A rule returning `{ earned: false }` would let any future panel
    // grey it out and turn the bank into a checklist without anybody deciding to, so the unearned
    // ones do not leave this module at all.
    for (const citation of citationsFor(EVERYTHING)) {
      expect(Object.keys(citation).toSorted()).toEqual(['id', 'note', 'title']);
      expect(citation.note, citation.id).not.toMatch(/\bof \d|\d+\s*\/\s*\d|remaining|progress|unlock|complete the/i);
    }
  });

  it('is reachable in full, so no rule is dead', () => {
    // A rule nobody can satisfy is worse than no rule: it is a citation the record can never
    // support, which is exactly the unattainable target this design exists to avoid.
    expect(citationsFor(EVERYTHING).map(({ id }) => id)).toEqual([...CITATION_IDS]);
  });
});

describe('a citation cannot be lost', () => {
  it('holds under every single-figure increase from every state that earned it', () => {
    // Monotonicity is what makes these statements about the past rather than a status to protect.
    // The ledgers only grow — every figure is a maximum or a count — so the check is that no growth
    // anywhere retracts a citation that already held.
    const grow: ReadonlyArray<(ledgers: CitationLedgers) => CitationLedgers> = [
      (l) => ({ ...l, commendations: { ...l.commendations, highestLevel: l.commendations.highestLevel + 1 } }),
      (l) => ({ ...l, commendations: { ...l.commendations, largestSale: l.commendations.largestSale + 400 } }),
      (l) => ({ ...l, commendations: { ...l.commendations, actsCompleted: l.commendations.actsCompleted + 1 } }),
      (l) => ({ ...l, commendations: { ...l.commendations, questsCompleted: l.commendations.questsCompleted + 1 } }),
      (l) => ({
        ...l,
        commendations: {
          ...l.commendations,
          exhibit: { ...l.commendations.exhibit, [EQUIP_SLOTS[Object.keys(l.commendations.exhibit).length % EQUIP_SLOTS.length] as string]: { name: 'Grown', label: 'legendary', quality: 99 } },
        },
      }),
      (l) => ({
        ...l,
        caseload: { ...l.caseload, kinds: Object.fromEntries(QUEST_KINDS.map((kind) => [kind, (l.caseload.kinds[kind] ?? 0) + 1])) },
      }),
      (l) => ({ ...l, caseload: { ...l.caseload, targets: { ...l.caseload.targets, 'A Recurring Matter': (l.caseload.targets['A Recurring Matter'] ?? 0) + 1 } } }),
      (l) => ({ ...l, specimens: { specimens: [...l.specimens.specimens, `item:Grown ${l.specimens.specimens.length}`] } }),
    ];

    let ledgers = EMPTY;
    let held = new Set<string>();
    let everHeld = false;

    // Two hundred rounds of one arbitrary increase each, which is enough to walk from nothing to
    // every citation and past it.
    for (let round = 0; round < 200; round += 1) {
      ledgers = (grow[round % grow.length] as (l: CitationLedgers) => CitationLedgers)(ledgers);
      const now = new Set(citationsFor(ledgers).map(({ id }) => id));
      for (const id of held) expect(now.has(id), `${id} was retracted at round ${round}`).toBe(true);
      held = now;
      if (held.size > 0) everHeld = true;
    }

    // The premise: a walk that never earned anything would make the loop above vacuous, and an
    // earlier draft of this test did exactly that because it only ever grew `questsCompleted`.
    expect(everHeld, 'the walk has to actually earn citations').toBe(true);
    expect(held.size, 'and end up holding several').toBeGreaterThan(2);
  });

  it('comes out in filing order, whichever ones hold', () => {
    // A list that reordered itself as it grew would read as a ranking, and a ranking is a thing to
    // climb. Asserted against the declared order directly rather than by comparing two records for
    // a shared subsequence — that weaker form passed under alphabetical sorting, under reversal, and
    // under anything else applying a fixed order, so it was pinning nothing.
    for (const ledgers of [EVERYTHING, { ...EVERYTHING, commendations: { ...EVERYTHING.commendations, highestLevel: 0, largestSale: 0 } }]) {
      const ids = citationsFor(ledgers).map(({ id }) => id);
      expect(ids).toEqual(CITATION_IDS.filter((id) => ids.includes(id)));
    }
  });
});

describe('a citation claims only what its ledger models', () => {
  it('does not say a legendary was superseded, because the exhibit cannot record that', () => {
    // `mergeExhibit` keeps the maximum quality each slot has ever held, ties keeping the incumbent.
    // A legendary in the case is therefore the best that slot has seen and nothing displaced it —
    // and it may still be equipped, so "survives in the exhibit case and nowhere else" was false
    // twice over.
    const said = citationsFor(EVERYTHING).find(({ id }) => id === 'item-of-record')?.note ?? '';

    expect(said, 'the citation must be reachable').not.toBe('');
    expect(said).not.toMatch(/superseded|replaced by|nowhere else/i);
    expect(said).toMatch(/equalled and never beaten/);
  });

  it('does not say a specimen was held exactly once, because nothing counts', () => {
    // `specimenLog` is explicit: quantity and time are not identity, and `mergeSpecimens` is a set
    // insert storing no counts. "At least once" is the whole of what the ledger knows, and repeat
    // drops make "exactly once" usually false as well as unsupportable.
    const said = citationsFor(EVERYTHING).find(({ id }) => id === 'extensive-sampling')?.note ?? '';

    expect(said, 'the citation must be reachable').not.toBe('');
    expect(said).not.toMatch(/exactly once/i);
    expect(said).toMatch(/at least once/i);
  });

  it('states no frequency anywhere, since no ledger behind these records one', () => {
    // The class rather than the two sites. Commendations hold maxima, the caseload holds totals and
    // act ordinals, the specimen log holds identities — none of them stores how often, so no
    // citation may imply it.
    for (const { id, note } of citationsFor(EVERYTHING)) {
      expect(note, id).not.toMatch(/\bexactly \w+ times?\b|\bonly once\b|\bnever again\b|\beach time\b/i);
    }
  });
});

describe('the thresholds do not read as targets', () => {
  it('sits on no round number', () => {
    // A round threshold reads as a figure somebody set for the player to reach; an odd one reads as
    // the point at which somebody happened to notice. The number is never rendered, so this is the
    // only thing keeping that distinction honest — which is why the rules read their thresholds from
    // an exported constant rather than inlining them where a test could only restate them.
    expect(CITATION_THRESHOLDS.length).toBeGreaterThan(3);
    for (const threshold of CITATION_THRESHOLDS) {
      expect(threshold % 5, `${threshold} is a round target`).not.toBe(0);
      expect(threshold % 10, `${threshold} is a round target`).not.toBe(0);
    }
  });

  it('states no figure in any note', () => {
    // "Five acts concluded" would pin the citation to its own threshold, which is a target restated
    // as a boast. The notes say "several" on purpose.
    for (const { id, note } of citationsFor(EVERYTHING)) expect(note, id).not.toMatch(/\d/);
  });
});
