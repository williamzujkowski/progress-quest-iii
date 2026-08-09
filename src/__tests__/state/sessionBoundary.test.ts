import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../state/gameStore';
import { captureActiveSession } from '../../state/sessionCheckpoint';

/**
 * Two things the chatter feed got wrong at a session boundary. Both were found by reading rather
 * than by a failure: the feed put a summary underneath the thing it summarised, and the cadence
 * outlived the character it belonged to.
 *
 * Driven through the store in both cases, because both are the store's doing. A test that
 * reimplemented the ordering and then asserted its own arithmetic would prove nothing about the
 * feed — which is what the first draft of this file did.
 */

const originalState = useGameStore.getState();

const start = (name: string, seed: string) => useGameStore.getState().startSession({
  source: 'creation', name, race: 'Double Tenant', klass: 'Incident Paladin', seed,
});

afterEach(() => useGameStore.setState(originalState, true));

describe('the catch-up row sits above what it summarises', () => {
  it('is the newest entry in the feed once a return has been consolidated', () => {
    // The feed is newest-first. `projectSocialBatch` emits the row first because that is reading
    // order, so reversing the batch wholesale buried it under its own contents — which reads as one
    // more entry rather than a total. The activity log states exactly this and does the opposite.
    start('Ordered', 'ordering-seed');
    for (let tick = 0; tick < 40; tick += 1) useGameStore.getState().tick(1000);
    // Measured across the drain tick alone. The feed accumulates over many batches, so a count of
    // the whole thing cannot tell whether this batch contributed its scenes or only its summary —
    // a version returning just the row passed a "more than one entry" check comfortably.
    const before = useGameStore.getState().socialEntries.length;
    useGameStore.getState().tick(600_000);

    const entries = useGameStore.getState().socialEntries;
    const contributed = entries.length - before;
    const summaryAt = entries.findIndex(({ sceneKind }) => sceneKind === 'catch_up');

    // The premise: a return that consolidated nothing would make the assertion below vacuous.
    expect(summaryAt, 'expected the absence to consolidate something').toBeGreaterThanOrEqual(0);
    expect(summaryAt).toBe(0);
    // And lifting the row keeps everything under it. A version that returned only the summary put it
    // in position zero too, and passed every weaker form of this assertion.
    expect(contributed, 'the drain must contribute its scenes, not only its summary').toBeGreaterThan(1);
  });
});

describe('a restore hands the character a clean channel', () => {
  it('empties the feed and speaks again', () => {
    // Honest scope: this asserts the restore contract a reader can observe — the feed starts empty
    // and the restored character goes on to speak. It does **not** discriminate the cadence reset
    // that ships alongside it, and saying so is better than implying otherwise.
    //
    // `ChatterCadence` is module-level state in `gameStore`, holding the last eight lines spoken so
    // `scheduleChatter` can decline a repeat. `startSession` has always reset it; `restoreSession`
    // did not, under a comment claiming the same reasoning. The fix is one line beside the
    // `drainDigest` reset that comment already justifies.
    //
    // Four black-box shapes were tried against a mutation that removes the reset, and none held:
    // comparing the replay's line count to the original (moves for legitimate reasons — the replay
    // starts from a clean memory where the original had eight lines in it), asserting it speaks
    // strictly more, asserting it speaks at least as much, and comparing against a store reset to
    // its initial state (not a controlled comparison — that reset also clears progression and
    // activity ids). The leak is real and verified by reading; its observable effect needs a text
    // collision that could not be forced deterministically.
    start('Looped Hero', 'loop-seed');
    for (let tick = 0; tick < 40; tick += 1) useGameStore.getState().tick(1000);
    const banked = captureActiveSession().session;

    useGameStore.getState().tick(600_000);
    expect(useGameStore.getState().socialEntries.length, 'the character must actually have spoken').toBeGreaterThan(0);

    useGameStore.getState().restoreSession(banked);
    expect(useGameStore.getState().socialEntries, 'a restore starts the feed empty').toEqual([]);

    useGameStore.getState().tick(600_000);
    expect(useGameStore.getState().socialEntries.length).toBeGreaterThan(0);
  });
});
