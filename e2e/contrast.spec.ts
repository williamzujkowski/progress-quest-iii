import { expect, test } from './fixtures/strictConsole';
import { settleForAudit } from './fixtures/accessibility';
import { archivedSessionStorageState } from './fixtures/archivedSession';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/**
 * Direct contrast measurement, covering what axe-core structurally cannot.
 *
 * The axe pass in app.spec.ts asserts on `results.violations` only. axe reports whole subtrees
 * as `incomplete` when it cannot determine a background — "Element's background color could not
 * be determined due to a pseudo element", which covers the navbar because those buttons contain
 * inline SVG icons. An `incomplete` is not a violation, so an unmeasurable pair reads as a pass.
 * A failing contrast can ship through that gap unseen, which is why this file measures directly.
 *
 * Two properties it depends on, both easy to lose in a refactor:
 *
 * 1. Paint is settled before every pair is sampled, per pair rather than once. Themes cross-fade,
 *    and a mid-transition sample reports colours that exist on no frame the user ever sees — an
 *    arithmetically correct ratio for a state that was never rendered. Different elements carry
 *    different transition durations, so settling on one proxy element says nothing about the
 *    rest and fails intermittently under load.
 * 2. The maths is validated against published WCAG values before any DOM reading is trusted. A
 *    bad sample and a bad formula are indistinguishable from the ratio alone.
 */

const AA_NORMAL_TEXT = 4.5;

// Asserted against the live picker below, so adding a theme without adding it here fails
// rather than silently going unmeasured.
const THEMES = [
  { id: 'remarque-dark', label: 'Remarque Dark' },
  { id: 'remarque-light', label: 'Remarque Light' },
  { id: 'green-phosphor-crt', label: 'Green Phosphor CRT' },
  { id: 'keys-ocean-sunset-hc', label: 'Ocean Sunset HC' },
  { id: 'progros', label: 'Retro ProgrOS' },
] as const;

const PAIRS = [
  { name: 'panel heading', selector: '.card-header' },
  { name: 'muted subtitle', selector: '.hero-sub' },
  { name: 'primary button label', selector: '.btn-primary' },
  { name: 'secondary button label', selector: '.nav-actions .btn:not(.btn-primary)' },
  { name: 'badge warning', selector: '.total-badge', token: '--accent-warning' },
  { name: 'badge danger', selector: '.total-badge', token: '--accent-danger' },
] as const;

const channel = (value: number) => {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (rgb: number[]) =>
  0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);

const contrast = (a: number[], b: number[]) => {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};

// Runs in the page. Resolves colours through a canvas (oklch/oklab/color-mix all serialize in
// forms Number parsing cannot handle) and composites every painted ancestor, because the
// neutral tokens here are translucent by design.
const SAMPLE = async (pairs: readonly { name: string; selector: string; token?: string }[]) => {
  const paint = (colour: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const backdrop = (element: HTMLElement) => {
    const layers: string[] = [];
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') layers.push(bg);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    for (const layer of layers.reverse()) {
      ctx.fillStyle = layer;
      ctx.fillRect(0, 0, 1, 1);
    }
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const snapshot = () => {
    const out: Record<string, { fg: number[]; bg: number[] }> = {};
    for (const pair of pairs) {
      const element = document.querySelector(pair.selector) as HTMLElement | null;
      if (!element) continue;
      const fg = pair.token
        ? paint(getComputedStyle(document.documentElement).getPropertyValue(pair.token))
        : paint(getComputedStyle(element).color);
      out[pair.name] = { fg, bg: backdrop(element) };
    }
    return out;
  };
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  // Settle on everything being measured, not on one proxy element. Different elements carry
  // different transition durations — buttons fade over 150ms, the body over 200ms — so waiting
  // for one to stop moving says nothing about the rest. This returns only once every sampled
  // pair is identical across two consecutive frames.
  let previous = JSON.stringify(snapshot());
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await frame();
    await frame();
    const current = snapshot();
    const serialized = JSON.stringify(current);
    if (serialized === previous) return current;
    previous = serialized;
  }
  throw new Error('Theme paint never settled; contrast cannot be measured reliably.');
};

