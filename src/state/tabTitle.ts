import { formatGameNumber } from '../engine/text';

/**
 * What the browser tab says while nobody is looking at it.
 *
 * The tab strip is the only surface this game has when it is not the active tab, and leaving it
 * open is the single thing a player ever does — so it is worth giving that act a visible return.
 * Facts rotate rather than all appearing at once, because a tab title is roughly thirty legible
 * characters, and a queue of two to four short readings survives truncation better than one long
 * one. Two to four rather than a fixed number: Act is withheld during the prologue and the filing
 * rate until its window means something, and those two are independent.
 *
 * Every fact here is a number the engine already reports. Nothing implies a mechanic that does
 * not exist, which is the same bar the item catalogue is held to.
 */

export const BASE_TITLE = 'Progress Quest III';

export interface TabFacts {
  readonly level: number;
  readonly gold: number;
  readonly act: number;
  readonly velocity: number | null;
}

/** The readings worth rotating, in the order an institution would list them. */
export function tabTitleFacts(facts: TabFacts): string[] {
  const readings = [
    `Lvl ${formatGameNumber(facts.level)}`,
    `${formatGameNumber(facts.gold)} GP`,
  ];
  // Act 0 is the prologue and has no number worth reporting.
  if (facts.act > 0) readings.push(`Act ${formatGameNumber(facts.act)}`);
  // The only reading here that was not a labelled quantity. `Lvl 7`, `4210 GP` and `Act 3` all
  // name what they are; `1240/hr` sat among them naming nothing, in a strip that has no hover to
  // fall back on and carries neither a `title` nor an `sr-only` gloss. Six characters against the
  // roughly thirty legible ones, which is real and is worth it — a rate with no noun beside a gold
  // figure reads as gold per hour, and being briefly wrong is worse than being briefly truncated.
  if (facts.velocity !== null) readings.push(`${formatGameNumber(facts.velocity)} filed/hr`);
  return readings;
}

/**
 * One frame of the rotation. The app name always travels with the reading: a tab that stops
 * identifying itself is harder to find than one that says nothing new.
 */
export function formatTabTitle(facts: TabFacts, frame: number): string {
  const readings = tabTitleFacts(facts);
  if (readings.length === 0) return BASE_TITLE;
  const reading = readings[Math.abs(Math.trunc(frame)) % readings.length]!;
  return `${reading} · ${BASE_TITLE}`;
}
