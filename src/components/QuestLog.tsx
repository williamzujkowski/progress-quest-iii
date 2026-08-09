import React from 'react';
import { useGameStore } from '../state/gameStore';
import { ActLabel, GameNumber } from './GameNumber';
import { ClosedCasework } from './ClosedCasework';
import { adversaryDossier } from '../state/adversaryDossier';
import { displayTarget } from '../state/caseload';
import { QUEST_TARGET_PROGRESS } from '../engine/transition';

export const QuestLog: React.FC = () => {
  const { character } = useGameStore();
  // The docket tally the summary panel already keeps. Reused rather than recounted: two places
  // counting the same thing is two places to disagree about it.
  const dockets = useGameStore((state) => state.caseload.targets[character.Quest.target ?? ''] ?? 0);
  const hasClosedCasework = (character.Quest.history?.length ?? 0) > 0;
  // Filed under a composite key; named by the part of it a reader recognises.
  const dossier = adversaryDossier(
    character.Quest.target === undefined ? undefined : displayTarget(character.Quest.target),
    dockets,
  );

  /*
   * Whole seconds, at the display layer and nowhere else.
   *
   * `progressDelta` is `task.durationMs / 1000`, so both tracks accumulate a fractional number of
   * seconds and the bars read `41.92 / 76 s` against `491.76 / 21600 s` — two decimal places on the
   * numerator, a whole number on the denominator, and every other figure on the dashboard an
   * integer. It asserts hundredth-of-a-second accuracy about a running sum of task durations, and
   * both digits change on every tick, so the two quietest readings in the panel were the noisiest
   * things on screen.
   *
   * `formatDuration` already refuses exactly this a few modules away — "reporting 4h 12m 37s would
   * dress a five-minute average up as a stopwatch reading" — and the argument transfers unchanged.
   *
   * Rounded here rather than in the engine, which is not a hedge: the stored values are persisted
   * state and moving them would rewrite every golden to make a bar tidier. The percentages below
   * still come off the raw values, so the fill stays exact and only the label is coarse.
   */
  const questProgress = Math.round(character.Quest.currentProgress);
  const plotProgress = Math.round(character.Plot.currentProgress);

  const taskPct = Math.min(100, Math.floor((character.Task.elapsedMs / character.Task.durationMs) * 100));
  const questPct = Math.min(100, Math.floor((character.Quest.currentProgress / character.Quest.maxProgress) * 100));
  const plotPct = Math.min(100, Math.floor((character.Plot.currentProgress / character.Plot.maxProgress) * 100));

  return (
    <section className="card quest-card" aria-labelledby="quest-log-heading">
      <div className="card-header">
        <h2 id="quest-log-heading">Questing & Progression</h2>
        <span className="badge badge-warning"><ActLabel act={character.Plot.act} /></span>
      </div>

      <div className="progress-container progress-task">
        <div className="progress-label">
          <span>Task: {character.Task.description}</span>
          <span>{taskPct}%</span>
        </div>
        <div
          className="progress-bar-track"
          role="progressbar"
          aria-label="Current task progress"
          aria-valuenow={taskPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-bar-fill" style={{ width: `${taskPct}%` }} />
        </div>
      </div>

      <div className="progress-container progress-quest" style={{ marginTop: '0.75rem' }}>
        <div className="progress-label">
          <span>Quest: {character.Quest.description}</span>
          {/* The unit, on both of the bars that have one.
              This read `37 / 112` beside a description saying *Exterminate the Gnolls*, which is a
              count a watcher will make and the game will then contradict: killing a rat advances the
              same bar, and killing a Gnoll advances it by three. The pair are seconds of task time,
              and the world console one card away already prints seconds this way. */}
          <span>
            <GameNumber value={questProgress} /> / <GameNumber value={character.Quest.maxProgress} />{' '}
            <span className="stat-unit">s</span>
          </span>
        </div>
        <div
          className="progress-bar-track"
          role="progressbar"
          aria-label="Current quest progress"
          aria-valuenow={questPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${questProgress} of ${character.Quest.maxProgress} seconds`}
        >
          <div className="progress-bar-fill" style={{ width: `${questPct}%` }} />
        </div>
      </div>

      {/* The multiplier, finally said where the bar is.
          `transition.ts` sets out the design goal in as many words — the effect "has to be
          attributable by a player who never acts" — and then no surface named it. One kill in four
          is biased toward the monster the quest named, and that kill moves this track by three; a
          watcher saw a bar lurch and had nothing to distinguish it from noise.
          The rate is read from the engine constant rather than written out here, so the panel cannot
          go on asserting a figure the transition has stopped using. */}
      {character.Task.questTarget && (
        <p className="progress-note">
          Named party engaged. This assignment is credited at {QUEST_TARGET_PROGRESS}× the ordinary
          rate, which nobody has been asked to justify.
        </p>
      )}

      {/* What the archive has on whoever the hero is currently bothering. Bureaucracy rather than
          threat: a target filed against forty times is exactly as dangerous as a fresh one. */}
      {dossier && <p className="quest-dossier">{dossier.summary}</p>}

      <div className="progress-container progress-plot" style={{ marginTop: '0.75rem' }}>
        <div className="progress-label">
          <span>Plot Progress</span>
          <span>
            <GameNumber value={plotProgress} /> / <GameNumber value={character.Plot.maxProgress} />{' '}
            <span className="stat-unit">s</span>
          </span>
        </div>
        <div
          className="progress-bar-track"
          role="progressbar"
          aria-label="Plot act progress"
          aria-valuenow={plotPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${plotProgress} of ${character.Plot.maxProgress} seconds`}
        >
          <div className="progress-bar-fill" style={{ width: `${plotPct}%` }} />
        </div>
      </div>
      {/* Why the hero banner's projection disagrees with subtracting one number from the other.
          The act track advances on kills, and in the prologue on the prologue's own tasks — nothing
          else moves it. A watcher who divides the remaining seconds by the wall clock gets an
          answer the banner contradicts, and until now the reason lived only in a source comment. */}
      <p className="progress-note">
        Credited in seconds. Travel, market attendance and ceremony are not credited.
      </p>

      {/* The archive is looked at occasionally; the bars above it are looked at constantly.
          Gated on having something to show, like the records disclosure opposite: a summary that
          opens onto nothing is a promise the panel cannot keep, and ClosedCasework returning null
          hides its contents without hiding the triangle inviting someone to look for them. */}
      {hasClosedCasework && (
        <details className="records-details">
          <summary>Matters on file</summary>
          <ClosedCasework />
        </details>
      )}
    </section>
  );
};
