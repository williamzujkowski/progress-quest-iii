import { describe, expect, it } from 'vitest';
import greenPhosphorCrt from '@williamzujkowski/oklch-terminal-themes/themes/green-phosphor-crt.json';
import keysOceanSunsetHc from '@williamzujkowski/oklch-terminal-themes/themes/keys-ocean-sunset-hc.json';
import remarqueDark from '@williamzujkowski/oklch-terminal-themes/themes/remarque-dark.json';
import remarqueLight from '@williamzujkowski/oklch-terminal-themes/themes/remarque-light.json';
import {
  getThemeColor,
  getTerminalThemeVariables,
  readThemePreference,
  resolveInitialTheme,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  writeThemePreference,
  COLOR_KEYS,
} from '../theme';

describe('theme contract', () => {
  it('accepts only supported persisted theme identifiers', () => {
    expect(resolveInitialTheme('remarque-dark', false)).toBe('remarque-dark');
    expect(resolveInitialTheme('remarque-light', true)).toBe('remarque-light');
    expect(resolveInitialTheme('green-phosphor-crt', false)).toBe('green-phosphor-crt');
    expect(resolveInitialTheme('keys-ocean-sunset-hc', false)).toBe('keys-ocean-sunset-hc');
    expect(resolveInitialTheme('progros', true)).toBe('progros');
    expect(resolveInitialTheme('dracula', true)).toBe('remarque-dark');
    expect(resolveInitialTheme('dracula', false)).toBe('remarque-light');
    expect(THEME_STORAGE_KEY).toBe('progquest_theme_v1');
  });

  it('returns typed outcomes when theme preference storage cannot be read or written', () => {
    const readError = new DOMException('Access denied', 'SecurityError');
    const writeError = new DOMException('Quota exceeded', 'QuotaExceededError');
    const reader: Pick<Storage, 'getItem'> = { getItem: () => { throw readError; } };
    const writer: Pick<Storage, 'setItem'> = { setItem: () => { throw writeError; } };

    expect(readThemePreference(reader)).toEqual({ ok: false, error: readError });
    expect(writeThemePreference('progros', writer)).toEqual({ ok: false, error: writeError });
  });

  it('maps the upstream Remarque palette to terminal CSS variables', () => {
    const variables = getTerminalThemeVariables('remarque-dark');

    expect(variables['--terminal-background']).toMatch(/^oklch\(/);
    expect(variables['--terminal-foreground']).toMatch(/^oklch\(/);
    expect(variables['--terminal-bright-blue']).toMatch(/^oklch\(/);
    expect(variables['--terminal-accent']).toBe(remarqueDark.accent?.oklchCss);
    expect(Object.keys(variables)).toHaveLength(21);
  });

  it('offers only the curated terminal palettes and local retro theme', () => {
    expect(THEME_OPTIONS.map(({ id }) => id)).toEqual([
      'remarque-dark',
      'remarque-light',
      'green-phosphor-crt',
      'keys-ocean-sunset-hc',
      'progros',
    ]);
  });

  it('provides browser chrome colors that match each theme background', () => {
    expect(getThemeColor('green-phosphor-crt')).toBe('#0b0f0b');
    expect(getThemeColor('keys-ocean-sunset-hc')).toBe('#060910');
  });

  it('keeps the local ProgrOS theme free of injected terminal variables', () => {
    expect(getTerminalThemeVariables('progros')).toEqual({});
  });

  it('uses upstream palettes that clear WCAG AAA body text and AA ANSI contrast', () => {
    for (const theme of [remarqueDark, remarqueLight, greenPhosphorCrt, keysOceanSunsetHc]) {
      expect(theme.contrast.fgOnBg).toBeGreaterThanOrEqual(7);
      expect(theme.contrast.minAnsi).toBeGreaterThanOrEqual(4.5);
      expect(theme.contrast.cursorOnBg).toBeGreaterThanOrEqual(3);
      expect(theme.contrast.selectionContrast).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('terminal colour slots', () => {
  it('matches the package definition exactly, including order', async () => {
    // theme.ts declares this list locally so the production bundle does not pull the package
    // barrel, which drags culori's whole colour-space graph in for twenty strings. That trade
    // is only safe while the two agree — order included, since applyTheme iterates it.
    const upstream = await import('@williamzujkowski/oklch-terminal-themes');
    expect([...COLOR_KEYS]).toEqual([...upstream.COLOR_KEYS]);
  });
});
