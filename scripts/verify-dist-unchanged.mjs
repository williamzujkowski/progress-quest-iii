import { readFile } from 'node:fs/promises';
import { DIST_DIGEST_FILE, compareDigests, digestTree } from './dist-digests.mjs';

/**
 * Re-checks the published directory against the digests taken when it was verified.
 *
 * Run immediately before the artifact is uploaded, so that what gets attested is what passed the
 * checks rather than merely what happened to be on disk at the end of the job. Between those two
 * points the deploy job runs the PWA Playwright suite over this same directory, with browsers
 * fetched at run time from an unpinned download.
 *
 * Fails closed on a missing manifest. An absent baseline means the build did not run, or ran and
 * did not verify, and uploading in that state would produce an attestation about nothing.
 */
const root = new URL('../', import.meta.url).pathname;
const distRoot = new URL('../dist/', import.meta.url).pathname;

let before;
try {
  before = JSON.parse(await readFile(new URL(`../${DIST_DIGEST_FILE}`, import.meta.url), 'utf8'));
} catch {
  throw new Error(
    `No ${DIST_DIGEST_FILE} to check against. It is written by scripts/verify-production-build.mjs, `
    + 'so a missing one means the production build did not run or did not verify. Refusing to '
    + 'attest an unverified directory.',
  );
}

const after = await digestTree(distRoot);
const differences = compareDigests(before, after);

if (differences.length > 0) {
  throw new Error(
    `The published directory changed after it was verified:\n  ${differences.join('\n  ')}\n`
    + 'Something wrote to dist/ between the production-build check and the upload. Attesting it '
    + 'would certify bytes that passed no check.',
  );
}

console.log(`Re-verified ${Object.keys(after).length} file(s) in dist/ unchanged since the production build check. Root: ${root}`);
