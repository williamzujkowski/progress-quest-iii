import { devices, type Page } from '@playwright/test';
import { appReady, expect, test, watchForErrors } from './fixtures/strictConsole';
import { expectNoViolations } from './fixtures/accessibility';
import { readFile } from 'node:fs/promises';
import { createNewCharacter } from '../src/engine/sim';
import { DEFAULT_CHECKPOINT_INTERVAL_MS } from '../src/data/limits';
import { archivedSessionStorageState } from './fixtures/archivedSession';
import { returningSessionStorageState } from './fixtures/returningSession';
import { expectVisibleFocusRing } from './fixtures/focusVisibility';

// Origin comes from playwright.config.ts, which reserves a free port per invocation so runs
// cannot borrow each other's dev server or a stale one from another branch.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

const returningStorageState = returningSessionStorageState(BASE_URL);

// Long enough that a checkpoint flush would have happened by now, so "nothing was written" is a
// finding rather than a race the test won. Derived from the scheduler's own interval: hard-coding
// it turns every one of these waits into a no-op the day that interval is raised.
const PAST_ONE_CHECKPOINT_MS = DEFAULT_CHECKPOINT_INTERVAL_MS + 100;

const openActivityTab = async (page: Page) => {
  const tab = page.getByRole('tab', { name: 'Activity' });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
};

const loadDenseDashboard = async (page: Page) => {
  // ponytail: seed through Zustand's exported API; a production-only fixture route would add more test machinery.
  await page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/gameStore.ts');
    const state = useGameStore.getState();
    const log = Array.from({ length: 50 }, (_, index) => ({ id: 49 - index, message: `Event ${50 - index}` }));
    useGameStore.setState({
      isPaused: true,
      character: {
        ...state.character,
        Equip: {
          ...state.character.Equip,
          Weapon: '+100 Derated Diamond Sword of Administrative Finality',
          Helm: 'Escrowed Tax Hat of Unscheduled Compliance',
        },
        Inventory: [
          { name: 'Gold', qty: 0 },
          ...Array.from({ length: 80 }, (_, index) => ({ name: `Loot item ${index + 1}`, qty: index + 1 })),
        ],
        Spells: Array.from({ length: 18 }, (_, index) => ({ name: `Procedural Disappointment ${index + 1}`, level: index + 1 })),
      },
      log,
      nextActivityId: 50,
    });
  });
  await expect(page.locator('.log-entry')).toHaveCount(50);
  await expect(page.getByRole('list', { name: 'Inventory items' }).locator('.equip-item')).toHaveCount(80);
};

