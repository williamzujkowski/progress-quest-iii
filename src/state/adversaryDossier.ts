import { formatGameNumber, stableIndex } from '../engine/text';

/**
 * What the institution has on file about whoever the hero is currently bothering.
 *
 * The engine has always named its quest targets and has never remembered them. Every kobold was
 * the first kobold. The docket tally kept for the summary panel already counts how often each
 * target has been filed against, so the record needed to say "we have met before" was sitting
 * there unused.
 *
 * This is the joke EverQuest's named bosses got for free and this game could not: an adversary
 * with a history. It arrives here as bureaucracy rather than as threat, because the hero's
 * chances are not affected by any of it — a target filed against forty times is exactly as
 * dangerous as a fresh one, and the copy has to stay funny without implying otherwise.
 *
 * Derived from state that already exists. Nothing is persisted, no randomness is consumed, and
 * nothing here can be read as a mechanic.
 */

export type AdversaryStanding = 'unfiled' | 'known' | 'habitual' | 'nemesis';

/**
 * Thresholds are low on purpose. A watcher should see the standing move within a session rather
 * than be told about a milestone they were not present for, and the counts come from a tally that
 * spans characters, so the top rung means "this institution has a history with these" rather than
 * "this hero does".
 */
export function standingFor(dockets: number): AdversaryStanding {
  if (dockets >= 25) return 'nemesis';
  if (dockets >= 8) return 'habitual';
  if (dockets >= 1) return 'known';
  return 'unfiled';
}

const OPENINGS: Record<AdversaryStanding, readonly string[]> = {
  unfiled: [
    'No prior file. A new folder has been opened with some optimism.',
    'Unrepresented in the archive until now. The archive is rarely pleased about this.',
    'First instance on record, pending confirmation that anyone was watching.',
  ],
  known: [
    'A file exists. It is thin, and it is open.',
    'Previously encountered. The folder was never formally closed.',
    'Known to the department, though not warmly.',
  ],
  habitual: [
    'The folder now requires its own tab.',
    'Correspondence has become routine, and is filed without comment.',
    'The department has stopped recording these individually and begun recording them in batches.',
  ],
  nemesis: [
    'A standing account. Neither party can now remember who opened it.',
    'The file has outgrown its cabinet and been rehoused twice.',
    'Considered a permanent fixture of the caseload, which is not a compliment to either side.',
  ],
};

export interface AdversaryDossier {
  readonly target: string;
  readonly standing: AdversaryStanding;
  readonly dockets: number;
  readonly summary: string;
}

/**
 * The dossier for a target, or null when there is nothing to report — an unnamed quest has no
 * adversary, and inventing one would be the kind of claim this project does not make.
 *
 * The opening is chosen by pure hash rather than a draw from the generator, so it holds still for
 * a given adversary and standing and stays out of the RNG continuation.
 */
export function adversaryDossier(target: string | undefined, dockets: number): AdversaryDossier | null {
  if (!target || target.length === 0) return null;
  const count = Number.isFinite(dockets) && dockets > 0 ? Math.floor(dockets) : 0;
  const standing = standingFor(count);
  const openings = OPENINGS[standing];
  const opening = openings[stableIndex(`${standing}:${target}`, openings.length)]!;

  // The count is stated plainly beside the flourish, so the joke decorates a fact rather than
  // standing in for one.
  //
  // Absent at zero, and that is the repair rather than an omission. `standingFor` returns `unfiled`
  // exactly when the count is nought, so the zero tally always landed beside an `unfiled` opening —
  // and all three of those already say there is no prior file, in their own words and with a joke
  // attached. The panel read "Nothing previously filed. No prior file. A new folder has been opened
  // with some optimism", which is the failure `socialAmbient` states for its own banks: no line
  // explains the line before it, and agreement is the weakest possible second beat.
  //
  // The tally exists so a target with no dockets says so rather than reporting a bare zero. No bare
  // zero can appear if it is simply not there, and the opening says so better.
  const tally = count === 0
    ? null
    : `${formatGameNumber(count)} ${count === 1 ? 'docket' : 'dockets'} on file.`;

  return { target, standing, dockets: count, summary: tally === null ? opening : `${tally} ${opening}` };
}
