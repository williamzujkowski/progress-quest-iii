import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * A digest of every file in the published directory, taken at the moment it was verified.
 *
 * `verify-production-build.mjs` checks the bundle — no development JSX runtime, a registered
 * service worker, local fonts only, the CSP on the built document, the size budget, the notices —
 * and then the deploy job goes on to run the whole PWA suite over that same directory before
 * uploading and attesting it. Playwright and the browsers it downloads have full filesystem
 * access during that window, and `npm ci --ignore-scripts` says nothing about runtime execution.
 *
 * So the attestation could truthfully certify bytes that no longer matched the ones the checks
 * passed. The repository already makes this argument about the agent tooling, in
 * `test-deploy-tooling-boundary.mjs`: "the attestation would still be true, and would still be
 * attesting a job in which all of that ran." This closes the same gap one step later, for the
 * remaining dev tree, without moving the build into a separate job.
 *
 * The manifest is written outside `dist/` deliberately. Anything inside it would be published and
 * would land in the service worker's precache list — the same reasoning the SBOM step already
 * records for itself.
 */

export const DIST_DIGEST_FILE = 'dist-digests.json';

async function filesUnder(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path));
    else found.push(path);
  }
  return found;
}

/** Sorted, so the manifest is stable across filesystems that enumerate in different orders. */
export async function digestTree(root) {
  const paths = (await filesUnder(root)).sort();
  const digests = {};
  for (const path of paths) {
    digests[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return digests;
}

/**
 * What changed between two manifests, as a list of human-readable statements.
 *
 * Returns every difference rather than the first, because a caller looking at this output is
 * already in the worst case and wants the shape of it. Added and removed files count: a bundle that
 * gained a file after verification is exactly as unattestable as one whose bytes moved.
 */
export function compareDigests(before, after) {
  const differences = [];
  for (const [path, digest] of Object.entries(before)) {
    if (!Object.hasOwn(after, path)) differences.push(`removed after verification: ${path}`);
    else if (after[path] !== digest) differences.push(`changed after verification: ${path}`);
  }
  for (const path of Object.keys(after)) {
    if (!Object.hasOwn(before, path)) differences.push(`added after verification: ${path}`);
  }
  return differences;
}
