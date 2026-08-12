import { Dices, Sparkles, UserPlus, X } from 'lucide-react';
import React, { useState } from 'react';
import { KLASSES, PRIME_STATS, RACES } from '../data/traits';
import { generateInitialStats } from '../engine/math';
import { RandomGenerator } from '../engine/prng';
import { generateRandomName } from '../engine/sim';
import type { StatsMap } from '../engine/types';
import { useGameStore } from '../state/gameStore';
import { MAX_CHARACTER_NAME_LENGTH } from '../state/schemas';
import { useModalDialog } from './useModalDialog';

interface CharacterCreatorModalProps {
  isOpen: boolean;
  isRequired?: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export const CharacterCreatorModal: React.FC<CharacterCreatorModalProps> = ({ isOpen, isRequired = false, onClose, onCreated = onClose }) => {
  // Selecting the action alone, the way SaveModal does. A bare useGameStore() subscribes to
  // every store mutation, so this modal re-rendered on all 20 of 20 measured game ticks while
  // closed and returning null; SaveModal's narrow select rendered 0 of 20.
  const startSession = useGameStore((state) => state.startSession);
  const dismiss = () => {
    if (!isRequired) onClose();
  };
  const dialogRef = useModalDialog(isOpen, dismiss);

  const [name, setName] = useState(generateRandomName());
  const [race, setRace] = useState(RACES.at(0)?.name ?? '');
  const [klass, setKlass] = useState(KLASSES.at(0)?.name ?? '');

  // Stat Rolling state
  const [seedHistory, setSeedHistory] = useState<number[]>([]);
  const [currentSeed, setCurrentSeed] = useState<number>(Date.now());
  const [stats, setStats] = useState<StatsMap>(() => generateInitialStats(new RandomGenerator(currentSeed), race, klass));
  /**
   * What the last roll produced, for the status region.
   *
   * Empty until the player rolls, so opening the dialogue does not announce a result nobody asked
   * for. Rolling changes seven numbers at once — six stats and the total — and a screen-reader user
   * previously got silence and had to navigate back into the grid and re-read all seven to find out
   * what happened, in the one part of this app that is genuinely interactive. WCAG 2.2 4.1.3.
   *
   * All six are spoken rather than only the total. This is a deliberate button press, not ambient
   * chatter, and the six values are exactly what was asked for — announcing only the sum would send
   * the reader back into the grid for the rest, which is the problem being fixed.
   */
  const [rollOutcome, setRollOutcome] = useState('');

  if (!isOpen) return null;

  const totalStats = PRIME_STATS.reduce((sum, stat) => sum + stats[stat], 0);

  const getTotalTone = (total: number) => {
    if (total >= 81) return 'badge-danger';
    if (total > 72) return 'badge-warning';
    if (total < 54) return 'badge-muted';
    return '';
  };

  const describeRoll = (rolled: StatsMap, verb: string) => {
    const total = PRIME_STATS.reduce((sum, stat) => sum + (rolled[stat] || 0), 0);
    return `${verb} ${total} total. ${PRIME_STATS.map((stat) => `${stat} ${rolled[stat]}`).join(', ')}.`;
  };

  const handleRoll = () => {
    const nextSeed = Date.now() + Math.floor(Math.random() * 10000);
    const rolled = generateInitialStats(new RandomGenerator(nextSeed), race, klass);
    setSeedHistory((prev) => [...prev, currentSeed]);
    setCurrentSeed(nextSeed);
    setStats(rolled);
    setRollOutcome(describeRoll(rolled, 'Rolled'));
  };

  const handleUnroll = () => {
    if (seedHistory.length === 0) return;
    const prevSeed = seedHistory.at(-1);
    if (prevSeed === undefined) return;
    const restored = generateInitialStats(new RandomGenerator(prevSeed), race, klass);
    setSeedHistory((prev) => prev.slice(0, -1));
    setCurrentSeed(prevSeed);
    setStats(restored);
    setRollOutcome(describeRoll(restored, 'Restored'));
  };

  const handleRandomName = () => {
    setName(generateRandomName());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    startSession({ source: 'creation', name: name.trim(), race, klass, seed: currentSeed, stats });
    onCreated();
  };

  return (
    <dialog ref={dialogRef} className="modal-overlay" onClick={dismiss} aria-labelledby="creator-title">
      <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="creator-title">
            Progress Quest III — New Character
          </h2>
          {isRequired ? null : (
            <button className="btn btn-compact" onClick={onClose} aria-label="Close character creator modal">
              <X size={16} />
            </button>
          )}
        </div>

        {isRequired ? (
          <p className="creator-intro">
            No resumable adventurer was found. Appoint one before the bureaucracy can proceed.
          </p>
        ) : null}

        <form className="modal-form" onSubmit={handleSubmit}>
          {/* Name & Random Name Generator */}
          <div>
            <label className="field-label" htmlFor="character-name">
              Character Name
            </label>
            <div className="field-row">
              <input
                id="character-name"
                name="characterName"
                type="text"
                autoComplete="off"
                value={name}
                maxLength={MAX_CHARACTER_NAME_LENGTH}
                onChange={(e) => setName(e.target.value)}
                required
                className="form-control"
              />
              <button type="button" className="btn" onClick={handleRandomName} title="Generate Random Name">
                <Sparkles size={16} /> Random
              </button>
            </div>
          </div>

          {/* Stat Roller with Total Sum Display */}
          <div className="surface-panel">
            <div className="surface-header">
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Prime Stats (3d6 Rolls)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Total:</span>
                <span className={`badge total-badge ${getTotalTone(totalStats)}`}>
                  {totalStats}
                </span>
              </div>
            </div>

            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{rollOutcome}</div>

            <div className="stat-grid" data-testid="creator-prime-stats" style={{ marginBottom: '0.75rem' }}>
              {PRIME_STATS.map((stat) => (
                <div className="stat-item" key={stat}>
                  <span>{stat}</span>
                  <strong>{stats[stat]}</strong>
                </div>
              ))}
            </div>

            <div className="button-row">
              <button type="button" className="btn btn-primary" onClick={handleRoll} style={{ flex: 1, justifyContent: 'center' }}>
                <Dices size={16} /> Roll 'Em
              </button>
              <button type="button" className="btn" onClick={handleUnroll} disabled={seedHistory.length === 0} style={{ flex: 1, justifyContent: 'center' }}>
                Unroll (Undo)
              </button>
            </div>
          </div>

          {/* Race & Class Pickers */}
          <div className="picker-grid">
            <fieldset className="picker-fieldset">
              <legend className="field-label">
                Select Race
              </legend>
              <div className="picker-list surface-panel">
                {RACES.map((r) => (
                  <label className="picker-option" key={r.name}>
                    <input
                      type="radio"
                      name="racePicker"
                      value={r.name}
                      checked={race === r.name}
                      onChange={() => {
                        setRace(r.name);
                        setStats(generateInitialStats(new RandomGenerator(currentSeed), r.name, klass));
                      }}
                    />
                    <span>{r.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="picker-fieldset">
              <legend className="field-label">
                Select Class
              </legend>
              <div className="picker-list surface-panel">
                {KLASSES.map((k) => (
                  <label className="picker-option" key={k.name}>
                    <input
                      type="radio"
                      name="klassPicker"
                      value={k.name}
                      checked={klass === k.name}
                      onChange={() => {
                        setKlass(k.name);
                        setStats(generateInitialStats(new RandomGenerator(currentSeed), race, k.name));
                      }}
                    />
                    <span>{k.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <button type="submit" className="btn btn-primary">
            <UserPlus size={16} /> Sold! Start Questing
          </button>
        </form>
      </div>
    </dialog>
  );
};
