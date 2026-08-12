import { stableIndex } from '../engine/text';
import type { WorldContext } from './worldContext';

/**
 * How grandly the institution describes itself, as a function of how long this has been going on.
 *
 * An idle game's only real reward for leaving it open is that something changes while you are not
 * looking. Almost everything here changes by counting up; this changes by degree. The same clerk
 * files the same paperwork all the way through, and the language gradually stops being able to
 * keep a straight face about it.
 *
 * The design constraint is the editorial contract's own: *if every empty slot threatens the
 * universe, the universe becomes ordinary inventory.* Escalation only reads as escalation against
 * a long stretch of the mundane, so the routine tier is deliberately most of what anyone ever
 * sees, and the top tier is placed where a session has to be genuinely long-running to reach it.
 *
 * Derived, never persisted. It reads the world context the projection already computes, holds no
 * authority over anything, and consumes no randomness — so it cannot affect the RNG continuation
 * or save compatibility.
 */

export type InstitutionalTenor = 'routine' | 'noted' | 'ceremonial' | 'mythic' | 'infrastructural' | 'autonomous';

/** What each tier is called where the interface needs to name it rather than speak in it. */
export const TENOR_LABELS: Record<InstitutionalTenor, string> = {
  routine: 'Routine',
  noted: 'Noted',
  ceremonial: 'Ceremonial',
  mythic: 'Mythic',
  infrastructural: 'Infrastructural',
  autonomous: 'Autonomous',
};

/**
 * Thresholds are on the act, because the act is the coarsest thing the engine advances and the
 * one a watcher already understands as "how far this has got". Level is deliberately not used:
 * it climbs steadily forever, which would make escalation feel like a clock rather than an event.
 */
const CEREMONIAL_ACT = 5;
const MYTHIC_ACT = 12;

/**
 * The two tiers above mythic exist on a different clock from the rest.
 *
 * An act costs `3600 * (1 + 5 * act)` seconds of plot progress, so the cumulative cost of reaching
 * one grows quadratically: mythic is about fourteen days of credited time, these are about
 * thirty-three and sixty-nine. A single catch-up is capped at MAX_PENDING_ELAPSED_MS, roughly
 * eleven and a half days, so neither can be reached by one long absence — they are for a run that
 * was genuinely left alone, repeatedly, for months.
 *
 * That reachability is the point rather than a drawback. The tiers describe an operation that has
 * outlasted everyone's interest in it, and a tier anyone could reach in a weekend could not.
 */
const INFRASTRUCTURAL_ACT = 18;
const AUTONOMOUS_ACT = 26;

/**
 * The prologue and the first acts are routine however long they take. An hour of play should not
 * promote the paperwork on its own; reaching somewhere should.
 */
const NOTED_ACT = 2;

export function tenorFor(context: Pick<WorldContext, 'act'>): InstitutionalTenor {
  if (context.act >= AUTONOMOUS_ACT) return 'autonomous';
  if (context.act >= INFRASTRUCTURAL_ACT) return 'infrastructural';
  if (context.act >= MYTHIC_ACT) return 'mythic';
  if (context.act >= CEREMONIAL_ACT) return 'ceremonial';
  if (context.act >= NOTED_ACT) return 'noted';
  return 'routine';
}

/**
 * One line per tier, describing the same unchanging activity in progressively less defensible
 * terms. Every line is literally true of a hero who is filing paperwork and killing rats; only
 * the institution's opinion of it moves.
 */
const TENOR_LINES: Record<InstitutionalTenor, readonly string[]> = {
  // Six rather than three, and only here. `routine` is nearly all of what anybody ever sees --
  // the next tier needs act two, which is several hours of credited time -- while the tiers above
  // it are rationed on purpose and stay at three. Under-supplying the tier everybody lives in was
  // the same mistake as over-supplying the ones almost nobody reaches.
  routine: [
    'Operating within normal parameters. No escalation is warranted.',
    'Caseload nominal. The filing continues at the expected rate.',
    'Nothing about this process has yet required a second signature.',
    'A second signature was sought as a precaution and has not come back.',
    'No exception has been requested here, and none has been refused.',
    'A colleague was asked to confirm this was normal, and confirmed it.',
  ],
  noted: [
    'Sustained output has been noted by a department that does not usually notice.',
    'This file has been moved to a slightly larger cabinet.',
    'Performance is now described internally as consistent.',
  ],
  ceremonial: [
    'The process is now conducted with ceremony nobody remembers instituting.',
    'A commemorative plaque has been commissioned and immediately misfiled.',
    'Junior clerks are instructed to stand when this record is retrieved.',
  ],
  mythic: [
    'The paperwork is now older than several of the clerks maintaining it.',
    'This file is cited in other files. None of them explain it.',
    'The archive has stopped asking when this concludes and begun asking whether it began.',
  ],
  // The register turns from institutional grandeur to the vocabulary of a facility, because a
  // process this old stops being an achievement and becomes a thing the building is arranged
  // around. Deliberately qualitative: the engine models acts, levels, kills and gold, and it does
  // not model power, floor space or capacity. A line quoting a figure for any of those would be
  // reporting state that exists nowhere, which is the one thing the editorial contract forbids
  // outright. Grandeur can be unearned; numbers cannot be invented.
  infrastructural: [
    'Other departments now schedule around this process. None of them has been told what it is.',
    'The cooling for this room is budgeted separately and exceeds the room.',
    'The activity is classified as infrastructure and may no longer be switched off for cleaning.',
  ],
  autonomous: [
    'The requisition for further capacity was approved by a process listing itself as the approver.',
    'A summary of benefits to humanity has been prepared. It is one page and mostly concerns rats.',
    'The archive now expands to accommodate the record, and the record to accommodate the archive.',
  ],
};

/**
 * The line for a tier, chosen deterministically from the location so it holds still while the
 * hero does, and changes when the surroundings do. `stableIndex` is a pure hash rather than a
 * draw from the generator, which is what keeps this out of the RNG continuation entirely.
 */
export function tenorLine(context: Pick<WorldContext, 'act' | 'location' | 'venue'>): string {
  const tenor = tenorFor(context);
  const lines = TENOR_LINES[tenor];
  // Keyed on the venue as well as the location. A location holds still for a whole act's worth of
  // town, so the one thing on this panel that changes by degree was, for the first several hours
  // anybody watches, a single sentence that never moved. `venue` turns over constantly without
  // changing which tier is in force, which is exactly the axis this line wants.
  return lines[stableIndex(`${tenor}:${context.location}:${context.venue}`, lines.length)]!;
}
