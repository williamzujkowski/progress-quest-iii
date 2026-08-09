import { boundCodePoints, MAX_TEXT_CODE_POINTS } from '../engine/text';
import { KIND_LABELS, QUEST_KINDS, describeSpan, displayTarget, mostLitigated, type Caseload } from './caseload';
import type { Commendations } from './commendations';
import { predecessorFor } from './predecessor';
import type { CharacterSheet } from '../engine/types';
import { hasRoute, projectRoute, type RouteStop } from './worldContext';
import type { GamePresentationSnapshot } from '../engine/transition';

/**
 * The service record: one document, assembled out of things that already exist.
 *
 * This is the piece the backlog's history epic called its headline, and the reason is that
 * *generated documents* is the register this game is actually about. Nothing here is new
 * information. `projectRoute` already reconstructs an act-by-act posting history from nothing
 * stored; the caseload already counts what the work consisted of; the dated register already knows
 * which acts a recurring matter spans; the commendation ledger already keeps the best thing ever
 * worn in a slot that contributes nothing to combat. Each is a panel. None of them is a document.
 *
 * The difference is the composition and the voice. A panel reports a figure. A document draws the
 * figures together, in one register, and then declines to conclude anything from them — which is
 * both funnier and more honest than a summary that pretends the numbers add up to a story.
 *
 * ## Three rules, each tested
 *
 * **It addresses nobody.** ADR 0011 requires this of any dated line, because the ledgers are global
 * and an act ordinal in them may belong to a character retired several heroes ago. The document
 * takes the stricter form throughout: it is written *about* a subject, never *to* one. A service
 * record that said "you" would be a letter, and this institution does not write letters.
 *
 * **It says nothing it was not given.** Every figure comes from a ledger or from the route. There is
 * no total computed here, no rate, no ranking — a document that did arithmetic of its own would
 * disagree with the panels the moment either moved.
 *
 * **It omits rather than reports a zero.** The same rule the panels already follow. A section with
 * nothing in it does not appear, because "Assignments closed: none" reads as a broken document
 * rather than a young one.
 */

/** How many postings the record lists. Bounded because a hero deep into the acts has many. */
const MAX_POSTINGS = 8;

/**
 * How many lines the document can run to: eight postings, five kinds of casework, two lines of
 * register, five of standing, one of precedent.
 *
 * A bound rather than a cap, and the distinction was arrived at the hard way. The first draft
 * truncated to a comfortable twenty-four, which is above anything this code can produce — a
 * safeguard that can never fire, reading as protection while providing none. Setting it to the
 * structural maximum instead made the truncation dead in a subtler way: it still could not fire,
 * because the maximum *is* the maximum, and a mutation deleting the whole truncation pass changed
 * no output at all.
 *
 * So there is no truncation. Every section is bounded by construction — the postings by
 * `MAX_POSTINGS`, the casework by the five quest kinds, the register by two, the standing by five —
 * and this constant records what that comes to. A test drives a maximal file and asserts the total
 * equals it, so widening a section or adding a fifth fails loudly rather than quietly raising a
 * ceiling nobody was watching.
 */
export const MAX_RECORD_LINES = 21;

export interface ServiceRecordSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

export interface ServiceRecord {
  /** Who the file is about, in the third person, because that is what a file is. */
  readonly subject: string;
  readonly sections: readonly ServiceRecordSection[];
  /** The document's refusal to draw a conclusion, which is the document's point. */
  readonly closing: string;
}

export interface ServiceRecordInput {
  readonly hero: GamePresentationSnapshot['hero'];
  readonly act: number;
  readonly caseload: Caseload;
  readonly commendations: Commendations;
  readonly specimenCount: number;
  /**
   * Every character on file, so the document can name whoever held it before. Optional because the
   * roster is read from storage and a storage failure must never cost anybody their service record
   * — it costs them one line.
   */
  readonly roster?: Record<string, CharacterSheet> | undefined;
}

const bound = (text: string): string => boundCodePoints(text, MAX_TEXT_CODE_POINTS);

/**
 * One posting on a line.
 *
 * Town, dungeon and raid rather than town alone: the postings panel shows the town because it is a
 * list and a list wants one value per row, but a document has room for the whole assignment — and
 * the dungeon and the raid are where the act's work actually happened.
 */
