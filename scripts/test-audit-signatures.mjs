import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATTEMPTS, auditWithRetry } from './audit-signatures.mjs';

/**
 * The retry policy around `npm audit signatures`, tested against a fake rather than against npm.
 *
 * Invoking the real command here would be testing npm and the transparency log — the two things
 * this wrapper exists because it cannot rely on. What is worth pinning is the policy, and the one
 * thing that must never be true of it: that retrying could turn a real failure into a pass.
 */

const results = (...statuses) => {
  const queue = [...statuses];
  const calls = { count: 0 };
  return {
    calls,
    run: () => {
      calls.count += 1;
      const next = queue.shift();
      return typeof next === 'object' ? next : { status: next };
    },
  };
};

const silent = () => {};
const noWait = async () => {};

test('passes on the first attempt without retrying', async () => {
  const { run, calls } = results(0);
  assert.equal(await auditWithRetry({ run, wait: noWait, log: silent }), 0);
  assert.equal(calls.count, 1, 'a passing check must not be run twice');
});

test('crosses a blip: a failure followed by a pass is a pass', async () => {
  const { run, calls } = results(1, 0);
  assert.equal(await auditWithRetry({ run, wait: noWait, log: silent }), 0);
  assert.equal(calls.count, 2);
});

test('a package that fails every attempt still fails', async () => {
  // The property that matters. Retrying is only defensible because it cannot rescue a real finding:
  // a genuine verification failure fails deterministically, so it fails all three times and this
  // reports it. Anything that let a persistent failure through would be a weakened gate wearing the
  // costume of a resilient one.
  const { run, calls } = results(1, 1, 1);
  assert.equal(await auditWithRetry({ run, wait: noWait, log: silent }), 1);
  assert.equal(calls.count, ATTEMPTS, 'it must actually exhaust its attempts');
});

test('reports the exit status npm gave, not a stand-in', async () => {
  const { run } = results(7, 7, 7);
  assert.equal(await auditWithRetry({ run, wait: noWait, log: silent }), 7);
});

test('does not retry a process that was killed', async () => {
  // A signal is not a verification result, and retrying it would be guessing about why the process
  // died — an out-of-memory kill repeated three times is three kills, not evidence.
  const { run, calls } = results({ signal: 'SIGKILL' }, 0);
  assert.equal(await auditWithRetry({ run, wait: noWait, log: silent }), 1);
  assert.equal(calls.count, 1);
});

test('does not retry a command that could not be started', async () => {
  const { run, calls } = results({ error: new Error('npm not found') }, 0);
  assert.equal(await auditWithRetry({ run, wait: noWait, log: silent }), 1);
  assert.equal(calls.count, 1);
});

test('waits between attempts, and the waits grow', async () => {
  // Backoff is the point of retrying rather than hammering: a service that is briefly down is not
  // helped by three calls in the same millisecond.
  const waited = [];
  const { run } = results(1, 1, 1);
  await auditWithRetry({ run, wait: async (ms) => { waited.push(ms); }, log: silent });

  assert.equal(waited.length, ATTEMPTS - 1, 'one wait between each pair of attempts, and none after the last');
  assert.ok(waited.every((ms) => ms > 0), 'a zero wait is not a backoff');
  assert.ok(waited[1] > waited[0], 'the second wait must be longer than the first');
});

test('says what a repeated failure means, so it is not read as another blip', async () => {
  const said = [];
  const { run } = results(1, 1, 1);
  await auditWithRetry({ run, wait: noWait, log: (line) => said.push(String(line)) });

  const output = said.join('\n');
  assert.match(output, /real finding/, 'the final message has to distinguish itself from the retry notices');
  assert.match(output, /integrity hash/, 'and point at the check that tells tampering from an outage');
});
