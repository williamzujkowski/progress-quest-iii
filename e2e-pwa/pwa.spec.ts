// The strict-console fixture rather than a bare `test`. The service-worker suite is where a
// swallowed console error matters most: registration, precache and activation all report failure
// through the console long before anything visible changes, and a test that only asserts what it
// went looking for would sail past the first sign that the worker never installed.
import { expect, test } from '../e2e/fixtures/strictConsole';
import { returningSessionStorageState } from '../e2e/fixtures/returningSession';
import { expectNoViolations } from '../e2e/fixtures/accessibility';

test.use({ storageState: returningSessionStorageState('http://127.0.0.1:4173') });

test('loads the production bundle without violating its own policy', async ({ page }) => {
  // The gap this closes: the policy is asserted as text by scripts/production-csp.mjs, and the app
  // is asserted as console-clean by the strict-console fixture. A CSP violation is neither — the
  // browser fires `securitypolicyviolation` and writes nothing Playwright can see — so a refused
  // request fell between the two controls.
  //
  // It was not hypothetical. Zod probed for `eval` support with `new Function('')` while building
  // the persisted schemas, and `script-src 'self'` refused it on every page load of the deployed
  // site. Validation was unaffected, which is precisely why nothing noticed.
  //
  // This suite is the only one that runs against the real dist under the real policy, so it is the
  // only place the assertion can live.
  const violations: { directive: string; blocked: string }[] = [];
  await page.exposeFunction('__recordCspViolation', (directive: string, blocked: string) => {
    violations.push({ directive, blocked });
  });
  await page.addInitScript(() => {
    addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __recordCspViolation: (d: string, b: string) => void })
        .__recordCspViolation(event.effectiveDirective, event.blockedURI);
    });
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Progress Quest III' })).toBeVisible();

  expect(violations, `the production bundle violated its own policy: ${JSON.stringify(violations)}`).toEqual([]);

  // An empty list is the same shape whether nothing was refused or nothing was listening, so the
  // wiring is proven separately. A synthetic event rather than a real violation: every genuine one
  // also writes a console error, which the strict-console fixture correctly refuses to ignore, and
  // a test that had to whitelist its own noise would be the weaker control.
  await page.evaluate(() => {
    dispatchEvent(new SecurityPolicyViolationEvent('securitypolicyviolation', {
      effectiveDirective: 'script-src', blockedURI: 'wiring-probe',
    }));
  });
  await expect.poll(() => violations).toEqual([{ directive: 'script-src', blocked: 'wiring-probe' }]);
});

test('publishes the Progress Quest III install contract at its Pages scope', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './favicon.svg');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.webmanifest');
  await expect(page.getByRole('link', { name: 'Credits & notices' })).toHaveAttribute('href', './THIRD_PARTY_NOTICES.txt');
  const notices = await page.evaluate(async () => (await fetch('./THIRD_PARTY_NOTICES.txt')).text());
  expect(notices).toContain('SIL OPEN FONT LICENSE Version 1.1');
  expect(notices).toContain('directed and reviewed by William Zujkowski');
  expect(notices).toContain('AI-assisted research, implementation, and testing');
  const manifest = await page.evaluate(async () => {
    const response = await fetch('./manifest.webmanifest');
    return response.json() as Promise<Record<string, unknown>>;
  });

  expect(manifest).toMatchObject({
    name: 'Progress Quest III',
    short_name: 'ProgQuest III',
    start_url: './',
    scope: './',
    display: 'standalone',
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: './icon-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: './icon-512.png', sizes: '512x512', type: 'image/png' }),
  ]));
  const iconDimensions = await page.evaluate(async () => Promise.all(['./icon-192.png', './icon-512.png'].map((src) => new Promise<string>((resolve, reject) => {
    const icon = new Image();
    icon.onload = () => resolve(`${icon.naturalWidth}x${icon.naturalHeight}`);
    icon.onerror = reject;
    icon.src = src;
  }))));
  expect(iconDimensions).toEqual(['192x192', '512x512']);

  const workerSource = await page.evaluate(async () => (await fetch('./sw.js')).text());
  expect(workerSource).not.toMatch(/CACHE_PREFIX\}development/);
});

test('loads the Pages-scoped app offline after one successful visit', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0);
  await expect(page.locator('.pwa-status[role="status"]')).toHaveCount(0);
  await page.reload();

  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/progress-quest-iii\/sw\.js$/);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { level: 1, name: 'Progress Quest III' })).toBeVisible();
  await expect(page.getByText('Zero players. Zero developers. Progress continues regardless.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Chatter' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('region', { name: 'Activity Event Log' })).toBeVisible();
  await page.getByRole('tab', { name: 'Chatter' }).click();
  await expect(page.getByRole('region', { name: 'Simulated chatter' })).toBeVisible();
  // The chatter panel is one blended stream now, with no filter and no mute to drive offline. What
  // this step is actually for is that the panel works at all from cache, so it asserts that.
  await expect(page.getByRole('region', { name: 'Fictional chatter messages' })).toBeVisible();
  const offlineNotices = await page.evaluate(async () => (await fetch('./THIRD_PARTY_NOTICES.txt')).text());
  expect(offlineNotices).toContain('Johannes Baagøe');
  expect(offlineNotices).toContain('directed and reviewed by William Zujkowski');
});

