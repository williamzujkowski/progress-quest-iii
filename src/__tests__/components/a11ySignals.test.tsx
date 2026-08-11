// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { InventoryView } from '../../components/InventoryView';
import { Route } from '../../components/Route';
import { createNewCharacter } from '../../engine/sim';
import { useGameStore } from '../../state/gameStore';
import type { CharacterSheet } from '../../engine/types';

/**
 * Three states that were signalled by colour, or asserted by a bar that contradicted itself.
 *
 * Each is small on its own. Together they are the same failure: a signal that reaches one group of
 * readers and not the other, in a file that states the rule it is breaking.
 */

afterEach(cleanup);

const carrying = (items: { name: string; qty: number }[], strength = 8) => {
  const character = createNewCharacter('Porter', 'Half Daemon', 'Robot Monk', 900);
  const sheet: CharacterSheet = { ...character, Stats: { ...character.Stats, STR: strength }, Inventory: items };
  useGameStore.setState({ character: sheet });
  return render(<InventoryView />).container;
};

describe('at capacity is legible without seeing the colour', () => {
  it('puts the clause in visible text, not only in sr-only', () => {
    // The bar turns red and the ratio turns red. That is the whole signal for a sighted player, and
    // a colour-vision deficiency removes it — WCAG 1.4.1. The clause used to live in `sr-only`,
    // which reaches only the readers who were never going to see the red.
    const container = carrying(Array.from({ length: 40 }, (_u, index) => ({ name: `writ ${index}`, qty: 9 })), 1);
    const clause = container.querySelector('.inventory-at-capacity');
    expect(clause?.textContent, 'no visible at-capacity clause').toContain('at capacity');
    expect(clause?.className, 'the clause is still hidden from sighted readers').not.toContain('sr-only');
  });

  it('says nothing below capacity, so its presence carries the signal', () => {
    expect(carrying([]).querySelector('.inventory-at-capacity')).toBeNull();
  });
});

describe('the encumbrance bar does not contradict itself', () => {
  it('never reports a value above its own maximum', () => {
    // ARIA requires valuenow <= valuemax. Reachable in ordinary play, not only by import: capacity
    // comes from the Gambeson's base rating and an upgrade picks the noun nearest the level, so a
    // swap can lower it below what is already carried.
    const container = carrying(Array.from({ length: 40 }, (_u, index) => ({ name: `writ ${index}`, qty: 9 })), 1);
    const bar = container.querySelector('[role="progressbar"]');
    const now = Number(bar?.getAttribute('aria-valuenow'));
    const max = Number(bar?.getAttribute('aria-valuemax'));
    expect(now).toBeLessThanOrEqual(max);
  });

  it('still reports the real figures in its text', () => {
    // The clamp is for the machine-readable value only. A player being told they carry 22 of 22
    // when they carry 360 would be the fix lying to avoid an inconsistency.
    const container = carrying(Array.from({ length: 40 }, (_u, index) => ({ name: `writ ${index}`, qty: 9 })), 1);
    const text = container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext') ?? '';
    expect(text).toMatch(/\d+ of \d+ cubits/);
    expect(text.startsWith('360')).toBe(true);
  });
});

describe('the current posting is marked for a reader who cannot see the weight', () => {
  it('carries aria-current', () => {
    // Past act 0, because `hasRoute` renders nothing for a hero who has been nowhere yet — a fresh
    // character produces an empty panel and would pass a "no stop is marked" check for free.
    const character = createNewCharacter('Routed', 'Half Daemon', 'Robot Monk', 900);
    useGameStore.setState({ character: { ...character, Plot: { act: 3, currentProgress: 0, maxProgress: 26 } } });
    const container = render(<Route />).container;
    const current = container.querySelector('[aria-current="true"]');
    expect(current, 'no stop is marked current').toBeTruthy();
    expect(current?.className).toContain('route-current');
  });
});