test.describe('theme contrast', () => {
  test('the measurement agrees with published WCAG values', () => {
    // Guards the instrument before any reading is trusted. If these drift, every ratio below
    // is meaningless and the suite should be believed about nothing.
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 2);
    expect(contrast([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 2);
    expect(contrast([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
  });

  for (const theme of THEMES) {
    test(`${theme.label} meets AA for text against its real backdrop`, async ({ page }) => {
      await page.goto('/');

      // Shared with the axe helper on purpose: one definition of "no animation window to sample
      // inside". Polling until two samples agree is not sufficient on its own — the values are
      // also stable *before* a cross-fade begins, at the outgoing theme, so two matching
      // pre-transition snapshots read as settled while showing the wrong palette entirely.
      await settleForAudit(page);

      const picker = page.getByRole('combobox', { name: 'Visual theme' });
      await expect(picker.locator('option')).toHaveCount(THEMES.length);
      await picker.selectOption(theme.id);

      // applyTheme stamps data-theme on the root, so this is the definitive signal that the
      // switch actually committed. Without it, a slow commit could leave both settle samples
      // showing the outgoing theme and the suite would measure the wrong palette while
      // reporting a pass.
      await expect(page.locator(`html[data-theme="${theme.id}"]`)).toHaveCount(1);

      const samples = await page.evaluate(SAMPLE, PAIRS);
      const measured = Object.entries(samples);

      // Exact, not a floor. A floor below the pair count lets one selector stop matching without
      // anyone noticing, and an unmeasured pair reports nothing while reading as a pass — the
      // failure mode this file exists to close, reintroduced one selector at a time.
      expect(measured.map(([name]) => name).sort(), `${theme.label} did not measure every pair`)
        .toEqual(PAIRS.map((pair) => pair.name).sort());

      for (const [name, value] of measured) {
        const ratio = contrast(value.fg, value.bg);
        expect(ratio, `${theme.label} — ${name} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    });
  }
});

/**
 * Surfaces that only exist once a session has history.
 *
 * The block above measures a bare load, which is the right page for the pairs it covers and the
 * wrong one for these: the activity feed has no entries and the casework archive does not render
 * at all until a quest has closed. A pair the suite cannot reach is a pair it silently says
 * nothing about, and silence here reads as a pass.
 *
 * Kept separate rather than seeding the block above, so the established pairs keep measuring the
 * page they were calibrated against. Only the fixture differs; the settle and measure path is the
 * same one.
 */
const SEEDED_PAIRS = [
  { name: 'activity feed entry', selector: '.log-entry' },
  { name: 'closed casework entry', selector: '.casework-entry' },
  // The records surfaces. The disclosure was already being opened below and nothing in it was ever
  // sampled — and these are the riskiest text in the application for this check: prose at 0.8125rem
  // in `--text-muted`, which is small text under AA and therefore wants 4.5:1 rather than 3:1.
  { name: 'citation note', selector: '.citation-note' },
  { name: 'service record line', selector: '.service-record-lines li' },
  { name: 'service record closing', selector: '.service-record-closing' },
] as const;

test.describe('theme contrast on surfaces that need a session', () => {
  test.use({
    storageState: archivedSessionStorageState(BASE_URL, {
      history: ['Placate the Duke of the Kickoff Meetings', 'Fetch me 6 kobold spleens'],
      log: ['Defeated a kobold.', 'Quest completed: placate the Duke of the Kickoff Meetings'],
    }),
  });

  for (const theme of THEMES) {
    test(`${theme.label} meets AA for seeded text against its real backdrop`, async ({ page }) => {
      await page.goto('/');

      // The archived fixture carries a quest history and a log, which is enough for the casework
      // archive and not for the records: citations and the service record are projections over the
      // three ledgers, and an empty ledger renders nothing at all by design. Seeded here so the
      // surfaces the disclosure opens onto actually exist to be measured.
      await page.evaluate(async () => {
        const { useGameStore } = await import('/src/state/gameStore.ts');
        const state = useGameStore.getState();
        useGameStore.setState({
          commendations: { highestLevel: 45, largestSale: 102_815, questsCompleted: 2291, actsCompleted: 6, exhibit: {} },
          caseload: {
            kinds: { exterminate: 426, seek: 474, deliver: 460, fetch: 455, placate: 446 },
            targets: { 'Purple Squirrel': 12 },
            targetActs: { 'Purple Squirrel': { first: 2, last: 9 } },
          },
          specimens: { specimens: Array.from({ length: 300 }, (_unused, index) => `item:Specimen ${index}`) },
          character: { ...state.character, Plot: { ...state.character.Plot, act: 14 } },
        } as never);
      });

      // The feed opens on the chatter tab, so the activity entries exist but are inside a hidden
      // panel. Measuring them there would sample an element the user cannot see.
      await page.getByRole('tab', { name: /Activity/i }).click();
      // Records fold away by default. A collapsed disclosure is not a hidden failure to measure -
      // it is a surface the reader has to open too, so the test opens it exactly as they would.
      for (const summary of await page.locator('.records-details > summary').all()) await summary.click();
      await expect(page.locator('.log-entry').first()).toBeVisible();
      await expect(page.locator('.casework-entry').first()).toBeVisible();

      await settleForAudit(page);

      const picker = page.getByRole('combobox', { name: 'Visual theme' });
      await picker.selectOption(theme.id);
      await expect(page.locator(`html[data-theme="${theme.id}"]`)).toHaveCount(1);

      const samples = await page.evaluate(SAMPLE, SEEDED_PAIRS);
      const measured = Object.entries(samples);

      expect(measured.map(([name]) => name).sort(), `${theme.label} did not measure every seeded pair`)
        .toEqual(SEEDED_PAIRS.map((pair) => pair.name).sort());

      for (const [name, value] of measured) {
        const ratio = contrast(value.fg, value.bg);
        expect(ratio, `${theme.label} — ${name} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    });
  }
});
