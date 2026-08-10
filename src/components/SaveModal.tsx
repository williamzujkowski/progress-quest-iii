import { Copy, Save as SaveIcon, Trash2, Upload, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { CharacterSheet } from '../engine/types';
import { diagnostics, isDOMExceptionNamed } from '../state/diagnostics';
import { useGameStore } from '../state/gameStore';
import { decodePQWSave, encodePQWSave, importToRoster, loadRoster, removeFromRoster, saveToRoster } from '../state/saveManager';
import { GameNumber } from './GameNumber';
import { useModalDialog } from './useModalDialog';

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function recordRosterFailure(code: 'roster_read_failed' | 'roster_write_failed' | 'roster_delete_failed', operation: 'read' | 'write' | 'delete'): void {
  diagnostics.record({ code, severity: 'warning', subsystem: 'storage', operation, outcome: 'failed', source: 'save-modal' });
}

const isClipboardDenied = (error: unknown): boolean => isDOMExceptionNamed(error, 'NotAllowedError');

export const SaveModal: React.FC<SaveModalProps> = ({ isOpen, onClose }) => {
  const dialogRef = useModalDialog(isOpen, onClose);
  const startSession = useGameStore((state) => state.startSession);
  const [roster, setRoster] = useState<Record<string, CharacterSheet> | null>({});
  const [importInput, setImportInput] = useState('');
  const [currentName, setCurrentName] = useState('');
  const [currentPQW, setCurrentPQW] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'status' | 'alert'; message: string } | null>(null);
  const copyOperation = useRef(0);

  const refreshRoster = (): void => {
    const result = loadRoster();
    if (!result.ok) {
      recordRosterFailure('roster_read_failed', 'read');
      setRoster(null);
      setFeedback({ kind: 'alert', message: result.error.message });
      return;
    }
    setRoster(result.value);
  };

  useEffect(() => {
    copyOperation.current += 1;
    setIsCopying(false);
    if (isOpen) {
      const character = useGameStore.getState().character;
      setCurrentName(character.Traits.Name);
      // A sheet the importer would refuse yields no save text and says why, rather than filling the
      // box with a string that cannot be imported anywhere.
      const encoded = encodePQWSave(character);
      setCurrentPQW(encoded.ok ? encoded.value : '');
      setFeedback(encoded.ok ? null : { kind: 'alert', message: encoded.error.message });
      refreshRoster();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveCurrent = () => {
    const character = useGameStore.getState().character;
    const result = saveToRoster(character);
    if (!result.ok) {
      recordRosterFailure('roster_write_failed', 'write');
      setFeedback({ kind: 'alert', message: result.error.message });
      return;
    }
    setCurrentName(character.Traits.Name);
    // `saveToRoster` has already validated to get here, so this cannot fail — but the box is filled
    // from the result rather than from an assumption, so the two can never disagree.
    const encoded = encodePQWSave(character);
    setCurrentPQW(encoded.ok ? encoded.value : '');
    setRoster(result.value);
    setFeedback(encoded.ok
      ? { kind: 'status', message: 'Character saved to this browser.' }
      : { kind: 'alert', message: encoded.error.message });
  };

  const handleCopyPQW = async () => {
    if (isCopying) return;
    const character = useGameStore.getState().character;
    const encoded = encodePQWSave(character);
    setCurrentName(character.Traits.Name);
    if (!encoded.ok) {
      // Refused before the clipboard is touched. Copying a string the importer will reject is worse
      // than copying nothing, because the player finds out on the far side of the paste.
      setCurrentPQW('');
      setFeedback({ kind: 'alert', message: encoded.error.message });
      return;
    }
    const saveText = encoded.value;
    setCurrentPQW(saveText);
    setFeedback(null);
    setIsCopying(true);
    const operation = ++copyOperation.current;
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        if (copyOperation.current !== operation) return;
        diagnostics.record({ code: 'clipboard_unavailable', severity: 'warning', subsystem: 'clipboard', operation: 'copy', outcome: 'failed', source: 'save-modal' });
        setFeedback({ kind: 'alert', message: 'Clipboard API is unavailable. Select the save text and copy it manually.' });
        return;
      }
      await clipboard.writeText(saveText);
      if (copyOperation.current !== operation) return;
      setFeedback({ kind: 'status', message: 'Save text copied to the clipboard.' });
    } catch (error) {
      if (copyOperation.current !== operation) return;
      const denied = isClipboardDenied(error);
      diagnostics.record({ code: denied ? 'clipboard_denied' : 'clipboard_write_failed', severity: 'warning', subsystem: 'clipboard', operation: 'copy', outcome: 'failed', source: 'save-modal', error });
      setFeedback({
        kind: 'alert',
        message: denied
          ? 'Clipboard access was denied. Select the save text and copy it manually.'
          : 'Save text could not be copied. Select it and copy it manually.',
      });
    } finally {
      if (copyOperation.current === operation) setIsCopying(false);
    }
  };

  const handleImport = () => {
    setFeedback(null);
    const result = decodePQWSave(importInput);
    if (!result.ok) {
      setFeedback({ kind: 'alert', message: result.error.message });
      return;
    }

    // Imports insert; they do not replace. A collision means two different characters sharing a
    // name, and the one already here represents elapsed time that cannot be re-earned. Deleting a
    // character has always asked first — this asks for the same reason, and did not before.
    let saved = importToRoster(result.value);
    if (!saved.ok && saved.error.code === 'roster_name_taken') {
      const replace = confirm(
        `This browser already holds a character called ${result.value.Traits.Name}. `
        + 'Loading this save will replace it permanently. Replace it?',
      );
      if (!replace) {
        setFeedback({ kind: 'status', message: 'Nothing was changed.' });
        return;
      }
      saved = saveToRoster(result.value);
    }
    if (!saved.ok) {
      recordRosterFailure('roster_write_failed', 'write');
      setFeedback({ kind: 'alert', message: saved.error.message });
      return;
    }

    startSession({ source: 'import', character: result.value });
    setImportInput('');
    onClose();
  };

  const handleDeleteCharacter = (name: string) => {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      const result = removeFromRoster(name);
      if (!result.ok) {
        recordRosterFailure('roster_delete_failed', 'delete');
        setFeedback({ kind: 'alert', message: result.error.message });
        return;
      }
      setRoster(result.value);
      setFeedback({ kind: 'status', message: 'Character removed from this browser.' });
    }
  };

  return (
    <dialog ref={dialogRef} className="modal-overlay" onClick={onClose} aria-labelledby="modal-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="modal-title">Character Roster & Save Manager</h2>
          <button className="btn btn-compact" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        <p className="roster-meta">
          Character saves preserve the hero sheet. Loading one keeps its sheet tracks but starts fresh session counters and deterministic continuation; automatic checkpoints resume the active adventure.
        </p>

        {feedback && (
          <div
            aria-atomic="true"
            aria-live={feedback.kind === 'status' ? 'polite' : 'assertive'}
            className={feedback.kind === 'alert' ? 'error-message' : 'status-message'}
            role={feedback.kind}
          >
            {feedback.message}
          </div>
        )}

        {/* Current Character Save Export */}
        <div className="surface-panel">
          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Export Current Save ({currentName}.pqw)
          </div>
          <button className="btn btn-block" onClick={handleSaveCurrent}>
            <SaveIcon size={16} /> Save current character
          </button>
          <label htmlFor="current-save-text" style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.5rem' }}>Current save text</label>
          <textarea id="current-save-text" name="currentSaveText" className="form-control" value={currentPQW} readOnly rows={3} />
          <button className="btn btn-block" disabled={isCopying} aria-busy={isCopying} onClick={handleCopyPQW}>
            <Copy size={16} /> {isCopying ? 'Copying…' : 'Copy Base64 .pqw Save String'}
          </button>
        </div>

        {/* Import Save String */}
        <div className="surface-panel">
          <label htmlFor="import-save-text" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Import Save String (.pqw)</label>
          <textarea
            id="import-save-text"
            name="importSaveText"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            placeholder="Paste a base64 .pqw save string here…"
            autoComplete="off"
            rows={3}
            className="form-control"
          />
          <button className="btn btn-block" onClick={handleImport} style={{ marginTop: '0.5rem' }}>
            <Upload size={16} /> Load Character
          </button>
        </div>

        {/* Saved Roster List */}
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Saved Character Roster</div>
          <div className="roster-list">
            {roster === null ? (
              <div style={{ fontSize: '0.875rem', color: 'var(--accent-danger)' }}>Saved characters are unavailable. Nothing was changed.</div>
            ) : Object.values(roster).length === 0 ? (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No saved characters found.</div>
            ) : (
              Object.values(roster).map((char) => (
                <div className="roster-item" key={char.Traits.Name}>
                  <div>
                    <strong style={{ fontSize: '0.875rem' }}>{char.Traits.Name}</strong>
                    <div className="roster-meta">
                      Lvl{' '}<GameNumber value={char.Traits.Level} />{' '}{char.Traits.Race} {char.Traits.Class}
                    </div>
                  </div>
                  <div className="roster-actions">
                    <button className="btn btn-compact" onClick={() => { startSession({ source: 'roster', character: char }); onClose(); }}>
                      Play
                    </button>
                    <button className="btn btn-compact btn-danger" aria-label={`Delete ${char.Traits.Name}`} onClick={() => handleDeleteCharacter(char.Traits.Name)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
};
