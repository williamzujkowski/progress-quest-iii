import { SOCIAL_PERSONAS } from '../data/socialCatalog';
import { stableIndex } from '../engine/text';
import type { WorldContext } from './worldContext';

/**
 * Who the paperwork says turned up to the raid.
 *
 * A raid-class venue already exists — the projection distinguishes it from a dungeon once the act
 * is high enough and a nemesis cinematic is running — but it has read as a relabelled dungeon,
 * because the thing that made a raid a raid was never the boss. It was the roster: the part where
 * a fixed number of people had to be in one place at one time, and the tension of finding out how
 * many actually were.
 *
 * That tension cannot be ported honestly. It was interpersonal, and there is nobody else here.
 * What can be ported is the artefact it produced — an attendance sheet — which this game is
 * unusually well suited to, being about paperwork.
 *
 * Everyone named is drawn from the same fictional cast the chatter panel uses, which already
 * declares in the interface that no people are online and every message is generated locally.
 * Reusing it is deliberate: a second roster would be a second implied population, and this one is
 * already disclaimed where a reader can see the disclaimer.
 *
 * Nobody's attendance affects anything. The encounter is resolved by opponent puissance and
 * character level, exactly as it is everywhere else.
 */

export type Attendance = 'present' | 'regrets' | 'absent' | 'retired';

export interface MusterEntry {
  readonly name: string;
  readonly role: string;
  readonly attendance: Attendance;
}

const ATTENDANCE_LABELS: Record<Attendance, string> = {
  present: 'attending',
  regrets: 'sends regrets',
  absent: 'unaccounted for',
  /**
   * Still on the sheet, years after leaving.
   *
   * Guild rosters that outlive the people on them are the most quietly affecting thing about the
   * genre — a page listing members who retired a decade ago, kept because nobody wanted to be the
   * one to remove them. An institution that never closes a record is this game's whole subject, and
   * here it lands as tenderness rather than satire, which is a register it has not used before.
   */
  retired: 'retired, still listed',
};

export function attendanceLabel(attendance: Attendance): string {
  return ATTENDANCE_LABELS[attendance];
}

/**
 * Enough of the cast to read as a muster, not so many that the panel becomes a phone book. The
 * roster walks the catalogue from a hashed start rather than sampling with rejection, for the
 * reason the town roster does: distinctness by construction beats a loop that can spin.
 */
const MUSTERED = 4;

/**
 * The muster for a raid, or null anywhere else. A field trip does not take attendance.
 *
 * Deterministic in the location and act, so the sheet holds still for as long as the raid does,
 * and consumes no randomness — the encounter's own rolls are the engine's and are not touched.
 */
export function raidMuster(
  context: Pick<WorldContext, 'venue' | 'location' | 'act'>,
): readonly MusterEntry[] | null {
  if (context.venue !== 'raid') return null;

  const start = stableIndex(`${context.location}:${context.act}:muster`, SOCIAL_PERSONAS.length);
  const entries: MusterEntry[] = [];

  for (let offset = 0; offset < Math.min(MUSTERED, SOCIAL_PERSONAS.length); offset += 1) {
    const persona = SOCIAL_PERSONAS[(start + offset) % SOCIAL_PERSONAS.length]!;
    // Attendance is hashed per person per raid rather than drawn, so the same clerk is missing
    // from the same raid every time anyone looks — which is what makes it a record instead of a
    // shuffle. Weighted so most turn up: a sheet where nobody attends stops being a joke about
    // attendance and becomes one about nobody, which is a different and worse joke.
    const roll = stableIndex(`${persona.id}:${context.location}:${context.act}`, 6);
    // `retired` splits the absent face rather than taking one of its own, which keeps the four in
    // six who turn up exactly where they were — a state added on top would have thinned the
    // attendance this sheet is a joke about, and the "mostly attended" assertion would have been
    // left passing on hash luck at exactly one half.
    //
    // Splitting *absent* specifically is the better joke as well as the safer arithmetic: the sheet
    // cannot tell somebody who is missing from somebody who left years ago, because it never closed
    // either record.
    const departed = stableIndex(`${persona.id}:${context.location}:retired`, 3) === 0;
    const attendance: Attendance = roll === 0 ? (departed ? 'retired' : 'absent')
      : roll === 1 ? 'regrets'
        : 'present';
    entries.push({ name: persona.displayName, role: persona.role, attendance });
  }

  return entries;
}
