import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: 0,
  },
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA ?? 'development'),
  },
  plugins: [react()],
  test: {
    exclude: ['e2e/**', 'e2e-pwa/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      // Excluded because they are verified by the Playwright suite, which this provider cannot
      // observe — not because they are untested. Counting them made the ratio gameable by
      // deletion: removing all of them moved the figure from 82% to 91% while the app stopped
      // rendering, so a real regression could be offset by dropping one of these in the same
      // change. With them out of the denominator, the percentage describes only what unit tests
      // are meant to own, and this list is the reviewable artefact — adding to it is a visible
      // decision, and a new module that is genuinely untested still drags the number down.
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/__tests__/**',
        // Listed one by one rather than as `src/components/**`, because several components do
        // have unit tests and excluding those would throw away real coverage. Each entry here is
        // a component whose verification lives entirely in the Playwright suite.
        //
        // ItemTooltip was on this list and stopped qualifying once it gained a unit test, which
        // nobody noticed — the list is only as reviewable as the reader is attentive, so
        // scripts/test-coverage-exclusions.mjs now fails when an entry acquires a matching test.
        'src/App.tsx',
        'src/components/CharacterSheet.tsx',
        'src/components/InventoryView.tsx',
        'src/components/Navbar.tsx',
        'src/components/PwaStatus.tsx',
      ],
      // Floors sit a couple of points under the numbers measured when they were set, so
      // ordinary variance does not redden the gate while a real regression does. Raise them
      // when coverage rises; do not lower them to make a failing run pass.
      //
      // The global figures look modest because `include` counts every src file, including
      // ones no unit test imports — components are exercised by the Playwright suite, which
      // this provider cannot observe. That is deliberate: adding an untested module should
      // move the number down. The engine floor is the one that carries AGENTS.md's rule
      // against writing engine code without a test, and it is set high because the engine
      // genuinely is tested that well.
      // Recalibrated against the narrowed denominator (91.27 / 86.85 / 93.55 / 93.58 when set).
      // Higher than before because the figure now describes only code unit tests own, which is
      // the point: the old 80% was mostly an average with Playwright-covered files dragging it.
      //
      // Headroom is deliberately about one point, not three. At three points a new untested
      // module of forty-odd statements slipped through without tripping anything — verified by
      // adding one. A floor a regression can walk under is decoration.
      thresholds: {
        statements: 90,
        branches: 86,
        functions: 92,
        lines: 92,
        'src/engine/**': {
          statements: 93,
          branches: 86,
          functions: 95,
          lines: 94,
        },
      },
    },
  },
});
