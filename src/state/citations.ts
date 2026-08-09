import { EQUIP_SLOTS } from '../data/traits';
import { QUEST_KINDS, type Caseload } from './caseload';
import type { Commendations } from './commendations';
import type { SpecimenLog } from './specimenLog';

/**
 * Citations: things the record already shows, noticed out loud.
 *
 * The backlog's history epic asks for achievements over ledgers that already exist, under one hard
 * acceptance criterion taken from `loadoutFiling.ts` — *the moment a set reads as something to
 * pursue, the joke becomes a spreadsheet the player is forbidden to fill in.* That criterion is the
 * whole design here, and two rules follow from it.
 *
 * **Nothing unearned is ever produced.** This returns citations that hold, not a bank annotated with
 * whether each one holds. There is no `earned` flag to render greyed out, no denominator, no
 * remaining count, and no order that suggests a next one. A player cannot pursue what the program
 * never mentions.
 *
 * **Every predicate is monotone.** The ledgers only ever grow — every figure in them is a maximum or
 * a count — so a citation that holds must keep holding. A citation that could be lost would be a
 * status to protect, which is the same failure wearing a different hat, and it would also be a lie:
 * these are statements about what happened, and what happened does not stop having happened.
 *
 * The ledgers are global by design (*"a new character starting over must not erase the record"*), so
 * these are the institution's citations rather than the hero's. That is the funnier reading anyway —
 * the commendation outlives whoever earned it, and is addressed to nobody.
 */

export interface Citation {
  /** Stable across releases: it keys the render and nothing else. */
  readonly id: string;
  readonly title: string;
  /** The institution explaining what it has noticed, in the register of noticing nothing. */
  readonly note: string;
}

export interface CitationLedgers {
  readonly commendations: Commendations;
  readonly caseload: Caseload;
  readonly specimens: SpecimenLog;
}

interface CitationRule extends Citation {
  readonly holds: (ledgers: CitationLedgers) => boolean;
}

/**
 * Thresholds are deliberately unroundable — not 10, 100, 5.
 *
 * A round number reads as a target somebody set, which invites the player to aim at it. An odd one
 * reads as the point at which somebody happened to notice, which is what these are.
 */
const THRESHOLDS = {
  sustainedInterest: 7,
  extensiveSampling: 137,
  longService: 6,
  notableDisposal: 1_337,
  seniority: 23,
} as const;

/** Exported so the "no round numbers" rule can be asserted against what actually ships. */
export const CITATION_THRESHOLDS: readonly number[] = Object.values(THRESHOLDS);

const RULES: readonly CitationRule[] = [
  {
    id: 'generalist',
    title: 'Departmental Generalist',
    note: 'Every category of assignment has been closed at least once. The file shows no preference, and none was requested.',
    holds: ({ caseload }) => QUEST_KINDS.every((kind) => (caseload.kinds[kind] ?? 0) > 0),
  },
  {
    id: 'sustained-interest',
    title: 'Sustained Interest In A Single Matter',
    note: 'One name keeps returning to the top of the pile. No theory as to why has been filed, and none has been asked for.',
    holds: ({ caseload }) => Object.values(caseload.targets).some((count) => (count ?? 0) >= THRESHOLDS.sustainedInterest),
  },
  {
    id: 'complete-turnout',
    title: 'Complete Turnout',
    note: 'Every slot has held something worth keeping. None of it contributed to combat, and the record is careful not to imply otherwise.',
    holds: ({ commendations }) => EQUIP_SLOTS.every((slot) => commendations.exhibit[slot] !== undefined),
  },
  {
    id: 'item-of-record',
    title: 'Item Of Record',
    // Not "was superseded", which the ledger cannot support: `mergeExhibit` keeps the *maximum*
    // quality each slot has ever held and ties keep the incumbent, so a legendary in the case is by
    // construction the best that slot has seen and nothing ever displaced it. It may also still be
    // equipped, which made "and nowhere else" false as well. The true version is funnier anyway — a
    // record that can only be equalled is a record nobody can take from you.
    note: 'Something legendary has been worn. The case keeps the finest each slot has ever held, so the entry can be equalled and never beaten.',
    holds: ({ commendations }) => Object.values(commendations.exhibit).some((entry) => entry?.label === 'legendary'),
  },
  {
    id: 'extensive-sampling',
    title: 'Extensive Sampling',
    // Not "exactly once". `specimenLog` says outright that quantity and time are not identity —
    // holding four of something is one specimen, and holding it again next week is still one — and
    // `mergeSpecimens` is a set insert that stores no counts at all. The log knows each identity was
    // held *at least* once, and repeat drops are the norm, so the original claim was both
    // unsupportable and usually false.
    note: 'A great many distinct things have been held at least once. How many times each is not recorded, which spares everyone the tally.',
    holds: ({ specimens }) => specimens.specimens.length >= THRESHOLDS.extensiveSampling,
  },
  {
    id: 'long-service',
    title: 'Long Service',
    note: 'Several acts concluded. The plot has advanced by precisely the amount the plot advances.',
    holds: ({ commendations }) => commendations.actsCompleted >= THRESHOLDS.longService,
  },
  {
    id: 'notable-disposal',
    title: 'Notable Disposal',
    note: 'A single sale of consequence. The consequence has not been described, and the gold has been spent on a helmet.',
    holds: ({ commendations }) => commendations.largestSale >= THRESHOLDS.notableDisposal,
  },
  {
    id: 'seniority',
    title: 'Seniority',
    note: 'A level has been attained that entitles the holder to no additional duties and no fewer.',
    holds: ({ commendations }) => commendations.highestLevel >= THRESHOLDS.seniority,
  },
];

/** The rule ids, for tests that need to know the bank without being able to render an unearned one. */
export const CITATION_IDS: readonly string[] = RULES.map(({ id }) => id);

/**
 * The citations the record supports, in filing order.
 *
 * Pure and cheap — a handful of reads over objects the store already holds — so it can be called on
 * every render without memoisation, the way `isEmpty` already is.
 */
export function citationsFor(ledgers: CitationLedgers): readonly Citation[] {
  return RULES.filter((rule) => rule.holds(ledgers)).map(({ id, title, note }) => ({ id, title, note }));
}
