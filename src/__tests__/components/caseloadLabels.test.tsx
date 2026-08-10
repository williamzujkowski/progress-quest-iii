// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Caseload } from '../../components/Caseload';
import { KIND_DESCRIPTIONS, KIND_LABELS, QUEST_KINDS } from '../../state/caseload';
import { useGameStore } from '../../state/gameStore';

/**
 * Five near-synonyms with bare integers beside them.
 *
 * "Extermination writs closed", "Retrieval orders discharged", "Deliveries acknowledged",
 * "Requisitions fulfilled", "Placation accords reached" — an institution with five words for "job
 * done" is the joke, and the joke does not survive a newcomer being unable to tell which of their
 * quests fed which row. There is no glossary anywhere in the app.
 *
 * The labels stay. What was missing is what each row counted.
 */

afterEach(cleanup);

describe('the docket says what each of its forms counts', () => {
  it('gives every kind a description that is not its label again', () => {
    for (const kind of QUEST_KINDS) {
      const description = KIND_DESCRIPTIONS[kind];
      expect(description, `${kind} has no description`).toBeTruthy();
      expect(description).not.toBe(KIND_LABELS[kind]);
      // Each has to name the errand rather than restate the paperwork, or it explains nothing.
      expect(description, `${kind}: ${description}`).toMatch(/sent the hero to/);
    }
  });

  it('distinguishes the five rather than glossing them identically', () => {
    // Five rows whose descriptions matched would be the original problem with extra words.
    expect(new Set(QUEST_KINDS.map((kind) => KIND_DESCRIPTIONS[kind])).size).toBe(QUEST_KINDS.length);
  });

  it('puts the gloss on the rendered row', () => {
    useGameStore.setState({
      // `kinds`, not `counts` — the field this panel actually reads. A fixture on the wrong name
      // renders an empty docket and passes a row check by having no rows to fail.
      caseload: { kinds: { exterminate: 3, seek: 1 }, targets: {}, targetActs: {} },
    } as never);
    const container = render(<Caseload />).container;

    const rows = [...container.querySelectorAll('.equip-item')]
      .filter((row) => Object.values(KIND_LABELS).includes(row.querySelector('.equip-slot')?.textContent ?? ''));
    expect(rows.length, 'no docket rows rendered').toBeGreaterThan(0);
    for (const row of rows) expect(row.getAttribute('title'), row.textContent ?? '').toBeTruthy();
  });
});