test.describe('Progress Quest III terminal dashboard', () => {
  test.use({ storageState: returningStorageState });

  test('requires character creation on a first visit and automatically checkpoints the result', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 320, height: 900 },
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const expectNoPageErrors = watchForErrors(page);
    await page.goto('/');

    const creator = page.getByRole('dialog', { name: /New Character/i });
    await expect(creator).toBeVisible();
    await expect(creator).toContainText('No resumable adventurer was found');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectNoViolations(page);
    await expect(creator.getByRole('button', { name: /Close character creator/i })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(creator).toBeVisible();
    await creator.click({ position: { x: 2, y: 2 } });
    await expect(creator).toBeVisible();
    await page.waitForTimeout(PAST_ONE_CHECKPOINT_MS);
    expect(await page.evaluate(() => localStorage.getItem('progquest_active_session_v1'))).toBeNull();

    await creator.getByRole('textbox', { name: 'Character Name' }).fill('First Bureaucrat');
    await creator.getByRole('button', { name: /Sold! Start Questing/i }).click();
    await expect(creator).toBeHidden();
    await expect(page.locator('.hero-name > span:not(.badge)')).toHaveText('First Bureaucrat');
    await expect(page.locator('.hero-sub')).toContainText('Prologue');
    await expect(page.locator('.quest-card .badge')).toHaveText('Prologue');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('progquest_active_session_v1'))).not.toBeNull();
    expect(await page.evaluate(async () => {
      const { activeCheckpointV1Schema } = await import('/src/state/schemas.ts');
      const checkpoint = activeCheckpointV1Schema.parse(JSON.parse(localStorage.getItem('progquest_active_session_v1') ?? ''));
      return { schemaVersion: checkpoint.schemaVersion, name: checkpoint.session.character.Traits.Name };
    })).toEqual({ schemaVersion: 1, name: 'First Bureaucrat' });
    expectNoPageErrors();
    await context.close();
  });

  test('draws the race and class controls it refused the platform version of', async ({ browser }) => {
    // index.css sets `appearance: none` on every input so authored styles can beat WebKit's
    // control painting. Radios were never given the replacement, so they computed to 0x0 with no
    // border and no background: selection worked, and nothing on screen said which option was
    // chosen. 225 e2e tests missed it because they all click the label and assert state — none
    // asked whether the control could be seen.
    const context = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/');

    const creator = page.getByRole('dialog', { name: /New Character/i });
    await expect(creator).toBeVisible();

    const radios = creator.locator('input[type="radio"]');
    const boxes = await radios.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { w: Math.round(rect.width), h: Math.round(rect.height) };
    }));
    expect(boxes.length, 'no race or class controls rendered').toBeGreaterThan(0);
    expect(boxes.filter(({ w, h }) => w < 8 || h < 8), 'controls too small to see').toEqual([]);

    // And the selection has to be visible on the row, not only in the DOM. Colour alone would not
    // be enough, so the weight is asserted too.
    const chosen = creator.getByText('Sub-Subprocessor', { exact: true });
    await chosen.click();
    const [selected, other] = await creator.locator('.picker-option').evaluateAll((nodes) => {
      const pick = (node: Element) => {
        const style = getComputedStyle(node);
        return { color: style.color, weight: style.fontWeight };
      };
      const chosenRow = nodes.find((node) => node.querySelector('input:checked'));
      const plainRow = nodes.find((node) => !node.querySelector('input:checked'));
      return [chosenRow ? pick(chosenRow) : null, plainRow ? pick(plainRow) : null];
    });
    expect(selected, 'nothing was selected').not.toBeNull();
    expect(selected!.color, 'the selected row is not distinguished by colour').not.toBe(other!.color);
    expect(selected!.weight, 'the selected row is not distinguished by weight').not.toBe(other!.weight);
    await context.close();
  });

  test('promotes the most recently saved roster character when no active checkpoint exists', async ({ browser }) => {
    const earlier = createNewCharacter('Earlier Roster', 'Half Daemon', 'Robot Monk', 706);
    const latest = createNewCharacter('Latest Roster', 'Off-Prem Elf', 'Vermineer', 707);
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: {
        cookies: [],
        origins: [{
          origin: BASE_URL,
          localStorage: [{ name: 'progquest_roster_v1', value: JSON.stringify({ 'Earlier Roster': earlier, 'Latest Roster': latest }) }],
        }],
      },
    });
    const page = await context.newPage();
    const expectNoPageErrors = watchForErrors(page);
    await page.goto('/');

    await expect(page.getByRole('dialog', { name: /New Character/i })).toHaveCount(0);
    await expect(page.locator('.hero-name > span:not(.badge)')).toHaveText('Latest Roster');
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem('progquest_active_session_v1');
      return raw ? JSON.parse(raw).session.character.Traits.Name : null;
    })).toBe('Latest Roster');
    expectNoPageErrors();
    await context.close();
  });

  test('resumes the exact active session before the game clock starts', async ({ page }) => {
    await page.goto('/');
    const expected = await page.evaluate(async () => {
      const [{ useGameStore }, { RandomGenerator }, { captureActiveSession }] = await Promise.all([
        import('/src/state/gameStore.ts'),
        import('/src/engine/prng.ts'),
        import('/src/state/sessionCheckpoint.ts'),
      ]);
      const state = useGameStore.getState();
      const rng = new RandomGenerator('e2e-checkpoint');
      rng.random(999);
      const log = [
        { id: state.nextActivityId + 1, message: 'Checkpointed indignity' },
        { id: state.nextActivityId, message: 'Earlier paperwork' },
      ];
      useGameStore.setState({
        character: {
          ...state.character,
          Traits: { ...state.character.Traits, Name: 'Reloaded Bureaucrat' },
          Task: { ...state.character.Task, elapsedMs: 321 },
        },
        rng,
        isPaused: true,
        log,
        nextActivityId: state.nextActivityId + log.length,
        progression: { experience: { currentSeconds: 3, maxSeconds: 10 }, completedTasks: 7, elapsedSeconds: 22 },
      });
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      // savedAtMs is wall-clock and legitimately differs across a reload; the claim under test
      // is that the session state resumes exactly, not that the save timestamp is frozen.
      const { savedAtMs: _ignored, ...session } = captureActiveSession().session;
      return session;
    });

    await page.reload({ waitUntil: 'networkidle' });

    const restored = await page.evaluate(async () => {
      const { captureActiveSession } = await import('/src/state/sessionCheckpoint.ts');
      const { savedAtMs: _ignored, ...session } = captureActiveSession().session;
      return session;
    });
    expect(restored).toEqual(expected);
    await expect(page.getByText('Reloaded Bureaucrat')).toBeVisible();
  });

  test('recovers the last-known-good session without overwriting corrupt bytes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await appReady(page);
    await page.evaluate(async () => {
      const { ACTIVE_CHECKPOINT_KEY, ACTIVE_CHECKPOINT_LKG_KEY, captureActiveSession } = await import('/src/state/sessionCheckpoint.ts');
      localStorage.setItem(ACTIVE_CHECKPOINT_LKG_KEY, JSON.stringify(captureActiveSession()));
      localStorage.setItem(ACTIVE_CHECKPOINT_KEY, '{unreadable');
    });

    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.getByRole('alert')).toContainText('Recovered the last known good session');
    await page.waitForTimeout(PAST_ONE_CHECKPOINT_MS);
    expect(await page.evaluate(() => localStorage.getItem('progquest_active_session_v1'))).toBe('{unreadable');
    await page.getByRole('button', { name: 'Replace unreadable checkpoint' }).click();
    await expect(page.locator('.session-status[role="status"]')).toContainText('Automatic checkpoints resumed');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('progquest_active_session_v1') ?? '').schemaVersion)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('reports denied checkpoint storage without preventing play', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new DOMException('Denied', 'SecurityError'); } });
    });

    await page.goto('/');

    await expect(page.getByRole('alert')).toContainText('Browser storage is unavailable. Automatic checkpoints are paused.');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress Quest III' })).toBeVisible();
  });

  test('recovers accessibly from an unexpected root render failure', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('progquest_roster_v1', '{"Krg":{"still":"saved"}}');
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: () => { throw new Error('deliberate render failure with private details'); },
      });
    });
    await page.goto('/');

    const heading = page.getByRole('heading', { name: /quest process encountered an enthusiasm/i });
    await expect(heading).toBeFocused();
    await expect(page.getByText(/saved characters were not deleted/i)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('progquest_roster_v1'))).toBe('{"Krg":{"still":"saved"}}');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Retry interface' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Reload page' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Download current save' })).toBeFocused();
    const saveDownload = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const savedFile = await saveDownload;
    expect(savedFile.suggestedFilename()).toBe('progquest-current.pqw');
    const savedPath = await savedFile.path();
    expect(savedPath).not.toBeNull();
    expect(Buffer.from(await readFile(savedPath!, 'utf8'), 'base64').toString('utf8')).toContain('"Traits"');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Download diagnostics' })).toBeFocused();
    const diagnosticDownload = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const diagnosticFile = await diagnosticDownload;
    expect(diagnosticFile.suggestedFilename()).toBe('progquest-diagnostics.json');
    const diagnosticPath = await diagnosticFile.path();
    expect(diagnosticPath).not.toBeNull();
    const diagnosticReport = JSON.parse(await readFile(diagnosticPath!, 'utf8')) as { events: Array<{ code: string }> };
    expect(diagnosticReport.events.some((event) => event.code === 'react_caught')).toBe(true);
    await expect(page.locator('.recovery-status[role="status"]')).toHaveText(/nothing was uploaded/i);

    for (const theme of ['remarque-dark', 'remarque-light', 'progros'] as const) {
      await page.evaluate(async (themeId) => {
        const { applyTheme } = await import('/src/theme.ts');
        applyTheme(document.documentElement, themeId);
      }, theme);
      await expectNoViolations(page, theme);
    }
  });

  test('captures an unhandled rejection without exporting its private message', async ({ page }) => {
    await page.goto('/');
    const report = await page.evaluate(async () => {
      const { diagnostics } = await import('/src/state/diagnostics.ts');
      const rejection = new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: new Error('Krg token=secret /home/william/save.pqw?auth=yes'),
      });
      window.dispatchEvent(rejection);
      return diagnostics.exportReport();
    });

    expect(report).toContain('unhandled_rejection');
    expect(report).not.toMatch(/Krg|secret|william|save\.pqw|auth=/i);
  });

  test('contains rejected audio startup and reports an accessible unavailable state', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      class RejectedAudioContext {
        public readonly state = 'suspended';
        public readonly currentTime = 0;
        public readonly destination = {};
        private resumeAttempts = 0;

        public resume(): Promise<void> {
          this.resumeAttempts += 1;
          return this.resumeAttempts === 1
            ? Promise.reject(new DOMException('Activation denied', 'NotAllowedError'))
            : Promise.resolve();
        }

        public createOscillator() {
          return { connect() {}, start() {}, stop() {} };
        }

        public createGain() {
          return { gain: { setValueAtTime() {} }, connect() {} };
        }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: RejectedAudioContext });
    });
    await page.goto('/');
    const initialCharacter = await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      return useGameStore.getState().character.Traits.Name;
    });

    await page.getByRole('button', { name: 'Audio' }).click();
    await page.getByRole('button', { name: 'Muted' }).click();

    await expect(page.getByRole('button', { name: 'Retry audio' })).toBeVisible();
    await expect(page.locator('.audio-status')).toHaveText(
      'Sound effects are unavailable. Questing will continue in dignified silence.',
    );
    const recovery = await page.evaluate(async () => {
      const [{ diagnostics }, { useGameStore }] = await Promise.all([
        import('/src/state/diagnostics.ts'),
        import('/src/state/gameStore.ts'),
      ]);
      const before = useGameStore.getState();
      before.tick(1);
      const after = useGameStore.getState();
      return {
        diagnosticCodes: diagnostics.snapshot().map((event) => event.code),
        name: after.character.Traits.Name,
        progressed: after.progression.completedTasks > before.progression.completedTasks
          || after.character.Task.elapsedMs > before.character.Task.elapsedMs,
      };
    });
    expect(recovery.diagnosticCodes).toContain('audio_resume_failed');
    expect(recovery.name).toBe(initialCharacter);
    expect(recovery.progressed).toBe(true);

    await page.getByRole('button', { name: 'Retry audio' }).click();
    await expect(page.getByRole('button', { name: 'Audio' })).toBeVisible();
    await expect(page.locator('.audio-status')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await expectNoViolations(page);
  });

  test('saves explicitly and recovers from clipboard denial without a write storm', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/');
    await appReady(page);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      const trackedWindow = window as Window & { __rosterWrites?: number };
      trackedWindow.__rosterWrites = 0;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'progquest_roster_v1') trackedWindow.__rosterWrites = (trackedWindow.__rosterWrites ?? 0) + 1;
        return original.call(this, key, value);
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
      });
    });

    await page.getByRole('button', { name: /Roster & Saves/i }).click();
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => (window as Window & { __rosterWrites?: number }).__rosterWrites)).toBe(0);
    const fallback = page.getByRole('textbox', { name: 'Current save text' });
    await expect(fallback).toHaveAttribute('readonly', '');
    await fallback.focus();
    await expect(fallback).toBeFocused();
    await fallback.selectText();
    expect(await fallback.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length;
    })).toBe(true);

    await page.getByRole('button', { name: 'Save current character' }).click();
    await expect(page.getByRole('dialog', { name: 'Character Roster & Save Manager' }).getByRole('status')).toContainText('Character saved');
    expect(await page.evaluate(() => (window as Window & { __rosterWrites?: number }).__rosterWrites)).toBe(1);

    await page.getByRole('button', { name: 'Copy Base64 .pqw Save String' }).click();
    await expect(page.getByRole('alert')).toContainText('copy it manually');
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectNoViolations(page);
  });

  test('renders full game interface with Hero Banner, loadout, quest log, and spell book', async ({ page }) => {
    await page.goto('/');

    // Check navbar brand
    await expect(page).toHaveTitle('Progress Quest III — The Search for More Compute');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress Quest III' })).toBeVisible();
    await expect(page.getByText('Zero players. Zero developers. Progress continues regardless.')).toBeVisible();

    // Check Hero Banner
    await expect(page.getByRole('region', { name: /Hero Overview Banner/i })).toBeVisible();

    // Prime stats belong to the compact hero banner; the left card is the loadout.
    const hero = page.getByRole('region', { name: /Hero Overview Banner/i });
    await expect(hero.getByTestId('hero-prime-stats')).toBeVisible();
    await expect(hero.locator('[data-testid="hero-prime-stats"] strong')).toHaveCount(6);
    await expect(page.getByText('Character Loadout')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Character Loadout' })).not.toContainText('Prime Stats');
    await expect(page.getByText(/Spell Book/i)).toBeVisible();
    await expect(page.getByText('No spells have been learned. They arrive automatically at level-up and may also be awarded for completed quests; the curriculum remains aggressively theoretical.')).toBeVisible();
    await expect(page.getByText('No loot has been retained. Combat supplies it automatically; procurement awaits a monster with transferable assets.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Equipment List' }).locator('.tooltip-trigger')).toHaveCount(11);
    // Carried weight sits on the inventory panel; Gold reads once, on the hero banner.
    await expect(page.locator('.inventory-card .card-header .inventory-weight')).toBeVisible();
    await expect(page.locator('.inventory-card .card-header')).not.toContainText('GP');
    await expect(page.locator('.gold-pill .tooltip-trigger')).toBeVisible();
    await page.locator('.tooltip-trigger').first().focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    expect(await page.getByRole('tooltip').evaluate((element) => element.parentElement === document.body)).toBe(true);

    // Check questing card
    await expect(page.getByText('Questing & Progression')).toBeVisible();

    // Check the shared world console
    await expect(page.getByRole('heading', { name: 'Console' })).toBeVisible();

    // Check inventory card
    await expect(page.getByText('Inventory & Loot')).toBeVisible();
  });

  test('shows mechanics and flavor for equipment, loot, and spells', async ({ page }) => {
    await page.goto('/');
    await appReady(page);
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        character: {
          ...state.character,
          Equip: { ...state.character.Equip, Weapon: 'Punitive Short Sprint' },
          Inventory: [{ name: 'Gold', qty: 0 }, { name: 'Certified Order of Forecast', qty: 3 }],
          Gold: 42,
          Spells: [{ name: 'Quick Win', level: 2 }],
        },
      });
    });

    const weapon = page.locator('.tooltip-trigger', { hasText: 'Punitive Short Sprint' });
    await weapon.focus();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('Generation quality: 9 (Short Sprint 5 + Punitive +4)');
    // The claim moved because it was false. "classic encounter time ignores equipment" stopped
    // being true when ADR 0008 shipped, and the tooltip went on saying it on the same screen as a
    // world-console filing reporting the reduction.
    await expect(tooltip).toContainText('Contributes 9 to the loadout total, which is what shortens encounters');
    await expect(tooltip).toContainText('damage is not modeled');
    expect(await tooltip.evaluate((element) => element.parentElement === document.body)).toBe(true);
    const tooltipBox = await tooltip.boundingBox();
    // Narrowing rather than optional-chaining: `box?.x + (box?.width ?? 0)` evaluates to NaN
    // when the box is null, and every comparison against NaN is false.
    if (!tooltipBox) throw new Error('Tooltip reported no bounding box, so it is not rendered.');
    expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBox.y).toBeGreaterThanOrEqual(0);
    expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(1280);
    await page.locator('.tooltip-trigger', { hasText: 'Certified Order of Forecast' }).focus();
    await expect(page.getByRole('tooltip')).toContainText('Encumbrance: +3 cubits');
    await page.locator('.tooltip-trigger', { hasText: 'Quick Win' }).focus();
    await expect(page.getByRole('tooltip')).toContainText('Spell rank: 2');
    await page.locator('.gold-pill').getByRole('button', { name: '42 GP' }).focus();
    await expect(page.getByRole('tooltip')).toContainText('Encumbrance: +0 cubits');
  });

  test('keeps a tooltip open under the pointer and dismisses it with Escape', async ({ page }) => {
    await page.goto('/');

    const trigger = page.locator('.tooltip-trigger').first();
    await trigger.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await trigger.focus();
    await expect(tooltip).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-describedby', await tooltip.getAttribute('id') ?? 'missing-tooltip-id');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('toggles a tooltip by touch inside a narrow viewport', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['iPhone 13'], baseURL: BASE_URL, storageState: returningStorageState });
    const page = await context.newPage();
    const expectNoPageErrors = watchForErrors(page);
    await page.goto('/');

    const trigger = page.locator('.tooltip-trigger').first();
    // Asserted through the tooltip itself rather than aria-expanded, which the trigger no longer
    // carries: it is for a control that expands a region, and this controls a role="tooltip".
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await trigger.tap();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    if (!box) throw new Error('Tooltip reported no bounding box, so it is not rendered.');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.getByRole('heading', { name: 'Progress Quest III' }).tap();
    await expect(tooltip).toBeHidden();
    await trigger.tap();
    await expect(tooltip).toBeVisible();
    await trigger.tap();
    await expect(tooltip).toBeHidden();
    await expect(trigger).not.toHaveAttribute('aria-describedby', /./);

    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        isPaused: true,
        character: {
          ...state.character,
          Inventory: [
            { name: 'Gold', qty: 0 },
            ...Array.from({ length: 79 }, (_, index) => ({ name: `Loot item ${index + 1}`, qty: 1 })),
            { name: 'X'.repeat(200), qty: 1 },
          ],
        },
      });
    });
    const lastItem = page.locator('.inventory-list .tooltip-trigger').last();
    await lastItem.scrollIntoViewIfNeeded();
    await lastItem.tap();
    const longTooltip = page.getByRole('tooltip');
    const longBox = await longTooltip.boundingBox();
    if (!longBox) throw new Error('Tooltip reported no bounding box, so it is not rendered.');
    expect(longBox.y).toBeGreaterThanOrEqual(0);
    expect(longBox.y + longBox.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    expectNoPageErrors();
    await context.close();
  });

  test('selects and persists an OKLCH terminal theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    const themePicker = page.getByRole('combobox', { name: 'Visual theme' });
    await expect(themePicker).toHaveValue('remarque-dark');
    await expect(page.locator('html')).toHaveAttribute('data-terminal-theme', 'remarque-dark');

    await themePicker.selectOption('remarque-light');
    await expect(page.locator('html')).toHaveAttribute('data-terminal-theme', 'remarque-light');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8f6f3');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('progquest_theme_v1'))).toBe('remarque-light');

    await page.reload();
    await expect(themePicker).toHaveValue('remarque-light');
    await themePicker.selectOption('progros');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'progros');
    await expect(page.locator('html')).not.toHaveAttribute('data-terminal-theme', /.+/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', 'oklch(0.55 0.12 185)');
  });

  test('keeps the selected theme usable when preference storage rejects the write', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await appReady(page);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'progquest_theme_v1') throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });

    await page.getByRole('combobox', { name: 'Visual theme' }).selectOption('remarque-light');

    await expect(page.locator('html')).toHaveAttribute('data-terminal-theme', 'remarque-light');
    await expect(page.locator('.theme-status[role="status"]')).toHaveText('Theme changed, but this browser could not remember it.');
    const diagnosticCodes = await page.evaluate(async () => {
      const { diagnostics } = await import('/src/state/diagnostics.ts');
      return diagnostics.snapshot().map((event) => event.code);
    });
    expect(diagnosticCodes).toContain('theme_write_failed');
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectNoViolations(page);
  });

  test('uses the system theme accessibly when preference storage rejects the read', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      localStorage.setItem('progquest_theme_v1', 'progros');
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      const trackedWindow = window as Window & { __themeWrites?: number };
      trackedWindow.__themeWrites = 0;
      Storage.prototype.getItem = function(key) {
        if (key === 'progquest_theme_v1') throw new DOMException('Access denied', 'SecurityError');
        return originalGet.call(this, key);
      };
      Storage.prototype.setItem = function(key, value) {
        if (key === 'progquest_theme_v1') {
          trackedWindow.__themeWrites = (trackedWindow.__themeWrites ?? 0) + 1;
          throw new DOMException('Access denied', 'SecurityError');
        }
        return originalSet.call(this, key, value);
      };
    });
    await page.goto('/');

    await expect(page.getByRole('combobox', { name: 'Visual theme' })).toHaveValue('remarque-dark');
    await expect(page.locator('.theme-status[role="status"]')).toHaveText('Theme preference unavailable; using your system default.');
    const diagnosticCodes = await page.evaluate(async () => {
      const { diagnostics } = await import('/src/state/diagnostics.ts');
      return diagnostics.snapshot().map((event) => event.code);
    });
    expect(diagnosticCodes).toContain('theme_read_failed');
    expect(await page.evaluate(() => (window as Window & { __themeWrites?: number }).__themeWrites)).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test('keeps the theme picker keyboard reachable with a visible focus ring', async ({ page }) => {
    await page.goto('/');

    const themePicker = page.getByRole('combobox', { name: 'Visual theme' });
    let reachedThemePicker = false;
    for (let tabIndex = 0; tabIndex < 10; tabIndex += 1) {
      await page.keyboard.press('Tab');
      if (await themePicker.evaluate((element) => element === document.activeElement)) {
        reachedThemePicker = true;
        break;
      }
    }

    expect(reachedThemePicker).toBe(true);
    await expectVisibleFocusRing(themePicker, 'theme picker');
  });

  test('labels activity events without substring false positives', async ({ page }) => {
    await page.goto('/');
    await appReady(page);
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const messages = [
        'Activity 50',
        'Resting at the inn.',
        'Welcome to Progress Quest III! Krg sets out on an adventure.',
        'Act 2 Unlocked!',
        'LEVEL UP! Advanced to level 2!',
        'Quest completed: Find the lost stapler',
        'Defeated monster and looted a bent fork.',
        'Got paid 10 gold pieces',
        'Negotiated purchase: Equipped Tax Hat in Helm slot!',
        'Executing a passing pigeon...',
      ];
      useGameStore.setState({
        isPaused: true,
        log: messages.map((message, id) => ({ id, message })),
        nextActivityId: messages.length,
      });
    });
    await openActivityTab(page);

    const log = page.getByRole('region', { name: 'Activity Event Log' });
    const tagFor = (message: string) => log.locator('.log-entry', { hasText: message }).locator('.log-tag');
    await expect(tagFor('Activity 50')).toHaveCount(0);
    await expect(tagFor('Resting at the inn.')).toHaveCount(0);
    await expect(tagFor('Welcome to Progress Quest III! Krg sets out on an adventure.')).toHaveCount(0);
    await expect(tagFor('Act 2 Unlocked!')).toHaveText('Level');
    await expect(tagFor('LEVEL UP! Advanced to level 2!')).toHaveText('Level');
    await expect(tagFor('Quest completed: Find the lost stapler')).toHaveText('Quest');
    await expect(tagFor('Defeated monster and looted a bent fork.')).toHaveText('Loot');
    await expect(tagFor('Got paid 10 gold pieces')).toHaveCount(0);
    await expect(tagFor('Negotiated purchase: Equipped Tax Hat in Helm slot!')).toHaveText('Market');
    await expect(tagFor('Executing a passing pigeon...')).toHaveText('Combat');
  });

  test('keeps derived world context bounded, quiet, and keyboard-readable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    const context = page.getByRole('region', { name: 'Current world context' });
    await expect(context).toContainText('LOOK //');
    await expect(context).toContainText('Fictional world · activity-derived');
    await expect(context).not.toHaveAttribute('aria-live', /.+/);

    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      useGameStore.setState({
        isPaused: true,
        worldNotices: Array.from({ length: 40 }, (_, index) => ({
          id: `world:${index}:0`,
          sourceActivityId: index,
          kind: 'arrival' as const,
          text: `Derived notice ${index + 1} ${'x'.repeat(120)}`,
        })),
      });
    });

    const summary = context.getByText('World filings (40)');
    expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await summary.click();
    const notices = page.getByRole('region', { name: 'Derived world notices' });
    await notices.focus();
    await expect(notices).toBeFocused();
    expect(await notices.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await notices.evaluate((element) => element.clientHeight));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
  });

  test('reflows open world filings at a 400 percent equivalent viewport', async ({ page }) => {
    // 320 CSS pixels is the WCAG reflow equivalent of a 1280px viewport at 400% browser zoom.
    await page.setViewportSize({ width: 320, height: 225 });
    await page.goto('/');
    const context = page.getByRole('region', { name: 'Current world context' });
    const summary = context.getByText('World filings');
    await summary.focus();
    await page.keyboard.press('Enter');

    const notices = page.getByRole('region', { name: 'Derived world notices' });
    await expect(notices).toBeVisible();
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      context: document.querySelector<HTMLElement>('.world-context')!.scrollWidth - document.querySelector<HTMLElement>('.world-context')!.clientWidth,
      notices: document.querySelector<HTMLElement>('.world-context-notices')!.scrollWidth - document.querySelector<HTMLElement>('.world-context-notices')!.clientWidth,
    }));
    expect(overflow).toEqual({ page: 0, context: 0, notices: 0 });
  });

  test('gives every world-console row a column of its own to sit in', async ({ page }) => {
    // Found by looking at the running game. No existing check could catch it: there is no overflow
    // to measure, and the default 1280x720 viewport does not meet the media query that causes it.
    //
    // `.world-context` is a named-areas grid of `minmax(0, 1fr) auto` at desktop size. Two children
    // had no area, so auto-placement put them in the second column — which sizes to max-content —
    // while the first column is allowed to reach zero. The loadout filing landed there, its longest
    // line being a `cited:` list of generated item names, so the small-caps labels beside it were
    // squeezed to nothing and wrapped at every character, rendering vertically one glyph per row.
    //
    // The viewport matters and is the reason this went unseen: the rule is gated on
    // `min-height: 760px`, so nothing below that reproduces it.
    await page.setViewportSize({ width: 1790, height: 900 });
    await page.goto('/');
    await appReady(page);

    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        character: {
          ...state.character,
          Equip: {
            ...state.character.Equip,
            Hauberk: '+9 Bonded Contested Lender of Last Resort',
            Helm: '+9 Bonded Contested Situational Awareness',
            Gambeson: 'Doomsday Vault',
            Sollerets: 'Antipode',
          },
        },
      });
    });

    const filing = page.locator('.world-context-services');
    await expect(filing, 'the filing must render, or nothing below is being tested').toBeVisible();

    const cells = await page.evaluate(() => Array.from(document.querySelectorAll('.world-context-line'))
      .flatMap((row) => Array.from(row.children))
      .map((cell) => ({ text: (cell.textContent ?? '').trim(), width: cell.getBoundingClientRect().width })));

    expect(cells.length).toBeGreaterThan(0);
    // A glyph of this font is a few pixels. Forty is generous and an order of magnitude clear of the
    // failure, which measured exactly zero.
    for (const { text, width } of cells) expect(width, text).toBeGreaterThan(40);
  });

  test('never draws two world-console rows on top of each other', async ({ page }) => {
    // The companion to the starvation sweep, and the failure it did not catch. Three different lists
    // wear `world-context-services` — venue notices, the raid muster, the loadout filing — and more
    // than one renders at a time. Assigning them a named grid area pinned them all to the same cell,
    // so they drew over one another: legible-looking text, doubled and unreadable.
    //
    // A width check cannot see this. Overlap is a position failure, not a size one.
    await page.setViewportSize({ width: 1790, height: 900 });
    await page.goto('/');
    await appReady(page);
    // Two lists have to be on screen at once, which is the condition that produces the bug. Injected
    // rather than played into: `world-context-services` is worn by venue notices, the raid muster and
    // the loadout filing, and which of them render depends on where the hero happens to be standing.
    // A second one of the same class is the whole condition, and injecting it keeps the guard honest
    // whatever the game state does later.
    await page.evaluate(() => {
      const context = document.querySelector('.world-context');
      if (!context) throw new Error('expected a world console to lay out');
      for (const text of ['Notices for this venue', 'Item of record // a filing of the same kind']) {
        const list = document.createElement('ul');
        list.className = 'world-context-services';
        list.innerHTML = `<li>${text}</li>`;
        context.append(list);
      }
    });

    const overlaps = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.world-context > *'))
        .map((el) => ({ cls: String(el.className), rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);

      const found: string[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          const a = rows[i]!.rect;
          const b = rows[j]!.rect;
          const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          if (vertical > 2 && horizontal > 2) found.push(`${rows[i]!.cls} over ${rows[j]!.cls}`);
        }
      }
      return { found, rowCount: rows.length };
    });

    // The premise: a layout that rendered a single row could not overlap and would pass by vacancy.
    expect(overlaps.rowCount).toBeGreaterThan(2);
    expect(overlaps.found).toEqual([]);
  });

  test('renders no visible text in a box too narrow to hold a word', async ({ page }) => {
    // The general form of the defect the test above pins. That one was found by looking at the
    // running game, not by any of the eight hundred tests, and its cause — a grid child with no
    // area, auto-placed into a column that sizes to max-content beside one allowed to reach zero —
    // is a shape that can recur anywhere. So this sweeps rather than spot-checks.
    //
    // Visually-hidden elements are excluded by detecting the pattern rather than by listing them:
    // `position: absolute` with a zero `clip` rect is a 1px box on purpose, and reading one as a
    // symptom is a mistake already made once while diagnosing this.
    await page.setViewportSize({ width: 1790, height: 900 });
    await page.goto('/');
    await appReady(page);

    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        character: {
          ...state.character,
          Equip: {
            ...state.character.Equip,
            Hauberk: '+9 Bonded Contested Lender of Last Resort',
            Helm: '+9 Bonded Contested Situational Awareness',
            Gambeson: 'Doomsday Vault',
            Sollerets: 'Antipode',
            Brassairts: 'Royal Assent',
          },
        },
      });
    });

    const starved = await page.evaluate(() => {
      const hidden = (el: Element): boolean => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.position === 'absolute' && style.clip === 'rect(0px, 0px, 0px, 0px)') return true;
          if (style.visibility === 'hidden' || style.display === 'none') return true;
        }
        return false;
      };
      return Array.from(document.querySelectorAll('*'))
        .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 12)
        // `option` has no CSS box — the browser draws the list natively — so its zero width is not
        // a layout failure. Excluded by what it is rather than by what it measures.
        .filter((el) => !el.closest('select'))
        .filter((el) => !hidden(el))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { tag: el.tagName, cls: String(el.className || ''), width: rect.width, text: (el.textContent ?? '').trim().slice(0, 40) };
        })
        // Zero is included deliberately. A first version filtered `width > 0`, which excluded the
        // exact failure being guarded against — the starved cells measured exactly zero — and the
        // sweep passed against the broken layout. Anything genuinely absent is already removed by
        // the visibility check above.
        .filter(({ width }) => width < 40);
    });

    expect(starved, 'text squeezed below the width of a single short word').toEqual([]);
  });

  test('keeps simulated chatter quiet, bounded, responsive, and entirely local', async ({ page }) => {
    // The longest test here by some way: four viewports, a channel filter, a mute round trip, a
    // forced-colors pass and two axe audits. It fits the default budget when it has a machine to
    // itself and exceeds it once workers compete for cores, so the budget is raised rather than
    // the work reduced - every step of it is checking something.
    test.slow();
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== BASE_URL) externalRequests.push(request.url());
    });
    await page.setViewportSize({ width: 1025, height: 760 });
    await page.goto('/');
    await loadDenseDashboard(page);
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      useGameStore.setState({
        socialEntries: Array.from({ length: 48 }, (_, index) => ({
          id: `fixture:${index}`,
          sceneId: `fixture:${Math.floor(index / 3)}`,
          sceneKind: 'quest' as const,
          sourceActivityId: index,
          channel: 'guild' as const,
          speaker: {
            id: `fixture-${index}`,
            kind: 'cast' as const,
            displayName: index === 0 ? 'موظف السجلات المستحيلة 12345' : `Clerk ${index}`,
            role: 'Quest clerk',
            fictional: true as const,
            automaticHero: false,
          },
          text: `Fictional filing ${index + 1} ${'x'.repeat(80)}`,
        })),
      });
    });

    const networkRequests: string[] = [];
    page.on('request', (request) => networkRequests.push(request.url()));
    const chatterTab = page.getByRole('tab', { name: 'Chatter' });
    const activityTab = page.getByRole('tab', { name: 'Activity' });
    const chatter = page.getByRole('region', { name: 'Simulated chatter' });
    const messages = page.getByRole('region', { name: 'Fictional chatter messages' });
    const activity = page.getByRole('region', { name: 'Activity Event Log', includeHidden: true });
    await expect(chatterTab).toHaveAttribute('aria-selected', 'true');
    await expect(chatterTab).toHaveAttribute('tabindex', '0');
    await expect(activityTab).toHaveAttribute('aria-selected', 'false');
    await expect(activityTab).toHaveAttribute('tabindex', '-1');
    await expect(chatter).toBeVisible();
    await expect(activity).toBeHidden();
    await expect(chatter).toContainText('No people are online. Every message is fictional, generated locally, and sent nowhere.');
    await expect(messages).toHaveAttribute('aria-live', 'off');
    await expect(page.getByRole('status', { name: 'Latest activity' })).toHaveCount(1);
    expect(await messages.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await messages.evaluate((element) => element.clientHeight));
    expect(await messages.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(64);
    expect(await messages.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(2);
    await expect(activity).toBeHidden();
    const status = page.getByRole('status', { name: 'Latest activity' });
    await expect(status).toHaveText('Event 50');
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        log: [{ id: state.nextActivityId, message: 'Event 51' }, ...state.log].slice(0, 50),
        nextActivityId: state.nextActivityId + 1,
      });
    });
    await expect(status).toHaveText('Event 51');
    await expect(activity).toBeHidden();
    const cardBox = await page.locator('.activity-card').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(760);
    const authoritativeBefore = await page.evaluate(async () => {
      const [{ useGameStore }, { captureActiveSession }] = await Promise.all([
        import('/src/state/gameStore.ts'),
        import('/src/state/sessionCheckpoint.ts'),
      ]);
      // savedAtMs is wall-clock; two captures of identical session state are still identical
      // state, so it is excluded from the comparison rather than pinned.
      const { savedAtMs: _ignored, ...session } = captureActiveSession().session;
      return { session, generation: useGameStore.getState().sessionGeneration };
    });
    await chatterTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(activityTab).toBeFocused();
    await expect(activityTab).toHaveAttribute('aria-selected', 'true');
    await expect(activity).toBeVisible();
    expect(await activity.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(72);
    await expect(activity.locator('.log-entry')).toHaveCount(50);
    await expect(activity.locator('.log-entry').last()).toContainText('Event 51');
    await activity.evaluate((element) => {
      element.scrollTop = 40;
      element.dispatchEvent(new Event('scroll'));
    });
    await activityTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(chatterTab).toBeFocused();
    await expect(chatterTab).toHaveAttribute('aria-selected', 'true');
    const authoritativeAfter = await page.evaluate(async () => {
      const [{ useGameStore }, { captureActiveSession }] = await Promise.all([
        import('/src/state/gameStore.ts'),
        import('/src/state/sessionCheckpoint.ts'),
      ]);
      // savedAtMs is wall-clock; two captures of identical session state are still identical
      // state, so it is excluded from the comparison rather than pinned.
      const { savedAtMs: _ignored, ...session } = captureActiveSession().session;
      return { session, generation: useGameStore.getState().sessionGeneration };
    });
    expect(authoritativeAfter).toEqual(authoritativeBefore);

    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        log: [{ id: state.nextActivityId, message: 'Event 52' }, ...state.log].slice(0, 50),
        nextActivityId: state.nextActivityId + 1,
      });
    });
    await expect(status).toHaveText('Event 52');
    await activityTab.click();
    expect(await activity.evaluate((element) => element.scrollTop + element.clientHeight < element.scrollHeight - 2)).toBe(true);
    const jump = page.getByRole('button', { name: 'Jump to latest activity' });
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(activity).toBeFocused();
    expect(await activity.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(2);
    await chatterTab.click();

    for (const width of [768, 641, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator('.console-tabs').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 667, height: 375 });
    const bidiSpeaker = page.locator('bdi[data-speaker-name][dir="auto"]', { hasText: 'موظف السجلات المستحيلة 12345' });
    await expect(bidiSpeaker).toBeVisible();
    expect(await messages.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await messages.evaluate((element) => element.clientHeight));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await activityTab.click();
    await expect(activity).toBeVisible();
    expect(await activity.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await activity.evaluate((element) => element.clientHeight));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await chatterTab.click();
    await page.setViewportSize({ width: 1025, height: 760 });

    // One blended stream: no channel filter and no mute. The channels are told apart by the prefix,
    // the way this genre has always done it, so there is nothing here to drive a round trip through.
    expect(await page.getByRole('combobox', { name: 'Chatter channel' }).count()).toBe(0);
    expect(await page.getByRole('button', { name: /mute/i }).count()).toBe(0);
    expect(networkRequests).toEqual([]);
    expect(externalRequests).toEqual([]);

    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 900 });
    const selectedColors = await chatterTab.evaluate((element) => ({
      tab: getComputedStyle(element).color,
      label: getComputedStyle(element.querySelector('span')!).color,
      truth: getComputedStyle(element.querySelector('small')!).color,
    }));
    expect(selectedColors.label).toBe(selectedColors.tab);
    expect(selectedColors.truth).toBe(selectedColors.tab);
    await chatterTab.focus();
    await page.keyboard.press('End');
    await expect(activityTab).toBeFocused();
    await expect(activityTab).toHaveAttribute('aria-selected', 'true');
    await expectVisibleFocusRing(activityTab, 'activity tab');
    await page.keyboard.press('Home');
    await expect(chatterTab).toBeFocused();
    await expect(chatterTab).toHaveAttribute('aria-selected', 'true');
    for (const control of [chatterTab, activityTab]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.setViewportSize({ width: 320, height: 225 });
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      chatter: document.querySelector<HTMLElement>('.chatter-panel')!.scrollWidth - document.querySelector<HTMLElement>('.chatter-panel')!.clientWidth,
      messages: document.querySelector<HTMLElement>('.chatter-messages')!.scrollWidth - document.querySelector<HTMLElement>('.chatter-messages')!.clientWidth,
    }));
    expect(overflow).toEqual({ page: 0, chatter: 0, messages: 0 });
    await expectNoViolations(page);

    await activityTab.click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Chatter' })).toHaveAttribute('aria-selected', 'true');
  });

  test('opens and mutes automated chatter by touch', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['iPhone 13'], baseURL: BASE_URL, storageState: returningStorageState });
    const page = await context.newPage();
    const expectNoPageErrors = watchForErrors(page);
    await page.goto('/');

    const activityTab = page.getByRole('tab', { name: 'Activity' });
    const chatterTab = page.getByRole('tab', { name: 'Chatter' });
    await activityTab.tap();
    await expect(page.getByRole('region', { name: 'Activity Event Log' })).toBeVisible();
    await chatterTab.tap();
    await expect(page.getByRole('region', { name: 'Simulated chatter' })).toBeVisible();
    // The chatter panel is reachable by tap and shows its stream. There is no mute to round-trip
    // through any more, so the assertion is that the messages region is the thing that arrives.
    await expect(page.getByRole('region', { name: 'Fictional chatter messages' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expectNoPageErrors();
    await context.close();
  });

  test('retains activity row identity and exposes only the newest event to status at 50 to 51', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await loadDenseDashboard(page);
    await openActivityTab(page);

    const activityCard = page.locator('.activity-card');
    const log = activityCard.getByRole('region', { name: 'Activity Event Log' });
    const status = activityCard.getByRole('status', { name: 'Latest activity' });
    const retainedBefore = await log.locator('[data-activity-id="24"]').elementHandle();
    const droppedBefore = await log.locator('[data-activity-id="0"]').elementHandle();
    expect(retainedBefore).not.toBeNull();
    expect(droppedBefore).not.toBeNull();
    await expect(log).not.toHaveAttribute('aria-live', /.+/);
    await expect(status).toHaveAttribute('aria-atomic', 'true');
    await expect(status).toHaveText('Event 50');

    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        log: [{ id: state.nextActivityId, message: 'Event 51' }, ...state.log].slice(0, 50),
        nextActivityId: state.nextActivityId + 1,
      });
    });

    await expect(log.locator('.log-entry')).toHaveCount(50);
    await expect(log.locator('.log-entry').first()).toContainText('Event 2');
    await expect(log.locator('.log-entry').last()).toContainText('Event 51');
    await expect(status).toHaveText('Event 51');
    expect(await log.locator('[data-activity-id="24"]').evaluate((node, retained) => node === retained, retainedBefore)).toBe(true);
    expect(await droppedBefore!.evaluate((node) => node.isConnected)).toBe(false);
    expect(await log.locator('.log-entry').evaluateAll((rows) => {
      const ids = rows.map((row) => Number((row as HTMLElement).dataset.activityId));
      return new Set(ids).size === 50 && ids.every((id, index) => id === index + 1);
    })).toBe(true);
    expect(await log.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1)).toBe(true);
  });

  test('keeps the activity scroller keyboard-operable under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await loadDenseDashboard(page);
    await openActivityTab(page);

    const log = page.getByRole('region', { name: 'Activity Event Log' });
    await log.focus();
    await expect(log).toBeFocused();
    await log.press('Home');
    await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    for (let press = 0; press < 5; press += 1) await log.press('PageDown');
    await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(1);

    const motion = await log.locator('.log-entry').last().evaluate((element) => {
      const style = getComputedStyle(element);
      const duration = style.animationDuration.endsWith('ms')
        ? Number.parseFloat(style.animationDuration)
        : Number.parseFloat(style.animationDuration) * 1000;
      return { duration, iterations: style.animationIterationCount, scrollBehavior: getComputedStyle(element.parentElement!).scrollBehavior };
    });
    expect(motion.duration).toBeLessThanOrEqual(1);
    expect(motion.iterations).toBe('1');
    expect(motion.scrollBehavior).toBe('auto');
  });

  test('fills the desktop middle column with a sparse activity log', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const middleColumn = await page.locator('.quest-column').boundingBox();
    const activityCard = await page.locator('.activity-card').boundingBox();
    expect(middleColumn).not.toBeNull();
    expect(activityCard).not.toBeNull();
    expect(activityCard!.y + activityCard!.height).toBeGreaterThanOrEqual(middleColumn!.y + middleColumn!.height - 1);
  });

  test('keeps a dense desktop dashboard within one viewport and follows latest activity', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await loadDenseDashboard(page);
    await openActivityTab(page);

    const log = page.getByRole('region', { name: 'Activity Event Log' });
    const inventory = page.getByRole('list', { name: 'Inventory items' });
    const character = page.getByRole('region', { name: 'Character Loadout' });
    const equipment = page.getByRole('list', { name: 'Equipment List' });
    const spellBook = page.getByRole('list', { name: 'Spell Book' });
    const metrics = {
      page: await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: window.innerHeight })),
      log: await log.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight, top: element.scrollTop })),
      inventory: await inventory.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight })),
      character: await character.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight })),
      spells: await spellBook.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight })),
    };

    expect(metrics.page.height).toBeLessThanOrEqual(metrics.page.viewport);
    const middleColumn = await page.locator('.quest-column').boundingBox();
    const activityCard = await page.locator('.activity-card').boundingBox();
    expect(middleColumn).not.toBeNull();
    expect(activityCard).not.toBeNull();
    expect(activityCard!.y + activityCard!.height).toBeGreaterThanOrEqual(middleColumn!.y + middleColumn!.height - 1);
    expect(metrics.log.scroll).toBeGreaterThan(metrics.log.client);
    expect(metrics.log.top + metrics.log.client).toBeGreaterThanOrEqual(metrics.log.scroll - 1);
    expect(metrics.inventory.scroll).toBeGreaterThan(metrics.inventory.client);
    expect(metrics.character.scroll).toBeLessThanOrEqual(metrics.character.client);
    expect(metrics.spells.scroll).toBeGreaterThan(metrics.spells.client);
    await expect(equipment).toHaveCSS('grid-template-columns', /\S+\s+\S+/);
    await expect(page.getByText('Spell Book (18)')).toBeInViewport();
    // The card is deliberately not a focus stop. The assertion three lines above is the reason:
    // its scroll height never exceeds its client height, so focusing it announced a name and did
    // nothing. Asserted as an absence so the tabIndex cannot quietly come back.
    await expect(character).not.toHaveAttribute('tabindex', /.*/);
    await expect(log.locator('.log-entry').last()).toContainText('Event 50');
  });

  test('compacts absurd progression values without overflowing mobile or desktop', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await appReady(page);
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const { character } = useGameStore.getState();
      useGameStore.setState({
        isPaused: true,
        character: {
          ...character,
          Traits: { ...character.Traits, Level: 1_000_000 },
          Stats: Object.fromEntries(Object.keys(character.Stats).map((stat) => [stat, 999_999.999_999_999_9])) as typeof character.Stats,
          Gold: 1_000_000_000_000,
          Plot: { act: 1_000_000_000, currentProgress: 500_000_000, maxProgress: 1_000_000_000 },
          Quest: { ...character.Quest, currentProgress: 1_000_000, maxProgress: 2_000_000 },
          Inventory: [{ name: 'Gold', qty: 0 }, { name: 'nit tail', qty: 1_000_000_000 }],
          Spells: [{ name: 'Infinite Deferral', level: 1_000_000_000 }],
        },
      });
    });

    await expect(page.locator('.hero-name .badge [aria-hidden="true"]')).toHaveText('1.00e6');
    await expect(page.locator('.hero-name .badge .sr-only')).toHaveText('1 million');
    await expect(page.locator('.hero-prime-stats .hero-stat span[aria-hidden="true"]')).toHaveText(Array(6).fill('1.00e6'));
    await expect(page.locator('.hero-sub [aria-hidden="true"]')).toHaveText('1.00e9');
    await expect(page.locator('.gold-pill span[aria-hidden="true"]')).toHaveText('1.00e12');
    await expect(page.locator('.inventory-list .equip-item span[aria-hidden="true"]')).toHaveText('1.00e9');
    await page.getByRole('button', { name: 'nit tail' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('Quantity: 1.00e9');

    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        statTilesFit: [...document.querySelectorAll<HTMLElement>('.hero-stat')]
          .every((tile) => tile.scrollWidth <= tile.clientWidth),
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(dimensions.statTilesFit).toBe(true);
    }
  });

  test('contains the loadout at the one-screen desktop breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1025, height: 760 });
    await page.goto('/');
    await loadDenseDashboard(page);
    await openActivityTab(page);

    const character = page.getByRole('region', { name: 'Character Loadout' });
    const spellBook = page.getByRole('list', { name: 'Spell Book' });
    const characterBox = await character.boundingBox();
    const spellBox = await spellBook.boundingBox();

    expect(await character.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(await character.evaluate((element) => element.clientHeight));
    expect(spellBox).not.toBeNull();
    expect(spellBox!.height).toBeGreaterThan(0);
    expect(spellBox!.y + spellBox!.height).toBeLessThanOrEqual(characterBox!.y + characterBox!.height);

    const activity = page.locator('.activity-card');
    const worldContext = page.getByRole('region', { name: 'Current world context' });
    const log = page.getByRole('region', { name: 'Activity Event Log' });
    const activityBox = await activity.boundingBox();
    const contextBox = await worldContext.boundingBox();
    expect(activityBox).not.toBeNull();
    expect(contextBox).not.toBeNull();
    expect(activityBox!.y + activityBox!.height).toBeLessThanOrEqual(760);
    expect(contextBox!.y + contextBox!.height).toBeLessThanOrEqual(activityBox!.y + activityBox!.height);
    // Two compact event rows plus feed padding remain visible while longer history scrolls.
    expect(await log.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(72);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(760);
  });

  test('marks every equipment slot with its own glyph and keeps the name spoken', async ({ page }) => {
    // The two-column grid below is what keeps the dashboard on one screen and
    // it used to be paid for out of the slot label, which clipped all eleven times at 1806px —
    // "Helm" included. The label is a glyph now, so the two assertions worth pinning are that the
    // glyphs actually distinguish the slots, and that dropping the visible text did not drop the
    // slot name from the accessible tree.
    //
    // Distinctness is the one that bites: before this, ten of the eleven slots rendered the same
    // shield, so the marker identified nothing. A clipping assertion here would be decorative — an
    // svg in a flex row shrinks rather than overflowing, so it cannot fail.
    await page.goto('/');
    await loadDenseDashboard(page);

    const markers = await page.locator('.equip-slot-icon').evaluateAll((nodes) =>
      nodes.map((node) => ({
        spokenName: node.textContent?.trim(),
        glyph: node.querySelector('svg')?.getAttribute('class'),
      })));

    expect(markers).toHaveLength(11);
    expect(markers.map((marker) => marker.spokenName)).toEqual(
      ['Weapon', 'Shield', 'Helm', 'Hauberk', 'Brassairts', 'Vambraces',
        'Gauntlets', 'Gambeson', 'Cuisses', 'Greaves', 'Sollerets'],
    );
    expect(new Set(markers.map((marker) => marker.glyph)).size, 'slots share a glyph').toBe(11);
  });

  test('keeps the compact equipment grid on wide, short screens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto('/');
    await loadDenseDashboard(page);

    await expect(page.getByRole('list', { name: 'Equipment List' })).toHaveCSS('grid-template-columns', /\S+\s+\S+/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
  });

  for (const width of [320, 375, 768]) {
    test(`bounds growing dashboard feeds at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await loadDenseDashboard(page);
      await openActivityTab(page);

      const log = page.getByRole('region', { name: 'Activity Event Log' });
      const inventory = page.getByRole('list', { name: 'Inventory items' });
      const spellBook = page.getByRole('list', { name: 'Spell Book' });
      const metrics = {
        page: await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })),
        log: await log.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight, top: element.scrollTop })),
        inventory: await inventory.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight })),
        spells: await spellBook.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight })),
      };

      expect(metrics.page.scroll).toBeLessThanOrEqual(metrics.page.client);
      expect(metrics.log.scroll).toBeGreaterThan(metrics.log.client);
      expect(metrics.log.top + metrics.log.client).toBeGreaterThanOrEqual(metrics.log.scroll - 1);
      expect(metrics.inventory.scroll).toBeGreaterThan(metrics.inventory.client);
      expect(metrics.spells.scroll).toBeGreaterThan(metrics.spells.client);
      await expect(page.getByRole('list', { name: 'Equipment List' })).toHaveCSS('grid-template-columns', /^[^ ]+$/);
      await expect(log.locator('.log-entry').last()).toContainText('Event 50');
    });
  }

  for (const theme of ['remarque-dark', 'remarque-light', 'green-phosphor-crt', 'keys-ocean-sunset-hc', 'progros']) {
    test(`${theme} has no detectable WCAG A or AA violations`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('combobox', { name: 'Visual theme' }).selectOption(theme);
      await page.locator('.tooltip-trigger').first().focus();
      await expect(page.getByRole('tooltip')).toBeVisible();

      await expectNoViolations(page);
    });
  }

  test('gives every records disclosure a visible open affordance', async ({ page }) => {
    // The Case archive rendered as a muted label with nothing under it, because `display: flex` on
    // a summary removes the marker a summary draws as a list item. It read as a dead section
    // header — the exact impression ClosedCasework gates itself to avoid — while the world console
    // disclosure beside it kept its triangle, having never set `display`.
    //
    // Asserted as list-item rather than by screenshot: the marker is what `display` decides, and
    // this is the property that was changed by accident once already.
    await page.goto('/');
    await loadDenseDashboard(page);
    // The archive is gated on having closed something, so a fresh session renders no disclosure at
    // all and the loop below would sweep an empty list.
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const state = useGameStore.getState();
      useGameStore.setState({
        character: {
          ...state.character,
          Quest: { ...state.character.Quest, history: ['Deliver this dirtclod', 'Placate the Swamp Tickets'] },
        },
      });
    });

    const summaries = page.locator('.records-details > summary');
    const count = await summaries.count();
    // Without this the loop below would pass on a page that rendered no disclosures at all.
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const summary = summaries.nth(index);
      await expect(summary).toHaveCSS('display', 'list-item');
      await expect(summary).toBeVisible();
    }
  });

  test('spends a wide viewport on the loadout rather than on the prose column', async ({ page }) => {
    // The loadout measured 329px at 1280, 1806 and 2560 alike, because `.app-container` caps the
    // whole dashboard at 1280 and centres it — the column ratios were never what held it there.
    // So the cap moves at 1600, and the width it adds goes to the loadout alone.
    await page.goto('/');
    await loadDenseDashboard(page);

    const columns = async () => {
      const widths = await page.locator('.main-grid').evaluate((grid) =>
        getComputedStyle(grid).gridTemplateColumns.split(' ').map((value) => Math.round(parseFloat(value))));
      expect(widths).toHaveLength(3);
      const [hero = 0, console_ = 0, loadout = 0] = widths;
      return { hero, console: console_, loadout };
    };

    // One pixel below the breakpoint nothing has changed.
    await page.setViewportSize({ width: 1599, height: 900 });
    const narrow = await columns();
    expect(narrow.loadout).toBeLessThan(340);

    await page.setViewportSize({ width: 1600, height: 900 });
    const wide = await columns();

    // The loadout is the only column that grows, and it roughly doubles.
    expect(wide.loadout).toBeGreaterThan(narrow.loadout * 1.8);
    // The console keeps the measure it already had. Asserted as "no wider", because lengthening
    // the only lines of prose on the page is the specific outcome this layout is avoiding — a
    // change that fixed the loadout by growing the console would pass every other check here.
    expect(wide.console).toBeLessThanOrEqual(narrow.console);
    expect(wide.hero).toBeLessThanOrEqual(narrow.hero);

    // Two columns inside the loadout at both widths: the extra room widens each cell, which is
    // where names truncate, rather than adding a third column of narrower ones.
    await expect(page.getByRole('list', { name: 'Equipment List' })).toHaveCSS('grid-template-columns', /^\S+\s+\S+$/);

    for (const width of [1600, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    }
  });

  for (const [label, width] of [['desktop', 1280], ['mobile', 375]] as const) {
    test(`reveals and dismisses a decision reason at ${label} width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await loadDenseDashboard(page);
      await openActivityTab(page);

      // Seed one entry carrying a reason. The feed renders what the store holds; the engine
      // attaching the cause correctly is asserted separately at the transition seam.
      await page.evaluate(async () => {
        const { useGameStore } = await import('/src/state/gameStore.ts');
        const state = useGameStore.getState();
        useGameStore.setState({
          log: [{ id: state.nextActivityId + 1, message: 'Heading to market to sell loot...', reason: 'Carrying 22 of 22 cubits. At capacity, procurement routes the hero to market.' }, ...state.log],
          nextActivityId: state.nextActivityId + 2,
        });
      });

      const disclosure = page.locator('.log-reason').first();
      await expect(disclosure).toBeVisible();
      // Closed by default: the chronological line is the feed, this is a footnote to one entry.
      await expect(page.getByText(/At capacity, procurement routes/)).toBeHidden();

      await disclosure.locator('summary').click();
      await expect(page.getByText(/At capacity, procurement routes/)).toBeVisible();

      await disclosure.locator('summary').click();
      await expect(page.getByText(/At capacity, procurement routes/)).toBeHidden();

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test('keeps the console tabs usable when the centre column runs short', async ({ page }) => {
    // The chatter panel was flex: 1 with min-height: 0, which resolves to nothing when
    // the parent distributes no height. It measured 20px tall here — present in the
    // accessibility tree, unreachable in practice — so a region silently disappeared rather
    // than shrinking. The room existed; nothing was claiming it.
    await page.setViewportSize({ width: 1025, height: 760 });
    await page.goto('/');
    await loadDenseDashboard(page);

    const heights = await page.evaluate(() => {
      const panel = document.querySelector('.console-panel:not([hidden])');
      return { panel: panel ? Math.round(panel.getBoundingClientRect().height) : 0 };
    });
    expect(heights.panel, 'console tab panel collapsed instead of shrinking').toBeGreaterThanOrEqual(120);

    await expect(page.getByRole('region', { name: 'Simulated chatter' })).toBeVisible();
    await openActivityTab(page);
    await expect(page.getByRole('region', { name: 'Activity Event Log' })).toBeVisible();
  });

  test('keeps a focused skip link above the tooltip layer', async ({ page }) => {
    await page.goto('/');
    // WCAG 2.4.11: a focused skip link must not be obscured. The skip link and the tooltip layer
    // are stacked against each other, so their z-indices have to be ordered deliberately rather
    // than chosen independently.
    // Open a tooltip first: it is portaled to the body and only exists in the DOM while shown,
    // which is also the exact situation where it could cover the skip link.
    await page.locator('.tooltip-trigger').first().focus();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    const layer = (selector: string) => page.locator(selector).first()
      .evaluate((element) => Number(getComputedStyle(element).zIndex));
    const skipLink = await layer('.skip-link');
    const tooltipLayer = await layer('.item-tooltip');
    expect(Number.isNaN(skipLink)).toBe(false);
    expect(Number.isNaN(tooltipLayer)).toBe(false);
    expect(skipLink).toBeGreaterThan(tooltipLayer);
  });

  test('honors reduced motion and remains usable in forced colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('combobox', { name: 'Visual theme' })).toBeVisible();
    const summary = page.getByRole('region', { name: 'Current world context' }).getByText('World filings');
    await summary.focus();
    await expect(summary).toBeFocused();
    await expectVisibleFocusRing(summary, 'world filings summary');
    await page.keyboard.press('Enter');
    const notices = page.getByRole('region', { name: 'Derived world notices' });
    await notices.focus();
    await expect(notices).toBeFocused();
    await expectVisibleFocusRing(notices, 'world notices region');
    // Read through ::after, which is where the shimmer animation actually lives. This assertion
    // used to read the element itself, which has no animation at all — so `animationDuration` was
    // "0s", parsed to 0, and the check passed whether or not the preference was honoured. Verified
    // by measuring the same element under no-preference, where it also reported "0s".
    //
    // The element's own `transition: width 0.1s linear` is asserted too, so both kinds of motion
    // the progress bar produces are covered rather than only the one that was nearly missed.
    const shimmer = await page.locator('.progress-bar-fill').first().evaluate((element) => ({
      animation: parseFloat(getComputedStyle(element, '::after').animationDuration),
      transition: parseFloat(getComputedStyle(element).transitionDuration),
    }));
    expect(shimmer.animation).toBeLessThan(0.001);
    expect(shimmer.transition).toBeLessThan(0.001);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectNoViolations(page);
  });

  test('opens and rolls stats in Character Creator modal', async ({ page }) => {
    await page.goto('/');

    const newCharBtn = page.getByRole('button', { name: /New Character/i });
    await newCharBtn.click();

    await expect(page.getByText('Progress Quest III — New Character')).toBeVisible();
    await expect(page.getByText(/Prime Stats \(3d6 Rolls\)/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Character Name' })).toHaveAttribute('maxlength', '120');
    await expect(page.getByRole('group', { name: 'Select Race' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Select Class' })).toBeVisible();

    // Click Roll 'Em
    const rollBtn = page.getByRole('button', { name: /Roll 'Em/i });
    await rollBtn.click();

    const acceptedStats = await page.locator('[data-testid="creator-prime-stats"] strong').allTextContents();
    expect(acceptedStats).toHaveLength(6);

    // Click Random Name
    const randomBtn = page.getByRole('button', { name: /Random/i });
    await randomBtn.click();

    // Submit new character
    const submitBtn = page.getByRole('button', { name: /Sold! Start Questing/i });
    await submitBtn.click();

    await expect(page.getByText('Progress Quest III — New Character')).not.toBeVisible();
    await expect(page.locator('[data-testid="hero-prime-stats"] strong')).toHaveText(acceptedStats);
  });

  test('contains modal focus, closes with Escape, and restores the trigger', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: /New Character/i });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: /New Character/i });
    const close = dialog.getByRole('button', { name: /Close character creator/i });

    await expect(close).toBeFocused();
    expect((await close.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect(trigger).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('contains Save Manager focus and restores its trigger', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: /Roster & Saves/i });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: /Character Roster/i });
    const close = dialog.getByRole('button', { name: 'Close modal' });

    await expect(close).toBeFocused();
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect(trigger).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('keeps character creation in the dedicated creator', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /Roster & Saves/i }).click();

    await expect(page.getByRole('dialog', { name: /Character Roster/i })).toBeVisible();
    // Not a text match. The string this replaced — 'Roll New Guy' — existed nowhere in the
    // repository, so its count was structurally zero and no change to the roster modal could move
    // it, including the one this test forbids. Matching flavour text is also what rotted it: the
    // vocabulary was rewritten wholesale and the assertion never noticed.
    //
    // The shape check below is a second angle; the behaviour it stands for is asserted directly in
    // SaveModal.test.tsx, which sweeps every control and fails if any reaches startSession with
    // source 'creation'.
    const roster = page.getByRole('dialog', { name: /Character Roster/i });
    await expect(roster.getByRole('radio')).toHaveCount(0);
    await expect(roster.locator('form, fieldset')).toHaveCount(0);

    // The positive control. Without it the three assertions above would keep passing if the roster
    // dialog stopped rendering, or if the creator's pickers stopped being radios — the negative
    // half would go quietly vacuous exactly as its predecessor did.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /New Character/i }).click();
    await expect(page.getByRole('dialog', { name: /New Character/i }).getByRole('radio')).not.toHaveCount(0);
  });

  test('loads a roster character through a fresh game session', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    await page.getByRole('button', { name: /Roster & Saves/i }).click();
    await page.getByRole('button', { name: 'Save current character' }).click();
    await page.getByRole('button', { name: 'Play' }).click();

    await expect(page.getByRole('dialog', { name: /Character Roster/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Chatter' })).toHaveAttribute('aria-selected', 'true');
    await openActivityTab(page);
    await expect(page.getByRole('region', { name: 'Activity Event Log' })).toContainText(
      'Loaded character Krg from roster.',
    );
  });

  test('imports a save through the session seam', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Roster & Saves/i }).click();
    await page.getByRole('button', { name: 'Save current character' }).click();

    const pqw = await page.evaluate(() => {
      const rawRoster = localStorage.getItem('progquest_roster_v1');
      if (!rawRoster) throw new Error('Expected the open save manager to persist the current character.');
      const [savedCharacter] = Object.values(JSON.parse(rawRoster) as Record<string, unknown>);
      return btoa(unescape(encodeURIComponent(JSON.stringify(savedCharacter))));
    });

    await page.getByRole('textbox', { name: 'Import Save String (.pqw)' }).fill(pqw);
    await page.getByRole('button', { name: 'Load Character' }).click();

    await expect(page.getByRole('dialog', { name: /Character Roster/i })).not.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Chatter' })).toHaveAttribute('aria-selected', 'true');
    await openActivityTab(page);
    await expect(page.getByRole('region', { name: 'Activity Event Log' })).toContainText(
      'Loaded character Krg from save data.',
    );
  });

  test('preserves the active session when save import validation fails', async ({ page }) => {
    await page.goto('/');
    const activeName = await page.locator('.hero-name > span:not(.badge)').innerText();
    await page.getByRole('button', { name: /Roster & Saves/i }).click();
    await page.getByRole('textbox', { name: 'Import Save String (.pqw)' }).fill('%%%INVALID_BASE64%%%');
    await page.getByRole('button', { name: 'Load Character' }).click();

    await expect(page.getByRole('dialog', { name: /Character Roster/i })).toBeVisible();
    await expect(page.getByText('Malformed base64 save string.')).toBeVisible();
    await expect(page.locator('.hero-name > span:not(.badge)')).toHaveText(activeName);
  });

  test('rejects impossible imported progress without exposing NaN progress bars', async ({ page }) => {
    await page.goto('/');
    const activeName = await page.locator('.hero-name > span:not(.badge)').innerText();
    const invalidPqw = await page.evaluate(async () => {
      const { useGameStore } = await import('/src/state/gameStore.ts');
      const { encodePQWSave } = await import('/src/state/saveManager.ts');
      const character = useGameStore.getState().character;
      return encodePQWSave({
        ...character,
        Quest: { ...character.Quest, currentProgress: 1, maxProgress: 0 },
      });
    });

    await page.getByRole('button', { name: /Roster & Saves/i }).click();
    await page.getByRole('textbox', { name: 'Import Save String (.pqw)' }).fill(invalidPqw);
    await page.getByRole('button', { name: 'Load Character' }).click();

    await expect(page.getByRole('dialog', { name: /Character Roster/i })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Invalid Character Sheet Schema');
    await expect(page.locator('.hero-name > span:not(.badge)')).toHaveText(activeName);
    const progressValues = await page.getByRole('progressbar')
      .evaluateAll((bars) => bars.map((bar) => bar.getAttribute('aria-valuenow')));
    // Without this the loop body never runs when nothing rendered, and a test about NaN progress
    // bars passes having seen no progress bars.
    expect(progressValues.length, 'no progress bars rendered to check for NaN').toBeGreaterThan(0);
    for (const value of progressValues) {
      expect(value).toMatch(/^\d+$/);
    }
  });

  for (const width of [320, 375, 768]) {
    test(`keeps the full interface inside a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      await expect(page.getByText('Zero players. Zero developers. Progress continues regardless.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Credits & notices' })).toBeVisible();
      await expect(page.getByText('No spells have been learned. They arrive automatically at level-up and may also be awarded for completed quests; the curriculum remains aggressively theoretical.')).toBeVisible();
      await expect(page.getByText('No loot has been retained. Combat supplies it automatically; procurement awaits a monster with transferable assets.')).toBeVisible();
      expect(await page.locator('.brand-tagline').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.getByRole('list', { name: 'Spell Book' }).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.getByRole('list', { name: 'Inventory items' }).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(page.getByRole('button', { name: /Roster & Saves/i })).toBeInViewport();
      await expect(page.getByRole('combobox', { name: 'Visual theme' })).toBeInViewport();

      if (width === 320) {
        await page.getByRole('button', { name: /New Character/i }).click();
        const dialog = page.getByRole('dialog', { name: /New Character/i });
        await expect(dialog).toBeInViewport();
        const dialogDimensions = await dialog.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        expect(dialogDimensions.scrollWidth).toBeLessThanOrEqual(dialogDimensions.clientWidth);
      }
    });
  }
});

test.describe('closed casework archive', () => {
  // The engine keeps this list and trims it; the panel only reads it. Seeded directly rather
  // than played to, because reaching a hundred closed quests in a test would take hours.
  const archived = (history: string[]) => archivedSessionStorageState(BASE_URL, { history });

  test('stays away entirely until a quest has closed', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, storageState: archived([]) });
    const page = await context.newPage();
    const expectNoPageErrors = watchForErrors(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Questing & Progression' })).toBeVisible();
    // An empty archive reads as a broken panel rather than a new one, so there is no empty state.
    await expect(page.getByRole('list', { name: /Closed casework/i })).toHaveCount(0);
    // And no disclosure inviting anyone to open it. Asserting only the list's absence is what let
    // a summary that opens onto nothing ship: the contents were hidden, the triangle was not.
    await expect(page.locator('.records-details > summary').filter({ hasText: /Case archive/i }))
      .toHaveCount(0);
    expectNoPageErrors();
    await context.close();
  });

  test('lists closed quests newest first and scrolls the rest without pushing the card wider', async ({ browser }) => {
    const history = Array.from({ length: 40 }, (_value, index) => `Matter number ${index}`);
    const context = await browser.newContext({ baseURL: BASE_URL, storageState: archived(history) });
    const page = await context.newPage();
    const expectNoPageErrors = watchForErrors(page);
    await page.goto('/');

    // The archive lives behind a disclosure now, so opening it is part of reaching it.
    await page.locator('.records-details > summary').filter({ hasText: /Case archive/i }).click();
    const archive = page.getByRole('list', { name: /Closed casework/i });
    await expect(archive).toBeVisible();
    await expect(archive.locator('li')).toHaveCount(40);
    await expect(archive.locator('li').first()).toHaveText('Matter number 39');

    // The archive scrolls inside itself. If it ever stops doing so it will grow the questing
    // card without limit, which is the failure this panel is one trim away from.
    const box = await archive.evaluate((element) => ({
      scrolls: element.scrollHeight > element.clientHeight,
      overflowsHorizontally: element.scrollWidth > element.clientWidth,
    }));
    expect(box.scrolls).toBe(true);
    expect(box.overflowsHorizontally).toBe(false);

    const card = page.locator('.quest-card');
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expectNoViolations(page, 'questing card with a populated archive');
    expectNoPageErrors();
    await context.close();
  });
});

test.describe('WCAG 2.2 criteria the automated floor can reach', () => {
  test.use({ storageState: returningStorageState });

  test('meets the 24px target size minimum, by size or by spacing', async ({ page }) => {
    // 2.5.8 Target Size (Minimum). The criterion has two ways to pass, and only implementing the
    // first reports conformant dense lists as failures: an undersized target also passes when a
    // 24px circle centred on it intersects no other target's circle. Both are implemented here so
    // the assertion means what the criterion means.
    await page.goto('/');

    const { failures, scanned } = await page.evaluate(() => {
      const selector = 'button, a[href], select, input, [role="tab"], summary';
      const rendered = [...document.querySelectorAll<HTMLElement>(selector)].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        // A hidden panel's controls are not pointer targets.
        if (rect.width === 0 && rect.height === 0) return [];
        if (element.closest('[hidden]')) return [];
        return [{
          element,
          rect,
          centre: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        }];
      });

      const measured = rendered.flatMap((target) => {
        if (target.rect.width >= 24 && target.rect.height >= 24) return [];

        // Circles of 24px diameter, so two intersect when their centres are closer than 24px.
        const crowded = rendered.some((other) =>
          other !== target
          && Math.hypot(target.centre.x - other.centre.x, target.centre.y - other.centre.y) < 24);
        if (!crowded) return [];

        return [{
          label: target.element.getAttribute('aria-label')
            ?? target.element.textContent?.trim().slice(0, 40)
            ?? target.element.tagName,
          width: Math.round(target.rect.width),
          height: Math.round(target.rect.height),
        }];
      });

      return { failures: measured, scanned: rendered.length };
    });

    // A selector that stops matching scans nothing, and "no undersized targets" then means "no
    // targets". The count is what separates a clean pass from a vacuous one.
    expect(scanned, 'no pointer targets matched; the selector has gone stale').toBeGreaterThan(0);
    expect(failures, `undersized and crowded targets: ${JSON.stringify(failures)}`).toEqual([]);
  });

  test('survives the text-spacing overrides without losing content', async ({ page }) => {
    // 1.4.12 Text Spacing. The criterion is that applying these produces no loss of content or
    // function, so the assertion is that nothing starts overflowing its own container - not that
    // the layout is unchanged, which it is entitled to be.
    await page.goto('/');
    await page.addStyleTag({
      content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
                p { margin-block: 2em !important; }`,
    });

    const overflowing = await page.evaluate(() => {
      const body = document.body;
      const horizontal = body.scrollWidth > document.documentElement.clientWidth + 1;
      // Panels that clip their own content rather than scrolling it are the real loss here.
      const clipped = [...document.querySelectorAll<HTMLElement>('.card, .hero-banner')].flatMap((element) => {
        const style = getComputedStyle(element);
        if (style.overflow !== 'hidden' && style.overflowY !== 'hidden') return [];
        return element.scrollHeight > element.clientHeight + 1 ? [element.className] : [];
      });
      return { horizontal, clipped };
    });

    expect(overflowing.horizontal, 'the page scrolls horizontally under text-spacing overrides').toBe(false);
    expect(overflowing.clipped, 'panels clip their content under text-spacing overrides').toEqual([]);
  });
});
