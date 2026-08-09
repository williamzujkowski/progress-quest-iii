// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { describeSpell } from '../../data/itemDetails';
import { Caseload } from '../../components/Caseload';
import { EMPTY_CASELOAD } from '../../state/caseload';
import { useGameStore } from '../../state/gameStore';

/**
 * Every open-keyed map read on this path, against a key inherited from `Object.prototype`.
 *
 * A plain object literal or a `z.record` output carries `Object.prototype`, so `map[key]` for
 * `constructor`, `toString`, `valueOf` or `hasOwnProperty` returns a **function** rather than
 * undefined. A `??` fallback never fires and a `!value` guard passes, so the value flows onward and
 * renders. The keys are attacker-chosen in the only sense that matters here: an imported `.pqw` or a
 * hand-edited ledger picks them, and the schemas admit any string.
 *
 * The codebase already fixed this in five places and then wrote two more without the guard. So this
 * file tests the *class* rather than one site: a new map indexed by an imported name belongs here.
 */

const INHERITED = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'] as const;

const originalState = useGameStore.getState();
afterEach(() => {
  cleanup();
  useGameStore.setState(originalState, true);
});

describe('a spell named after a prototype member', () => {
  it('gets the fallback prose rather than a function body', () => {
    // Reproduced before it was fixed: the description read
    // "function Object() { [native code] } Results may vary, especially near furniture."
    // It reaches the DOM as a `title` attribute on every render, not only on hover.
    for (const name of INHERITED) {
      const { description } = describeSpell(name, 1);

      expect(description, name).not.toMatch(/function |\[native code\]|\[object /);
      // The premise: the fallback has to actually be what rendered, or this passes on a blank.
      expect(description, name).toContain('arrived without syllabus');
    }
  });

  it('still uses the authored flavour for a spell that has one', () => {
    // The guard must not become a refusal. Whichever spells carry authored prose must keep it, or
    // the fix has traded one wrong string for another.
    const authored = describeSpell('Wet Signature', 3);

    expect(authored.description).toContain('needs ink, a witness');
    expect(authored.description).not.toContain('arrived without syllabus');
  });
});

describe('a docket target named after a prototype member', () => {
  it('renders no date rather than an undefined one', () => {
    // The same read the service record was fixed for, in the panel beside it. Two maps disagreeing
    // is the ordinary case — every ledger written before the register has counts and no spans.
    for (const target of INHERITED) {
      useGameStore.setState({
        caseload: { ...EMPTY_CASELOAD, kinds: { fetch: 3 }, targets: { [target]: 9 }, targetActs: {} },
      });
      const { container } = render(<Caseload />);

      expect(container.textContent, target).toContain('Most frequently filed against');
      expect(container.textContent, target).not.toContain('undefined');
      expect(container.textContent, target).not.toContain('The file opens in Act');
      cleanup();
    }
  });

  it('still dates a target that genuinely has a span', () => {
    useGameStore.setState({
      caseload: {
        ...EMPTY_CASELOAD,
        kinds: { fetch: 3 },
        targets: { constructor: 9 },
        targetActs: { constructor: { first: 2, last: 6 } },
      },
    });
    render(<Caseload />);

    expect(screen.getByText(/The file opens in Act 2 and last records this in Act 6\./)).toBeTruthy();
  });
});
