import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import './App.css';
import { CharacterCreatorModal } from './components/CharacterCreatorModal';
import { CharacterSheetView } from './components/CharacterSheet';
import { HeroBanner } from './components/HeroBanner';
import { InventoryView } from './components/InventoryView';
import { LogFeed } from './components/LogFeed';
import { Navbar } from './components/Navbar';
import { PwaStatus } from './components/PwaStatus';
import { QuestLog } from './components/QuestLog';
import { SaveModal } from './components/SaveModal';
import { useGameStore } from './state/gameStore';
import { startGameClock } from './state/gameClock';
import { diagnostics } from './state/diagnostics';
import type { SessionCheckpointController } from './state/sessionCheckpoint';
import { applyTheme, readThemePreference, resolveInitialTheme, type ThemeId, writeThemePreference } from './theme';

const THEME_READ_FAILURE = 'Theme preference unavailable; using your system default.';
const THEME_WRITE_FAILURE = 'Theme changed, but this browser could not remember it.';

interface ThemeSelection {
  id: ThemeId;
  status: string;
}

interface AppProps {
  sessionCheckpoints?: SessionCheckpointController;
}

const SessionCheckpointStatus: React.FC<{ controller: SessionCheckpointController }> = ({ controller }) => {
  const notice = useSyncExternalStore(controller.subscribe, controller.getNotice, controller.getNotice);
  if (!notice) return null;
  return (
    <aside className="session-status" role={notice.kind} aria-live={notice.kind === 'status' ? 'polite' : 'assertive'} aria-atomic="true">
      <span>{notice.message}</span>
      {notice.canRepair ? <button className="btn btn-compact" type="button" onClick={controller.repair}>{notice.repairLabel}</button> : null}
    </aside>
  );
};

const recordThemeWriteFailure = (error: unknown) => {
  diagnostics.record({
    code: 'theme_write_failed',
    severity: 'warning',
    subsystem: 'theme',
    operation: 'write',
    outcome: 'failed',
    source: 'theme-preference',
    error,
  });
};

const App: React.FC<AppProps> = ({ sessionCheckpoints }) => {
  // The stored preference is read once, in a lazy initializer, and the read error travels with the
  // selection in state rather than through a ref, so nothing is written to a ref during render.
  const [initialTheme] = useState(() => {
    const storedTheme = readThemePreference();
    return {
      selection: {
        id: resolveInitialTheme(storedTheme.ok ? storedTheme.value : null, window.matchMedia('(prefers-color-scheme: dark)').matches),
        status: storedTheme.ok ? '' : THEME_READ_FAILURE,
      } satisfies ThemeSelection,
      readError: storedTheme.ok ? undefined : storedTheme.error,
    };
  });
  const [themeSelection, setThemeSelection] = useState<ThemeSelection>(initialTheme.selection);
  const themeReadErrorReported = useRef(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [requiresCharacterCreation, setRequiresCharacterCreation] = useState(sessionCheckpoints?.requiresCharacterCreation ?? false);
  const [isCharacterCreatorOpen, setIsCharacterCreatorOpen] = useState(requiresCharacterCreation);
  const tick = useGameStore((state) => state.tick);

  // Persisting the choice is a consequence of the click, so it happens in the click handler rather
  // than in an effect that reacts to the new selection and then sets state again.
  const changeTheme = (id: ThemeId) => {
    const writeResult = writeThemePreference(id);
    if (!writeResult.ok) recordThemeWriteFailure(writeResult.error);
    setThemeSelection({ id, status: writeResult.ok ? '' : THEME_WRITE_FAILURE });
  };

  useLayoutEffect(() => {
    if (initialTheme.readError && !themeReadErrorReported.current) {
      diagnostics.record({
        code: 'theme_read_failed',
        severity: 'warning',
        subsystem: 'theme',
        operation: 'read',
        outcome: 'failed',
        source: 'theme-preference',
        error: initialTheme.readError,
      });
    }
    themeReadErrorReported.current = true;
  }, [initialTheme.readError]);

  useLayoutEffect(() => {
    applyTheme(document.documentElement, themeSelection.id);
  }, [themeSelection.id]);

  // Main 50ms tick game loop timer
  useEffect(() => {
    if (requiresCharacterCreation) return;
    return startGameClock(tick, undefined, (error, discardedMs) => {
      diagnostics.record({
        code: 'game_tick_failed',
        severity: 'error',
        subsystem: 'browser',
        operation: 'event-handler',
        outcome: 'failed',
        source: 'game-clock',
        error,
        discardedMs,
      });
    });
  }, [requiresCharacterCreation, tick]);

  return (
    <div className="app-container">
      <a className="skip-link" href="#game-dashboard">Skip to game dashboard</a>
      <Navbar
        theme={themeSelection.id}
        themeStatus={themeSelection.status}
        onThemeChange={changeTheme}
        onOpenSaveModal={() => setIsSaveModalOpen(true)}
        onOpenCharacterCreator={() => setIsCharacterCreatorOpen(true)}
      />
      <PwaStatus />
      {sessionCheckpoints ? <SessionCheckpointStatus controller={sessionCheckpoints} /> : null}

      <HeroBanner />

      <main className="main-grid" id="game-dashboard">
        <div className="quest-column">
          <QuestLog />
          <InventoryView />
        </div>
        <LogFeed />
        <CharacterSheetView />
      </main>

      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
      />

      <CharacterCreatorModal
        isOpen={isCharacterCreatorOpen}
        isRequired={requiresCharacterCreation}
        onClose={() => setIsCharacterCreatorOpen(false)}
        onCreated={() => {
          setRequiresCharacterCreation(false);
          setIsCharacterCreatorOpen(false);
        }}
      />
    </div>
  );
};

export default App;
