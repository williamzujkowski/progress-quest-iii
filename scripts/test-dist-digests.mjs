import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDigests } from './dist-digests.mjs';

/**
 * The comparison that decides whether the published bytes are the verified bytes.
 *
 * The end-to-end behaviour is exercised by the deploy job itself, which cannot run here. What can
 * run here is the part with the decisions in it: a changed file, a file that appeared, and a file
 * that went away all have to fail, and only an identical tree may pass.
 *
 * An added file matters as much as a changed one, which is the case easiest to leave out. A bundle
 * that gained a script after verification is exactly as unattestable as one whose bytes moved --
 * `index.html` is not the only way to reach code, since the service worker precaches by path.
 */

const BEFORE = { 'index.html': 'aaa', 'assets/index-abc.js': 'bbb', 'sw.js': 'ccc' };

test('passes only an identical tree', () => {
  assert.deepEqual(compareDigests(BEFORE, { ...BEFORE }), []);
  // Key order is not content. The manifest is written sorted, but a comparison that depended on
  // ordering would fail on a filesystem that enumerated differently and teach everyone to ignore it.
  assert.deepEqual(compareDigests(BEFORE, { 'sw.js': 'ccc', 'assets/index-abc.js': 'bbb', 'index.html': 'aaa' }), []);
});

test('refuses a file whose bytes moved', () => {
  const differences = compareDigests(BEFORE, { ...BEFORE, 'assets/index-abc.js': 'tampered' });
  assert.deepEqual(differences, ['changed after verification: assets/index-abc.js']);
});

test('refuses a file that appeared after verification', () => {
  const differences = compareDigests(BEFORE, { ...BEFORE, 'assets/extra.js': 'ddd' });
  assert.deepEqual(differences, ['added after verification: assets/extra.js']);
});

test('refuses a file that went away after verification', () => {
  const { 'sw.js': _removed, ...after } = BEFORE;
  assert.deepEqual(compareDigests(BEFORE, after), ['removed after verification: sw.js']);
});

test('reports every difference rather than the first', () => {
  // A caller reading this output is already in the worst case and wants the shape of it, not one
  // example of it.
  const { 'sw.js': _removed, ...rest } = BEFORE;
  const differences = compareDigests(BEFORE, { ...rest, 'index.html': 'tampered', 'new.js': 'eee' });

  assert.equal(differences.length, 3);
  assert.ok(differences.some((line) => line.startsWith('changed after verification: index.html')));
  assert.ok(differences.some((line) => line.startsWith('removed after verification: sw.js')));
  assert.ok(differences.some((line) => line.startsWith('added after verification: new.js')));
});

test('an empty baseline still refuses a populated tree', () => {
  // The shape a missing build would take if the manifest existed but held nothing. The runner fails
  // closed on an absent file; this covers the adjacent case where it is present and empty.
  assert.deepEqual(compareDigests({}, { 'index.html': 'aaa' }), ['added after verification: index.html']);
});