test.describe('a worker that is not there', () => {
  // The 404 is the point of the test: the server is told to stop serving sw.js, and the browser
  // reports the failed registration on the console before anything visible happens. Declared
  // narrowly rather than opting the test out of the guard, so a second, unrelated error raised
  // on the way through this path still fails the test instead of hiding behind the first.
  test.use({ expectedPageErrors: [/A bad HTTP response code \(404\) was received when fetching the script\./] });

  test('keeps questing when service-worker registration fails', async ({ page, request }) => {
    await request.post('./__test__/worker-mode/missing');
    try {
      await page.goto('./');

      await expect(page.locator('.pwa-status[role="status"]')).toHaveText('Offline mode is unavailable. Questing may require civilization.');
      await expect(page.getByRole('heading', { level: 1, name: 'Progress Quest III' })).toBeVisible();
      await expect(page.locator('.pwa-status[role="status"]')).toHaveCount(1);
      await expectNoViolations(page, 'service worker registration failed');
    } finally {
      await request.post('./__test__/worker-mode/normal');
    }
  });
});

test('reports a first-install precache failure without leaving a cache', async ({ page, request }) => {
  await request.post('./__test__/worker-mode/broken');
  try {
    await page.goto('./');

    await expect(page.locator('.pwa-status[role="status"]')).toHaveText('Offline mode is unavailable. Questing may require civilization.');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress Quest III' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual([]);
  } finally {
    await request.post('./__test__/worker-mode/normal');
  }
});

test('applies an update only after the user approves it and removes the stale cache', async ({ page, request }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const initialCaches = await page.evaluate(() => caches.keys());
  expect(initialCaches).toHaveLength(1);
  expect(initialCaches[0]).toMatch(/^progress-quest-ii-shell-/);

  await request.post('./__test__/worker-mode/update');
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('./'))?.update());
    const updateButton = page.getByRole('button', { name: 'Update now' });
    await expect(updateButton).toBeVisible();
    expect(await page.evaluate(() => caches.keys())).toEqual([
      ...initialCaches,
      'progress-quest-ii-shell-pwa-test-update',
    ]);

    await expectNoViolations(page, 'update available');
    await updateButton.focus();
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    await expect(page.getByRole('heading', { level: 1, name: 'Progress Quest III' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['progress-quest-ii-shell-pwa-test-update']);
  } finally {
    await request.post('./__test__/worker-mode/normal');
  }
});

test('bounds a stalled activation and restores a retry without disturbing the session', async ({ page, request }) => {
  const clockOrigin = Date.UTC(2026, 0, 1);
  await page.clock.install({ time: clockOrigin });
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const initialCaches = await page.evaluate(() => caches.keys());
  const initialController = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  await page.evaluate(() => localStorage.setItem('progquest_roster_v1', 'STILL-QUESTING'));

  await request.post('./__test__/worker-mode/stalled');
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('./'))?.update());
    const updateButton = page.getByRole('button', { name: 'Update now' });
    await expect(updateButton).toBeVisible();
    await page.clock.pauseAt(clockOrigin + 60_000);
    await updateButton.click();

    const status = page.locator('.pwa-status[role="status"]');
    await expect(status).toHaveAttribute('aria-busy', 'true');
    await expect(status).toHaveText('Applying the new edition. Please hold while progress is reclassified.');
    await expect(status.getByRole('button')).toHaveCount(0);

    await page.clock.runFor(4_000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(20_000);
    await expect(status).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(5_999);
    await expect(status).toHaveAttribute('aria-busy', 'true');
    await page.clock.runFor(1);

    await expect(status).toContainText('The update declined its promotion. The current edition remains in office.');
    await expect(status).toHaveAttribute('aria-busy', 'false');
    const retryButton = page.getByRole('button', { name: 'Retry update' });
    await expect(retryButton).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(initialController);
    expect(await page.evaluate(() => localStorage.getItem('progquest_roster_v1'))).toBe('STILL-QUESTING');
    expect(await page.evaluate(() => caches.keys())).toEqual([
      ...initialCaches,
      'progress-quest-ii-shell-pwa-test-stalled',
    ]);

    await retryButton.click();
    await expect(status).toHaveAttribute('aria-busy', 'true');
    await expect(status.getByRole('button')).toHaveCount(0);
    await page.clock.resume();

    await expectNoViolations(page, 'retry after a failed update');
  } finally {
    await request.post('./__test__/worker-mode/normal');
  }
});

test('keeps the previous offline shell when an update fails atomically', async ({ page, context, request }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const initialCaches = await page.evaluate(() => caches.keys());

  await request.post('./__test__/worker-mode/broken');
  try {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('./');
      await registration?.update();
      const worker = registration?.installing;
      if (!worker || worker.state === 'redundant') return;
      await new Promise<void>((resolve) => worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant') resolve();
      }));
    });

    await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0);
    await expect(page.locator('.pwa-status[role="status"]')).toHaveText('The update declined its promotion. The current edition remains in office.');
    expect(await page.evaluate(() => caches.keys())).toEqual(initialCaches);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Progress Quest III' })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await request.post('./__test__/worker-mode/normal');
  }
});

test('never runtime-caches query or user-derived data', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(async () => {
    localStorage.setItem('progquest_roster_v1', 'PRIVATE-ROSTER-MARKER');
    await fetch('./manifest.webmanifest?roster=PRIVATE-ROSTER-MARKER');
  });

  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))).flat().map((request) => request.url);
  });
  // A worker that failed to register or precache leaves this empty, and "nothing cached carries
  // private data" is then true for the wrong reason. The privacy claim needs something to hold on.
  expect(cachedUrls.length, 'nothing was cached, so the privacy assertion has nothing to check').toBeGreaterThan(0);
  expect(cachedUrls.some((url) => url.includes('?') || url.includes('PRIVATE-ROSTER-MARKER'))).toBe(false);
});
