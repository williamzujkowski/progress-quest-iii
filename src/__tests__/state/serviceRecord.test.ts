import { describe, expect, it, vi } from 'vitest';
import { MAX_RECORD_LINES, projectServiceRecord, type ServiceRecordInput } from '../../state/serviceRecord';
import { EMPTY_CASELOAD, QUEST_KINDS } from '../../state/caseload';
import { EMPTY_COMMENDATIONS } from '../../state/commendations';
import { EQUIP_SLOTS } from '../../data/traits';
import { createNewCharacter } from '../../engine/sim';

const predecessorSheet = createNewCharacter('Bendrel', 'Double Tenant', 'Incident Paladin', 'bendrel-seed');

/**
 * The service record — the history epic's headline, and the only one of its nine ideas that was
 * genuinely new. Nothing in it is new information: the route, the caseload, the dated register and
 * the commendation ledger are all already on the page. What is new is that they are one document in
 * one voice, which declines to conclude anything from them.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 };

const input = (overrides: Partial<ServiceRecordInput> = {}): ServiceRecordInput => ({
  hero: HERO,
  act: 5,
  caseload: EMPTY_CASELOAD,
  commendations: EMPTY_COMMENDATIONS,
  specimenCount: 0,
  ...overrides,
});

const FULL = input({
  caseload: {
    kinds: { exterminate: 41, placate: 3 },
    targets: { 'Gnoll|2|collar': 14, Imp: 2 },
    targetActs: { 'Gnoll|2|collar': { first: 2, last: 7 } },
  },
  commendations: {
    highestLevel: 23,
    largestSale: 1_400,
    questsCompleted: 120,
    actsCompleted: 5,
    exhibit: Object.fromEntries(EQUIP_SLOTS.slice(0, 3).map((slot) => [slot, { name: `Exhibit ${slot}`, label: 'notable', quality: 12 }])),
  },
  specimenCount: 88,
});

const allLines = (record: NonNullable<ReturnType<typeof projectServiceRecord>>) =>
  record.sections.flatMap(({ lines }) => lines);

describe('the document is written about somebody, never to them', () => {
  it('uses no second person anywhere, including the closing', () => {
    // ADR 0011 requires this of dated lines, because the ledgers are global and an act ordinal in
    // them may belong to a character retired several heroes ago. The document takes the stricter
    // form throughout: a service record that said "you" would be a letter, and this institution does
    // not write letters.
    const record = projectServiceRecord(FULL);
    const said = [record!.subject, ...allLines(record!), record!.closing].join(' ').toLowerCase();

    expect(said).not.toMatch(/\byou\b|\byour\b|\byours\b|\bwe\b|\bour\b|\bus\b/);
  });

  it('names its subject in the third person', () => {
    expect(projectServiceRecord(FULL)!.subject).toBe('Krg, Sub-Subprocessor Robot Monk, level 12');
  });

  it('draws no conclusion, which is the document', () => {
    expect(projectServiceRecord(FULL)!.closing).toContain('No conclusion is drawn');
  });
});

describe('the document reports only what it was handed', () => {
  it('quotes the ledgers rather than recomputing them', () => {
    const said = allLines(projectServiceRecord(FULL)!).join(' | ');

    expect(said).toContain('41');
    expect(said).toContain('14');
    expect(said).toContain('1400');
    expect(said).toContain('88');
    // The register's own sentence, not a second derivation of it.
    expect(said).toContain('The file opens in Act 2 and last records this in Act 7.');
  });

  it('states that the exhibit bore on nothing', () => {
    // `worldContext` classifies equipment as prestige and CONTEXT.md is explicit that it makes no
    // combat contribution. A document listing the exhibit without saying so lets the reader infer a
    // mechanic that does not exist, which is the one thing every derived surface here avoids.
    expect(allLines(projectServiceRecord(FULL)!).join(' ')).toMatch(/bore on the outcome of anything/);
  });

  it('reaches for no clock and no randomness', () => {
    // The determinism contract, applied to a document rather than a projection. Spies that throw
    // rather than stub, so a reach is a failure rather than a different answer.
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Date.now'); });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random'); });
    try {
      expect(projectServiceRecord(FULL)).toEqual(projectServiceRecord(FULL));
    } finally {
      now.mockRestore();
      random.mockRestore();
    }
  });
});

describe('the document omits rather than reporting a zero', () => {
  it('is absent entirely when the file holds nothing', () => {
    // An empty service record is a form, and a form is not a document.
    expect(projectServiceRecord(input({ act: 0, hero: { ...HERO, level: 1 } }))).toBeNull();
  });

  it('drops a section with nothing in it rather than heading an empty one', () => {
    const record = projectServiceRecord(input({ caseload: { kinds: { fetch: 2 }, targets: {}, targetActs: {} } }))!;
    const headings = record.sections.map(({ heading }) => heading);

    expect(headings).toContain('Casework');
    // No litigated target, so no register section — rather than a register heading over nothing.
    expect(headings).not.toContain('The Register');
    expect(headings).not.toContain('Standing');
    for (const section of record.sections) expect(section.lines.length, section.heading).toBeGreaterThan(0);
  });

  it('lists no posting for an act nobody has reached', () => {
    // `projectRoute` names the act ahead as pending on purpose, because a list that simply stopped
    // would read as the end of the game. A document has no such problem and must not borrow it: a
    // posting nobody has taken up is a posting that did not happen.
    const record = projectServiceRecord(input({ act: 3 }))!;
    const postings = record.sections.find(({ heading }) => heading === 'Postings');

    expect(postings).toBeDefined();
    expect(postings!.lines).toHaveLength(4);
    expect(postings!.lines.join(' ')).not.toMatch(/pending|Act 4/);
    expect(postings!.lines.at(-1)).toContain('(current posting)');
  });
});

describe('the document is bounded', () => {
  it('runs to exactly the bound on a maximal file, and no further', () => {
    // This assertion is the bound. There is no truncation pass to test, because two drafts of one
    // proved dead: a cap of twenty-four sat above anything the code could produce, and a cap at the
    // structural maximum could not fire either — deleting the whole pass changed no output. Every
    // section is bounded by construction instead, and this drives a maximal file so that widening a
    // section or adding a fifth fails here rather than quietly raising a ceiling.
    const maximal = projectServiceRecord({
      ...FULL,
      act: 400,
      caseload: { ...FULL.caseload, kinds: Object.fromEntries(QUEST_KINDS.map((kind) => [kind, 9])) },
      // A maximal file has somebody before it. Without a roster the document is one line short, and
      // this assertion is what says so rather than quietly accepting the lower total.
      roster: { Bendrel: predecessorSheet },
    })!;

    expect(allLines(maximal).length).toBe(MAX_RECORD_LINES);
    expect(maximal.sections.map(({ heading }) => heading)).toEqual(['Postings', 'Casework', 'The Register', 'Standing', 'Precedent']);
  });

  it('keeps the recent postings rather than the first ones', () => {
    // The interesting end of a long service record is the recent end, which is the same choice
    // `projectRoute` already makes and the reason it takes a limit at all.
    const long = projectServiceRecord({ ...FULL, act: 400 })!;
    const postings = long.sections.find(({ heading }) => heading === 'Postings')!;

    expect(postings.lines[0]).toContain('Act 393');
    expect(postings.lines.at(-1)).toContain('Act 400');
  });

  it('does not let the postings crowd out every other section', () => {
    // Four hundred acts in, the posting history is longer than everything else put together. It is
    // `MAX_POSTINGS` that keeps the rest of the document on the page.
    const long = projectServiceRecord({ ...FULL, act: 400 })!;

    expect(long.sections.map(({ heading }) => heading)).toEqual(['Postings', 'Casework', 'The Register', 'Standing']);
  });
});
