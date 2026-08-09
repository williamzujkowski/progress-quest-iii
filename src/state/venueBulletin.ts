import { stableIndex } from '../engine/text';
import type { WorldContext } from './worldContext';

/**
 * What the place the hero is standing in has an office for.
 *
 * The hero already goes to town — the venue is derived whenever a task is buying or selling, and
 * the place already has a name. What it has never had is anything in it. A settlement that exists
 * only as a label is the one part of this world that reads as scenery rather than as bureaucracy,
 * and bureaucracy is the point.
 *
 * Every office listed does nothing the engine does not already do. Procurement is the equipment
 * purchase that genuinely happens; the assay office weighs a sale that genuinely happens; the rest
 * are departments for activities that were always notional, which is the joke — a town whose
 * civic infrastructure is mostly for filing about itself.
 *
 * Derived from the world context, consumed by nothing, persisted nowhere. Chosen by the same pure
 * hash the item catalogue uses rather than a draw from the generator, so a town keeps its offices
 * for as long as the hero is standing in it and cannot alter the RNG continuation.
 */

/**
 * Two are real in the sense that they name a transaction the engine performs. The remainder are
 * departments the institution maintains regardless, which is the register the rest of the world
 * console already speaks in.
 */
const OFFICES: readonly string[] = [
  'Bureau of Procurement, open',
  'Assay Office, weighing',
  'Registry of Recent Arrivals, indifferent',
  'Office of Onward Travel, closed for lunch',
  'Department of Provisional Titles, accepting queries',
  'Sanitation Board, in session',
  'Bureau of Lost Consignments, apologetic',
  'Office of Weights, disputed',
  'Records Annexe, unheated',
  'Committee for the Naming of Streets, deadlocked',
  'Office of Public Notices, out of paper',
  'Bureau of Standards, revising',
];

/** How many offices a settlement admits to. Enough to read as a town, few enough to scan. */
const OFFICES_LISTED = 3;

/**
 * A field and a dungeon are somewhere too, and had nothing but a name and a tenor line while the
 * town beside them kept a directory. The catalogues differ because the joke differs: a town is
 * over-administered, a field is under-administered, and a dungeon is administered by people who
 * have never been inside it.
 */
const FIELD_NOTICES: readonly string[] = [
  // Four of these were noun-plus-neutral-adjective with no joke in them - "provisional",
  // "unresolved", "dormant", "forwarded" - sitting beside a town list where every entry has a
  // comic status. Under-administered is the joke; unfinished is not the same thing.
  'Foraging permits, issued to nobody in particular',
  'Territorial notice, addressed to the occupants',
  'Weather advisory, ignored',
  'Boundary survey, disputed by both sides',
  'Grazing rights, held by an estate nobody has located',
  'Wildlife census, abandoned midway',
  'Drainage petition, forwarded to the water',
  'Right of way, asserted by custom only',
];

const DUNGEON_NOTICES: readonly string[] = [
  'Structural survey, overdue',
  'Torch requisition, denied twice',
  'Occupancy limit, theoretical',
  'Emergency exit, proposed',
  'Damp report, filed and damp',
  'Access agreement, unsigned by the occupants',
  'Noise complaint, from below',
  'Insurance schedule, lapsed',
];

const CATALOGUES: Partial<Record<WorldContext['venue'], readonly string[]>> = {
  town: OFFICES,
  field: FIELD_NOTICES,
  dungeon: DUNGEON_NOTICES,
  // No raid. Deliberate, and asserted next door: a raid takes attendance instead, so its bulletin
  // is the muster sheet. A second list beside it would compete with the better artifact.
};

/**
 * The notices this place keeps, or null where the venue has no catalogue — a road is passed
 * through rather than administered, and a cinematic is not a place at all.
 *
 * Distinct by construction: the same entry is never listed twice, because a town with two
 * sanitation boards is a different joke and not the one intended here.
 */
export function venueBulletin(context: Pick<WorldContext, 'venue' | 'location' | 'act'>): readonly string[] | null {
  const catalogue = CATALOGUES[context.venue];
  if (!catalogue) return null;

  const chosen: string[] = [];
  // Walks forward from the hashed start rather than re-hashing, which is what guarantees
  // distinctness without a rejection loop that could spin on a small catalogue.
  const start = stableIndex(`${context.venue}:${context.location}:${context.act}`, catalogue.length);
  for (let offset = 0; offset < Math.min(OFFICES_LISTED, catalogue.length); offset += 1) {
    chosen.push(catalogue[(start + offset) % catalogue.length]!);
  }
  return chosen;
}
