// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../state/gameStore';
import { createNewCharacter } from '../../engine/sim';
import { readCaseload } from '../../state/caseload';
import { readSpecimenLog } from '../../state/specimenLog';

/**
 * A tab that has stopped saving stops writing the shared ledgers too.
 *
 * Commendations, caseload and specimens write straight to storage from the tick handler, from a base
 * read once at module load, with no cross-tab guard of their own. So a tab showing "another tab
 * changed the saved session. Automatic checkpoints are paused in this tab" went on incrementing
 * their counters anyway.
 *
 * Measured before the fix: a paused tab rolled another tab's casework from 900 in every category
 * back to about 105. `highestLevel` and `largestSale` survived because they are max-merges; the
 * counters and the exhibit map did not, so the damage was silent and partial rather than obvious.
 *
 * The player was being told this tab was not saving while it was in fact still writing three
 * ledgers, and the panels rolled backwards in front of them.
 */

const originalState = useGameStore.getState();

afterEach(() => {
  localStorage.clear();
  useGameStore.setState(originalState, true);
});

const play = (ticks: number) => {
  const { tick } = useGameStore.getState();
  for (let index = 0; index < ticks; index += 1) tick(5_000);
};

describe('a paused tab does not overwrite what another tab filed', () => {
  it('leaves a richer ledger on disk alone', () => {
    // What the other tab filed: far more than this one could reach in the span below.
    const filed = { kinds: { exterminate: 900, seek: 900, deliver: 900, fetch: 900, placate: 900 }, targets: {}, targetActs: {} };
    localStorage.setItem('progquest_caseload_v1', JSON.stringify(filed));

    useGameStore.setState({
      character: createNewCharacter('Paused', 'Half Daemon', 'Robot Monk', 900),
      sessionGeneration: 1,
      ledgersWritable: false,
    });
    play(400);

    const onDisk = readCaseload(localStorage);
    expect(onDisk.kinds.exterminate, 'a paused tab overwrote the filed casework').toBe(900);
  });

  it('still writes when this tab owns the save', () => {
    // The guard must not become a permanent silence. A tab that may write, writes.
    useGameStore.setState({
      character: createNewCharacter('Writing', 'Half Daemon', 'Robot Monk', 901),
      sessionGeneration: 1,
      ledgersWritable: true,
    });
    play(400);

    /*
     * Compared against what the tab is holding, rather than merely asserted to exist.
     *
     * `toBeTruthy` on the raw string was the only statement this suite made about *what* the tick
     * handler persists, and `"{...}"` is truthy whatever is inside it. A handler rewritten to file
     * an empty ledger over the player's casework — the exact damage described at the top of this
     * file, a tab rolling another tab's work backwards — passed it. So did deleting the specimen
     * write outright, because nothing here read that key back at all.
     */
    const filed = readCaseload(localStorage);
    const held = useGameStore.getState().caseload;
    expect(filed.kinds, 'the tab filed a ledger that is not the one it is holding').toEqual(held.kinds);
    expect(Object.values(filed.kinds).reduce((sum, count) => sum + count, 0), 'filed an empty ledger').toBeGreaterThan(0);

    // The third ledger, which had no assertion of any kind. Its write can be deleted outright and
    // every other test in this file stays green.
    expect(readSpecimenLog(localStorage).specimens, 'the specimen log was never written')
      .toEqual(useGameStore.getState().specimens.specimens);
  });

  it('keeps counting in memory while it is not writing', () => {
    // Only the write is withheld. A tab that stops writing should stop writing, not stop counting —
    // otherwise adopting the save later would resume from a ledger that missed an hour.
    useGameStore.setState({
      character: createNewCharacter('Counting', 'Half Daemon', 'Robot Monk', 902),
      sessionGeneration: 1,
      ledgersWritable: false,
    });
    play(400);

    const inMemory = useGameStore.getState().caseload;
    const total = Object.values(inMemory.kinds).reduce((sum, count) => sum + count, 0);
    expect(total, 'the in-memory ledger stopped advancing too').toBeGreaterThan(0);
  });
});
