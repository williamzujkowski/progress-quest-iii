import { formatGameNumber } from '../engine/text';
import type { GameTransitionEvent } from '../engine/transition';

/**
 * What the closed session actually produced, reported once the backlog has been worked through.
 *
 * Returning already files a line, and it says only how long the absence was. Three hours of
 * credited time produces levels, quests and gold, and none of it was mentioned — which is the one
 * thing the catch-up genre exists to tell you.
 *
 * It could not have been said any earlier. The absence line is written at restore, before any of
 * that time has been spent: the engine has been handed a number of milliseconds and has not yet
 * turned them into anything. So the digest accumulates while the drain runs and is reported on
 * the tick that finishes it.
 *
 * Counts only. Nothing here is persisted, nothing is read back, and no figure implies a mechanic
 * the engine does not model — a level is a level whether it was earned while watched or not.
 */

export interface AbsenceDigest {
  readonly levels: number;
  readonly quests: number;
  readonly acts: number;
  readonly gold: number;
}

export const EMPTY_DIGEST: AbsenceDigest = { levels: 0, quests: 0, acts: 0, gold: 0 };

/** Folds a tick's events into a running digest. Returns the same object when nothing counted. */
export function accumulateDigest(digest: AbsenceDigest, events: readonly GameTransitionEvent[]): AbsenceDigest {
  let next = digest;
  for (const event of events) {
    switch (event.type) {
      case 'level_gained':
        next = { ...next, levels: next.levels + 1 };
        break;
      case 'quest_completed':
        next = { ...next, quests: next.quests + 1 };
        break;
      case 'act_completed':
        next = { ...next, acts: next.acts + 1 };
        break;
      case 'gold_received':
        next = { ...next, gold: next.gold + event.amount };
        break;
      // The gold a player actually earns. `gold_received` is the rarer of the two by a wide margin:
      // it needs `generateItemReward` to return 'Gold', which needs more than 250 distinct names in
      // the bag. Measured over twelve simulated hours to level 23, it fired zero times while sales
      // brought in 805,161 gold — so the digest reported "none of it witnessed" after an absence
      // that earned six figures, on the one screen whose whole job is saying what was missed.
      case 'inventory_sold':
        next = { ...next, gold: next.gold + event.gold };
        break;
      default:
        break;
    }
  }
  return next;
}

export function isEmptyDigest(digest: AbsenceDigest): boolean {
  return digest.levels === 0 && digest.quests === 0 && digest.acts === 0 && digest.gold === 0;
}

/**
 * The line, or null when the absence produced nothing worth a sentence.
 *
 * A drain that credits no event at all is a real outcome — a short absence, or one spent entirely
 * on a single long task — and reporting a row of zeroes would make an uneventful absence look
 * like a broken one, which is the same reasoning the records panels already follow.
 */
export function describeDigest(digest: AbsenceDigest): string | null {
  if (isEmptyDigest(digest)) return null;

  const parts: string[] = [];
  if (digest.levels > 0) parts.push(`${formatGameNumber(digest.levels)} ${digest.levels === 1 ? 'level' : 'levels'}`);
  if (digest.quests > 0) parts.push(`${formatGameNumber(digest.quests)} ${digest.quests === 1 ? 'quest' : 'quests'}`);
  if (digest.acts > 0) parts.push(`${formatGameNumber(digest.acts)} ${digest.acts === 1 ? 'act' : 'acts'}`);
  if (digest.gold > 0) parts.push(`${formatGameNumber(digest.gold)} gold`);

  return `Backlog processed. The absence produced ${parts.join(', ')}, none of it witnessed.`;
}
