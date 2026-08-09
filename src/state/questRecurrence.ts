import type { IdentifiedGameTransitionRecord } from './worldContext';

/**
 * Which of a batch's assignments the institution has issued before.
 *
 * A durable event history was costed and found out of budget: 95.3 MB at 100 000 tasks,
 * and once bounded to fit, a ring that cannot answer "when did I first". But the question a callback
 * needs is smaller than that — not *when*, only *again* — and the sheet already answers it.
 * `Quest.history` is a bounded ring of the last hundred assignment descriptions, written by
 * `advanceGame`, persisted since the first schema, and read by nothing but a panel that lists it.
 *
 * So this stores nothing and changes no event. It reads the sheet the store already holds, the same
 * way `projectAmbient` reads the loadout, and the recorded sessions stay untouched.
 *
 * ## Counting as of the moment, not as of the end
 *
 * The obvious implementation — "does the description appear twice in the history" — is wrong during
 * a catch-up drain. A batch can carry several assignments, and the sheet handed to this function is
 * the one from *after* all of them. An assignment that was genuinely the first of its kind when it
 * was issued would be reported as a recurrence because a later one in the same batch duplicated it.
 * That is a claim about the past made from the future, and this game's whole discipline is not
 * making those.
 *
 * The ring makes the correction exact rather than approximate. Every `quest_started` pushes exactly
 * one entry, in order, so the k-th of N started assignments in a batch sits at
 * `length - (N - 1 - k)`, and everything after that index had not happened yet. Counting inside that
 * prefix is the count as of the moment.
 *
 * ## The limit, stated rather than hidden
 *
 * A hundred assignments is the whole memory. An assignment last issued a hundred and one ago reads
 * as new, and no line here may claim otherwise — which is why they say the file was never closed
 * rather than how long ago it was opened. The register in epic C is what would let anything say
 * *when*, and it is deliberately ordered after this one.
 */

/** The `activityId`s in this batch whose started assignment had been issued before. */
export function recurringAssignments(
  sources: readonly IdentifiedGameTransitionRecord[],
  history: readonly string[] | undefined,
): ReadonlySet<number> {
  const recurring = new Set<number>();
  if (!history || history.length === 0) return recurring;

  const started = sources.filter(({ record }) => record.event.type === 'quest_started');
  if (started.length === 0) return recurring;

  for (const [order, source] of started.entries()) {
    const { event } = source.record;
    if (event.type !== 'quest_started') continue;

    // Where the ring stood when this assignment was issued: its own entry last, nothing after it.
    const asOf = history.slice(0, history.length - (started.length - 1 - order));

    // The alignment has to hold or the arithmetic above is describing a different history than the
    // one in hand — a save written before the ring existed, an import, a batch whose events and
    // sheet came from different ticks. Nothing is claimed in that case, because a callback that
    // fires on a mismatch is a story about a quest the hero never had.
    if (asOf.at(-1) !== event.description) continue;

    let seen = 0;
    for (const entry of asOf) if (entry === event.description) seen += 1;
    if (seen > 1) recurring.add(source.activityId);
  }

  return recurring;
}
