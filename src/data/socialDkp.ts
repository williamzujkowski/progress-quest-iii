/**
 * What the guild says about the ledger when a boss is involved.
 *
 * Dragon Kill Points were a spreadsheet with a bidding process attached — a guild bureaucracy
 * invented to allocate loot fairly and weaponised within a week. A game whose whole register is
 * procurement, escalation paths and assessors' marks has been circling this for a long time.
 *
 * The running joke, and the one worth committing to: **the hero is always just below the cutoff**.
 * They attend everything, they are awarded nothing, and the ledger is scrupulously fair about it.
 * That is this project's thesis in one bit — the paperwork is impeccable and the hero gets nothing.
 *
 * Nothing here is a number the player could improve. Standings that read as pursuable would turn
 * the joke into a spreadsheet the player is forbidden to fill in, which is the anti-pattern recorded
 * against the whole effects family. So the lines describe a process, never a score, and the hero's
 * position in it is fixed comedy rather than a track.
 */

/** Said when the boss framing opens: attendance, standings, the bidding that has not started. */
export const DKP_STANDINGS: readonly string[] = [
  'Attendance recorded. Standings will be published once the spreadsheet is unlocked.',
  'Everyone present has been credited. The absent have been noted, which is a different thing.',
  'Bidding closed at forty. Bidding reopened at forty-one. Bidding closed.',
  'The loot council has convened. The loot council is one person. The loot council was quorate.',
  'Points have been awarded for turning up, which remains the only mechanic anyone trusts.',
  'The ledger is current as of a date nobody will confirm.',
  // The setup the thesis was missing. Twelve lines shipped and exactly one of them - the second
  // place in the allocation bank - actually said the thing this module's docstring commits to, so a
  // watcher met the punchline before the premise and then never met it again.
  //
  // A process, never a score. "One place below the cutoff" is a description of where the hero
  // stands; a number would make it a target, which is the anti-pattern this file already argues
  // against and the citations were built to avoid.
  'The hero is one place below the cutoff. The cutoff has moved with the hero on every occasion.',
  'Attendance is perfect and standing is second. The ledger records no contradiction between these.',
];

/** Said when the act closes: the allocation ceremony the hero never participates in. */
export const DKP_ALLOCATION: readonly string[] = [
  'The drop was allocated by seniority, then reallocated by whoever was still online.',
  'Master looter has disconnected. The item remains in the corpse pending policy.',
  'Awarded off-spec. Nobody has established what the spec is.',
  'It went to the officer with the most points, who is also the officer maintaining the points.',
  'The hero placed second. The hero has placed second in every allocation on record.',
  'Allocation was fair, documented, and completed without the hero being consulted.',
  'The cutoff fell one place above the hero. The cutoff has been reviewed and found to be where it was.',
  'The hero was eligible, present, and second. All three have been recorded separately.',
];
