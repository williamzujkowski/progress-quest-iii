import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { DIST_DIGEST_FILE, digestTree } from './dist-digests.mjs';
import { verifyProductionCsp } from './production-csp.mjs';
import { verifyProductionNotices } from './production-notices.mjs';

const distDirectory = new URL('../dist/', import.meta.url);
const assetDirectory = new URL('assets/', distDirectory);
const documentUrl = new URL('../dist/index.html', import.meta.url);
const noticeUrl = new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url);
const workerUrl = new URL('../dist/sw.js', import.meta.url);
const assetNames = await readdir(assetDirectory);
const cssFiles = assetNames.filter((name) => name.endsWith('.css'));
const jsFiles = assetNames.filter((name) => name.endsWith('.js'));
const fontUrls = [];

if (cssFiles.length === 0) throw new Error('Production build emitted no CSS asset to verify.');
if (jsFiles.length === 0) throw new Error('Production build emitted no JavaScript asset to verify.');

// An ambient NODE_ENV=development survives `vite build` (Vite only defaults NODE_ENV when it is
// unset, and --mode does not override it). That flips import.meta.env.DEV to true, which
// dead-code-eliminates the service-worker registration in src/pwa.ts and ships React's
// development build. The result still looks like a successful build, so fail loudly here
// instead of shipping an app with no offline mode.
let registersServiceWorker = false;
for (const name of jsFiles) {
  const source = await readFile(new URL(name, assetDirectory), 'utf8');
  // Per chunk: a development runtime anywhere means the whole build is wrong.
  if (source.includes('jsxDEV')) {
    throw new Error(`${name} contains React's development JSX runtime; the build did not run as production. Check that NODE_ENV is not set to development.`);
  }
  if (source.includes('serviceWorker')) registersServiceWorker = true;
}

// Across all chunks, not per chunk. Requiring every chunk to mention serviceWorker happened to
// hold while the build emitted exactly one, and would have failed a correct build the first time
// a lazy import or vendor split produced a second.
if (!registersServiceWorker) {
  throw new Error('No emitted JavaScript registers a service worker; offline mode would be silently absent.');
}

for (const name of cssFiles) {
  const cssUrl = new URL(name, assetDirectory);
  const css = await readFile(cssUrl, 'utf8');
  if (css.includes('data:font')) {
    throw new Error(`${name} contains a data-URL font blocked by the production Content Security Policy.`);
  }

  for (const face of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    for (const source of face[0].matchAll(/url\(([^)]+)\)/g)) {
      const target = source[1].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (!target.startsWith('./') || !target.split(/[?#]/, 1)[0].endsWith('.woff2')) {
        throw new Error(`${name} contains a font URL that is not a local .woff2 asset: ${target}`);
      }
      fontUrls.push(new URL(target, cssUrl));
    }
  }
}

if (fontUrls.length === 0) throw new Error('Production CSS declares no font assets to verify.');
await Promise.all(fontUrls.map((fontUrl) => access(fontUrl)));

// Asserted against the built document rather than the source: the question is what Pages serves,
// and a plugin that injected a script or rewrote the meta tag would be invisible in index.html.
verifyProductionCsp(await readFile(documentUrl, 'utf8'));

/**
 * A ceiling on what gets shipped, so a regression is a failed build rather than a discovery.
 *
 * Nothing has been watching this. A burst of feature work grew the bundle by about thirteen
 * kilobytes raw across ten additions, which is fine — but "fine" was established by measuring
 * once, and a measurement taken once is a fact about that afternoon.
 *
 * The numbers are generous on purpose: roughly a quarter above the size at the time of writing.
 * This is here to catch a dependency arriving by accident or a catalogue being embedded whole,
 * not to make a legitimate feature argue for its own bytes. A budget tight enough to trip on
 * ordinary work gets raised reflexively until it means nothing.
 */
const BUDGETS = { js: 560_000, css: 48_000 };

for (const [kind, files] of [['js', jsFiles], ['css', cssFiles]]) {
  const total = (await Promise.all(files.map(async (name) =>
    (await readFile(new URL(name, assetDirectory))).byteLength))).reduce((sum, size) => sum + size, 0);
  if (total > BUDGETS[kind]) {
    throw new Error(
      `Production ${kind.toUpperCase()} is ${total} bytes, over the ${BUDGETS[kind]} byte budget. `
      + 'Check for an unintended dependency or an embedded catalogue before raising this.',
    );
  }
}

const notices = await readFile(noticeUrl, 'utf8');
const worker = await readFile(workerUrl, 'utf8');
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
// Every production dependency, not the `@fontsource` subset this once filtered for. package.json is
// the list of what ships; the notices are the list of what has been attributed. Deriving one from
// the other is what makes a new dependency visible here at all.
const productionDependencies = Object.keys(manifest.dependencies ?? {});
verifyProductionNotices(notices, worker, productionDependencies);

// Taken last, so it records the directory exactly as the checks above left it. The deploy job
// re-checks it immediately before upload: everything between here and there -- the PWA suite, and
// the browsers it downloads at run time -- can write to this directory, and an attestation over
// bytes that moved afterwards would be true and useless.
await writeFile(new URL(`../${DIST_DIGEST_FILE}`, import.meta.url), `${JSON.stringify(await digestTree(distDirectory.pathname), null, 2)}\n`);

console.log(`Verified ${fontUrls.length} local font asset(s) across ${cssFiles.length} production CSS asset(s), within size budget.`);
