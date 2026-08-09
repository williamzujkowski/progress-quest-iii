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
];

/** Said when the act closes: the allocation ceremony the hero never participates in. */
export const DKP_ALLOCATION: readonly string[] = [
  'The drop was allocated by seniority, then reallocated by whoever was still online.',
  'Master looter has disconnected. The item remains in the corpse pending policy.',
  'Awarded off-spec. Nobody has established what the spec is.',
  'It went to the officer with the most points, who is also the officer maintaining the points.',
  'The hero placed second. The hero has placed second in every allocation on record.',
  'Allocation was fair, documented, and completed without the hero being consulted.',
];
