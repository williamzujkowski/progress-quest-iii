// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveModal } from '../../components/SaveModal';
import { createNewCharacter } from '../../engine/sim';
import { diagnostics } from '../../state/diagnostics';
import { useGameStore } from '../../state/gameStore';
import { encodePQWSave } from '../../state/saveManager';

const initialCharacter = useGameStore.getState().character;

afterEach(() => {
  cleanup();
  localStorage.clear();
  useGameStore.setState({ character: initialCharacter });
  vi.restoreAllMocks();
});

/**
 * The encoded save string, unwrapped.
 *
 * `encodePQWSave` validates against the schema the importer applies, so it can refuse — the export
 * path must never hand a player a file that cannot be imported. Every sheet here is legal, so a
 * refusal is a bug in the fixture and is raised as one.
 */
const encodedOf = (sheet: Parameters<typeof encodePQWSave>[0]): string => {
  const result = encodePQWSave(sheet);
  if (!result.ok) throw new Error(`expected a legal sheet to encode: ${result.error.message}`);
  return result.value;
};

describe('Save Manager recovery', () => {
  it('distinguishes portable character saves from automatic session checkpoints', () => {
    render(<SaveModal isOpen onClose={() => undefined} />);

    expect(screen.getByText(/starts fresh session counters and deterministic continuation/)).toBeTruthy();
  });

  it('writes only when the player explicitly saves', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<SaveModal isOpen onClose={() => undefined} />);

    act(() => {
      for (let elapsedMs = 1; elapsedMs <= 5; elapsedMs += 1) {
        const character = useGameStore.getState().character;
        useGameStore.setState({ character: { ...character, Task: { ...character.Task, elapsedMs } } });
      }
    });

    expect(setItem.mock.calls.filter(([key]) => key === 'progquest_roster_v1')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save current character' }));

    await waitFor(() => {
      expect(setItem.mock.calls.filter(([key]) => key === 'progquest_roster_v1')).toHaveLength(1);
    });
    expect(screen.getByRole('status').textContent).toContain('Character saved to this browser.');
  });

  it('recovers the roster display when an opening read fails transiently', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new DOMException('Transient denial', 'SecurityError');
    });
    render(<SaveModal isOpen onClose={() => undefined} />);

    await screen.findByText('Saved characters are unavailable. Nothing was changed.');
    fireEvent.click(screen.getByRole('button', { name: 'Save current character' }));

    await waitFor(() => expect(screen.queryByText('Saved characters are unavailable. Nothing was changed.')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('Character saved to this browser.');
    expect(screen.getByText(initialCharacter.Traits.Name)).toBeTruthy();
    getItem.mockRestore();
  });

  it('keeps a manual save fallback and reports clipboard rejection truthfully', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.stubGlobal('alert', vi.fn());

    try {
      render(<SaveModal isOpen onClose={() => undefined} />);

      const fallback = screen.getByRole('textbox', { name: 'Current save text' }) as HTMLTextAreaElement;
      expect(fallback.readOnly).toBe(true);
      expect(fallback.value.length).toBeGreaterThan(100);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Base64 .pqw Save String' }));

      const failure = await screen.findByRole('alert');
      expect(failure.textContent).toContain('copy it manually');
      expect(screen.queryByText(/copied to clipboard/i)).toBeNull();
      expect(writeText).toHaveBeenCalledWith(fallback.value);
      expect(diagnostics.snapshot().at(-1)?.code).toBe('clipboard_denied');
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('announces clipboard success only after the write fulfills', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      render(<SaveModal isOpen onClose={() => undefined} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Base64 .pqw Save String' }));

      const success = await screen.findByRole('status');
      expect(success.textContent).toContain('copied to the clipboard');
      expect(writeText).toHaveBeenCalledOnce();
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('explains manual copying when the Clipboard API is absent', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Reflect.deleteProperty(navigator, 'clipboard');

    try {
      render(<SaveModal isOpen onClose={() => undefined} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Base64 .pqw Save String' }));

      const failure = await screen.findByRole('alert');
      expect(failure.textContent).toContain('Clipboard API is unavailable');
      expect(diagnostics.snapshot().at(-1)?.code).toBe('clipboard_unavailable');
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
    }
  });

  it('distinguishes an unexpected clipboard failure from permission denial', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockRejectedValue(new Error('Synthetic clipboard failure'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      render(<SaveModal isOpen onClose={() => undefined} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Base64 .pqw Save String' }));

      const failure = await screen.findByRole('alert');
      expect(failure.textContent).toContain('could not be copied');
      expect(failure.textContent).not.toContain('denied');
      expect(diagnostics.snapshot().at(-1)?.code).toBe('clipboard_write_failed');
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('copies a click-time snapshot and disables duplicate copy requests while pending', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let finishCopy: (() => void) | undefined;
    const writeText = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      render(<SaveModal isOpen onClose={() => undefined} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save current character' }));
      await screen.findByRole('status');
      const staleText = (screen.getByRole('textbox', { name: 'Current save text' }) as HTMLTextAreaElement).value;
      act(() => {
        const character = useGameStore.getState().character;
        useGameStore.setState({ character: { ...character, Task: { ...character.Task, elapsedMs: character.Task.elapsedMs + 1 } } });
      });

      const copyButton = screen.getByRole('button', { name: 'Copy Base64 .pqw Save String' });
      fireEvent.click(copyButton);
      await waitFor(() => expect((copyButton as HTMLButtonElement).disabled).toBe(true));
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(writeText).toHaveBeenCalledOnce();
      const copiedText = writeText.mock.calls[0]?.[0];
      expect(copiedText).not.toBe(staleText);
      expect((screen.getByRole('textbox', { name: 'Current save text' }) as HTMLTextAreaElement).value).toBe(copiedText);

      finishCopy?.();
      await screen.findByRole('status');
      expect((copyButton as HTMLButtonElement).disabled).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('ignores a stale clipboard settlement after the modal closes and reopens', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let finishCopy: (() => void) | undefined;
    const writeText = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      const view = render(<SaveModal isOpen onClose={() => undefined} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Base64 .pqw Save String' }));
      await waitFor(() => expect((screen.getByRole('button', { name: 'Copying…' }) as HTMLButtonElement).disabled).toBe(true));
      view.rerender(<SaveModal isOpen={false} onClose={() => undefined} />);
      act(() => {
        useGameStore.setState({ character: createNewCharacter('Reopened', 'Off-Prem Elf', 'Vermineer', 613) });
      });
      view.rerender(<SaveModal isOpen onClose={() => undefined} />);
      const reopenedCopy = screen.getByRole('button', { name: 'Copy Base64 .pqw Save String' }) as HTMLButtonElement;
      expect(reopenedCopy.disabled).toBe(false);

      finishCopy?.();
      await act(async () => Promise.resolve());
      expect(screen.queryByRole('status')).toBeNull();
      expect((screen.getByRole('textbox', { name: 'Current save text' }) as HTMLTextAreaElement).value)
        .toBe(encodedOf(useGameStore.getState().character));
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('does not replace the active session or roster bytes when importing cannot persist', async () => {
    const existing = createNewCharacter('ExistingImportHero', 'Off-Prem Elf', 'Vermineer', 614);
    const imported = createNewCharacter('RejectedImportHero', 'Half Daemon', 'Robot Monk', 615);
    const originalRoster = JSON.stringify({ ExistingImportHero: existing });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    const activeCharacter = useGameStore.getState().character;
    const onClose = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    render(<SaveModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Import Save String (.pqw)' }), {
      target: { value: encodedOf(imported) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load Character' }));

    expect((await screen.findByRole('alert')).textContent).toContain('storage is full');
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
    expect(useGameStore.getState().character).toBe(activeCharacter);
    expect(onClose).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('reports corrupt roster data without overwriting it or the active session', async () => {
    const corruptRoster = '{not-json';
    localStorage.setItem('progquest_roster_v1', corruptRoster);
    const activeCharacter = useGameStore.getState().character;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(<SaveModal isOpen onClose={() => undefined} />);

    const failure = await screen.findByRole('alert');
    expect(failure.textContent).toContain('unreadable');
    expect(screen.queryByText('No saved characters found.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save current character' }));
    expect(localStorage.getItem('progquest_roster_v1')).toBe(corruptRoster);
    expect(setItem.mock.calls.filter(([key]) => key === 'progquest_roster_v1')).toHaveLength(0);
    expect(useGameStore.getState().character).toBe(activeCharacter);
    expect(diagnostics.snapshot().at(-1)?.code).toBe('roster_write_failed');
  });

  // Deleting a character is the only action in this modal that destroys player data, and it
  // was the only roster-mutating path with no test. Every other one here has a negative case.

  it('removes a character from the roster once the deletion is confirmed', async () => {
    const doomed = createNewCharacter('Doomed Bureaucrat', 'Half Daemon', 'Robot Monk', 701);
    const spared = createNewCharacter('Spared Bureaucrat', 'Off-Prem Elf', 'Vermineer', 702);
    localStorage.setItem('progquest_roster_v1', JSON.stringify({
      'Doomed Bureaucrat': doomed,
      'Spared Bureaucrat': spared,
    }));
    const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<SaveModal isOpen onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Doomed Bureaucrat' }));

    expect((await screen.findByRole('status')).textContent).toContain('Character removed from this browser.');
    expect(confirmed).toHaveBeenCalledWith('Are you sure you want to delete Doomed Bureaucrat?');
    const roster = JSON.parse(localStorage.getItem('progquest_roster_v1') ?? '{}');
    expect(Object.keys(roster)).toEqual(['Spared Bureaucrat']);
  });

  it('deletes nothing when the confirmation is declined', async () => {
    const doomed = createNewCharacter('Reprieved Bureaucrat', 'Half Daemon', 'Robot Monk', 703);
    const originalRoster = JSON.stringify({ 'Reprieved Bureaucrat': doomed });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    const declined = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(<SaveModal isOpen onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Reprieved Bureaucrat' }));

    expect(declined).toHaveBeenCalled();
    // Not merely "the bytes are unchanged": a write that happened to rewrite the same value would
    // satisfy that while still having taken the branch.
    expect(setItem.mock.calls.filter(([key]) => key === 'progquest_roster_v1')).toHaveLength(0);
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reports a failed deletion rather than appearing to have removed the character', async () => {
    const doomed = createNewCharacter('Undeletable Bureaucrat', 'Half Daemon', 'Robot Monk', 704);
    const originalRoster = JSON.stringify({ 'Undeletable Bureaucrat': doomed });
    localStorage.setItem('progquest_roster_v1', originalRoster);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    render(<SaveModal isOpen onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Undeletable Bureaucrat' }));

    // The wording, not merely its presence. findByRole already throws when the node is absent, so
    // toBeTruthy() on its text passed for any non-empty string — including a message telling the
    // user the deletion had succeeded, which is the one outcome this test's name forbids.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not|failed|unavailable|full/i);
    expect(alert.textContent).not.toMatch(/removed|deleted/i);
    expect(screen.queryByRole('status')).toBeNull();
    expect(localStorage.getItem('progquest_roster_v1')).toBe(originalRoster);
    expect(diagnostics.snapshot().at(-1)?.code).toBe('roster_delete_failed');
    setItem.mockRestore();
  });
});

describe('character creation stays in the dedicated creator', () => {
  /**
   * Replaces an assertion that could not fail.
   *
   * The e2e suite asserted `getByText('Roll New Guy')` had a count of zero. That string exists
   * nowhere in the repository, so the count was structurally zero and no change to this component
   * could have moved it — including the one the test's name forbids.
   *
   * The property is engine-level rather than textual: `gameStore` mints a character only through
   * `startSession` with `source: 'creation'`, and this modal legitimately calls `startSession` with
   * `'import'` and `'roster'`. So the discriminant is the request's source, which a vocabulary
   * rewrite cannot touch — the previous assertion rotted precisely because it matched flavour text.
   */
  const sweepEveryButton = async (roster: Record<string, ReturnType<typeof createNewCharacter>>) => {
    localStorage.setItem('progquest_roster_v1', JSON.stringify(roster));
    // Deletion asks first, and an unanswered prompt would stop the sweep at the first delete.
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const sources: string[] = [];
    const realStartSession = useGameStore.getState().startSession;
    useGameStore.setState({
      startSession: (request: Parameters<typeof realStartSession>[0]) => {
        sources.push(request.source);
        realStartSession(request);
      },
    });

    render(<SaveModal isOpen onClose={() => undefined} />);
    // By role and by index, never by name: a control added tomorrow is clicked by construction.
    const buttons = await screen.findAllByRole('button');
    for (const button of buttons) fireEvent.click(button);

    useGameStore.setState({ startSession: realStartSession });
    return { sources, buttonCount: buttons.length };
  };

  it('creates no character from any control in the roster modal', async () => {
    const stored = createNewCharacter('Filed Away', 'Half Daemon', 'Robot Monk', 808);
    const { sources, buttonCount } = await sweepEveryButton({ 'Filed Away': stored });

    // The instrument is live and the sweep reached something — without this, the assertion below
    // would pass on a wrapper that was never installed or a modal that rendered no controls, which
    // is the exact failure the string it replaces had.
    expect(buttonCount).toBeGreaterThan(2);
    expect(sources).toContain('roster');

    expect(sources, `a control in the roster modal created a character: ${sources.join(', ')}`)
      .not.toContain('creation');
  });

  it('creates no character from an empty roster either', async () => {
    // A creation affordance offered only when there is nothing to load would hide from a sweep
    // that always runs against a populated roster.
    const { sources, buttonCount } = await sweepEveryButton({});

    expect(buttonCount).toBeGreaterThan(0);
    expect(sources).not.toContain('creation');
  });

  it('renders none of the creator\'s own controls', async () => {
    // A second angle on the same rule, catching the shape rather than the behaviour: the creator
    // is a form with two radio-group fieldsets and a name box. This modal has none of that, and a
    // creation form pasted in here would bring it.
    localStorage.setItem('progquest_roster_v1', JSON.stringify({}));
    render(<SaveModal isOpen onClose={() => undefined} />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(document.querySelectorAll('form, fieldset')).toHaveLength(0);
  });
});