function postingLine(stop: RouteStop): string | null {
  if (stop.town === null) return null;
  const places = [stop.town, stop.dungeon, stop.raid].filter((place): place is string => place !== null && place.length > 0);
  return bound(`Act ${stop.act} — ${places.join(', ')}${stop.current ? ' (current posting)' : ''}`);
}

function postings(hero: GamePresentationSnapshot['hero'], act: number): ServiceRecordSection | null {
  // The same rule the postings panel uses, rather than a second one. An act-zero hero has been
  // nowhere yet, and a document that listed a posting the panel does not would be the two surfaces
  // disagreeing about where somebody has been — which is exactly what `projectRoute` exists to
  // prevent between itself and the world console.
  if (!hasRoute(act)) return null;
  const lines = projectRoute(hero, act, MAX_POSTINGS).map(postingLine).filter((line): line is string => line !== null);
  // The pending act is dropped rather than rendered. The panel names it because a list that simply
  // stopped would read as the end of the game; a document listing a place nobody has been would be
  // reporting a posting that has not happened.
  return lines.length === 0 ? null : { heading: 'Postings', lines };
}

function casework(caseload: Caseload): ServiceRecordSection | null {
  const lines = QUEST_KINDS.flatMap((kind) => {
    const count = caseload.kinds[kind];
    return count ? [bound(`${KIND_LABELS[kind]}: ${count}`)] : [];
  });
  return lines.length === 0 ? null : { heading: 'Casework', lines };
}

function theRegister(caseload: Caseload): ServiceRecordSection | null {
  const frequent = mostLitigated(caseload);
  if (!frequent) return null;

  const lines = [bound(`One name recurs above the others: ${displayTarget(frequent.target)}, filed against ${frequent.count} times.`)];
  // Absent on every ledger written before the register existed, and a document that invented a date
  // would be worse than one that has none.
  const dated = describeSpan(caseload.targetActs[frequent.target]);
  if (dated) lines.push(bound(dated));
  return { heading: 'The Register', lines };
}

function standing(commendations: Commendations, specimenCount: number): ServiceRecordSection | null {
  const lines: string[] = [];
  if (commendations.highestLevel > 0) lines.push(bound(`Highest level attained: ${commendations.highestLevel}.`));
  if (commendations.actsCompleted > 0) lines.push(bound(`Acts concluded: ${commendations.actsCompleted}.`));
  if (commendations.largestSale > 0) lines.push(bound(`Largest single disposal: ${commendations.largestSale} gold.`));
  if (specimenCount > 0) lines.push(bound(`Distinct specimens filed: ${specimenCount}.`));

  const exhibited = Object.entries(commendations.exhibit).filter(([, entry]) => entry !== undefined);
  if (exhibited.length > 0) {
    // Stated rather than implied. `worldContext` classifies equipment as prestige and CONTEXT.md is
    // explicit that it makes no combat contribution, so a document listing the exhibit without
    // saying so would be letting the reader infer a mechanic that does not exist.
    lines.push(bound(`Items of record retained in ${exhibited.length} slots, none of which bore on the outcome of anything.`));
  }

  return lines.length === 0 ? null : { heading: 'Standing', lines };
}

function precedent(roster: Record<string, CharacterSheet> | undefined, currentName: string): ServiceRecordSection | null {
  if (!roster) return null;
  const held = predecessorFor(roster, currentName);
  return held ? { heading: 'Precedent', lines: [bound(held.phrase)] } : null;
}

/**
 * Assembles the document. Pure, and returns null when the file has nothing in it at all — an empty
 * service record is a form, and a form is not a document.
 */
export function projectServiceRecord(input: ServiceRecordInput): ServiceRecord | null {
  const { hero, act, caseload, commendations, specimenCount } = input;

  const sections = [
    postings(hero, act),
    casework(caseload),
    theRegister(caseload),
    standing(commendations, specimenCount),
    // Last, under everything it explains. The ledgers above deliberately span characters, so a new
    // hero's document opens onto somebody else's arithmetic; this is the only line that says whose.
    precedent(input.roster, hero.name),
  ].filter((section): section is ServiceRecordSection => section !== null);

  if (sections.length === 0) return null;

  return {
    subject: bound(`${hero.name}, ${hero.race} ${hero.className}, level ${hero.level}`),
    sections,
    closing: 'No conclusion is drawn. The file is retained.',
  };
}
