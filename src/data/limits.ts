// ponytail: engine transitions and persistence validation share one finite compatibility envelope.
export const MAX_PERSISTED_VALUE = 1_000_000_000;
export const MAX_PERSISTED_GOLD = 1_000_000_000_000;
export const MAX_PERSISTED_ITEMS = 5_000;
export const MAX_PERSISTED_DESCRIPTION_LENGTH = 1_000;
export const MAX_PENDING_TASKS = 100;
export const MAX_WORLD_NOTICES = 40;
/**
 * How many chatter lines the feed keeps.
 *
 * The old justification — "three-line scenes divide evenly" — was true when every scene was exactly
 * three lines, and is not any more: measured over 270 scenes, 172 are one line, 72 are two and 26
 * are three. Divisibility by three now describes nothing, so the figure is re-derived rather than
 * inherited.
 *
 * It is a line budget, not a scene count, because `retainWholeSocialScenes` drops whole scenes off
 * the end — the effective number of scenes kept varies with how talkative the recent ones were, and
 * that is the right behaviour: a reader scrolling back wants entire exchanges, not the last line of
 * one. At the measured mean of 1.46 lines per scene, 48 holds around thirty of them, which is a few
 * minutes of play at the current cadence and comfortably more than a tab-out drain emits at once.
 */
export const MAX_SOCIAL_ENTRIES = 48;
// ponytail: about 11.5 days is ample scheduler debt; saturation keeps checkpoints finite and catch-up work bounded.
export const MAX_PENDING_ELAPSED_MS = 1_000_000_000;

/**
 * The most any single stored payload may be before it is refused unparsed.
 *
 * Shared by every reader of local storage rather than owned by one of them. The cap exists to
 * bound work, not to describe a schema: JSON.parse on a hostile blob is the expensive step, and
 * it happens before any validation can reject the contents. Deliberately far above a legitimate
 * payload, since being generous costs nothing and being tight would reject a save the schema
 * would have accepted.
 */
export const MAX_STORED_PAYLOAD_LENGTH = 1_000_000;

/**
 * How long the checkpoint scheduler waits before flushing a dirty session to storage.
 *
 * Lives here rather than as a literal default argument because the end-to-end suite has to
 * outwait it to prove a checkpoint was *not* written. A test that hard-codes its own copy of
 * this number stops proving anything the moment the interval is raised: the wait finishes
 * before the flush would have happened, and the absence it asserts is its own impatience.
 */
export const DEFAULT_CHECKPOINT_INTERVAL_MS = 1_000;
