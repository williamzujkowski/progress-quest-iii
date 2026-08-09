import { displayTarget, type Caseload } from './caseload';

/**
 * What the file calls its own periods.
 *
 * `institutionalTenor` escalates by act and by nothing else, so every hero passes through the same
 * six tiers in the same order at the same six moments. That is correct for a tier — the tenor is a
 * statement about how long this has been going on, and how long is how long — but it means the one
 * surface describing the shape of a run describes every run identically.
 *
 * The dated register is what makes a period nameable. It already records which acts a recurring
 * matter spans, and a matter that recurred across several acts *is* what those acts were about.
 * "The Gnoll years, Acts 3 through 7" is not an interpretation of the file; it is the file's own
 * two figures with a name attached.
 *
 * ## What an era may and may not claim
 *
 * **Only what the register holds.** The name comes from the target, and the bounds are `first` and
 * `last` verbatim. Nothing here decides that an era was important, or that one era followed
 * another, or that they do not overlap — because the register does not know any of that, and two
 * matters recurring over the same acts is the ordinary case rather than a conflict to resolve.
 *
 * **Never a single act.** One act is a period the way one day is an era. A target seen in one act
 * has a date, which the register already states, and no name.
 *
 * **Nobody is addressed.** ADR 0011, which is where the dated register's global scope is settled:
 * an act ordinal in these ledgers may belong to a character retired several heroes ago, so the file
 * may describe its own periods but may not tell the reader they lived through them.
 */

export interface NamedEra {
  /** The target the era is named for, as it is displayed rather than as it is keyed. */
  readonly name: string;
  readonly first: number;
  readonly last: number;
  /** The era as the file states it: "the Gnoll years, Acts 3 through 7". */
  readonly phrase: string;
}

/**
 * How many eras the file will name. Three, because a list of named periods stops reading as a
 * history and starts reading as a table somewhere around four — and because the whole conceit is an
 * institution being grandiose about a handful of rats, which needs a handful.
 */
export const MAX_NAMED_ERAS = 3;

/** An era has to span more than the act it started in. */
const MIN_SPAN = 1;

/**
 * The periods the file can name, longest first.
 *
 * Ties resolve on the count and then alphabetically, the same ladder `mostLitigated` already uses,
 * so the two never disagree about which of two equal matters the file considers its subject.
 */
export function namedEras(caseload: Caseload): readonly NamedEra[] {
  const eras = Object.entries(caseload.targetActs)
    .flatMap(([target, span]) => {
      if (!span || span.last - span.first < MIN_SPAN) return [];
      const count = Object.hasOwn(caseload.targets, target) ? caseload.targets[target] ?? 0 : 0;
      return [{ target, span, count }];
    })
    .sort((left, right) =>
      (right.span.last - right.span.first) - (left.span.last - left.span.first)
      || right.count - left.count
      || (left.target < right.target ? -1 : 1))
    .slice(0, MAX_NAMED_ERAS);

  return eras.map(({ target, span }) => {
    const name = displayTarget(target);
    return {
      name,
      first: span.first,
      last: span.last,
      phrase: `the ${name} years, Acts ${span.first} through ${span.last}`,
    };
  });
}

/**
 * The era an act falls inside, or null.
 *
 * Eras overlap, and the longest one wins rather than the most recent. A file describing where it is
 * now should name the period it has been in longest, not whichever matter happened to be filed most
 * recently — that would make the era flicker between two names on consecutive quests, which is a
 * period being renamed rather than a period.
 */
export function eraAt(caseload: Caseload, act: number): NamedEra | null {
  if (!Number.isFinite(act)) return null;
  return namedEras(caseload).find((era) => act >= era.first && act <= era.last) ?? null;
}
