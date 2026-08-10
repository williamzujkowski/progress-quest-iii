import { Scroll } from 'lucide-react';
import { ENCOUNTER_SECONDS_PRECISION } from '../engine/loadoutFiling';
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { describeGameNumber, formatGameNumber } from '../engine/text';
import { useGameStore } from '../state/gameStore';
import { projectWorld } from '../state/worldContext';
import { TENOR_LABELS, tenorFor, tenorLine } from '../state/institutionalTenor';
import { eraAt } from '../state/namedEras';
import { venueBulletin } from '../state/venueBulletin';
import { attendanceLabel, raidMuster } from '../state/raidMuster';
import { ActLabel } from './GameNumber';
import { ChatterFeed } from './ChatterFeed';

function formatElapsed(totalSeconds: number): string {
  if (totalSeconds >= 1_000_000) return `${formatGameNumber(totalSeconds)}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatElapsedForSpeech(totalSeconds: number): string {
  if (totalSeconds >= 1_000_000) return `${totalSeconds.toLocaleString('en-US')} seconds`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [
    ...(hours ? [`${hours} ${hours === 1 ? 'hour' : 'hours'}`] : []),
    ...(minutes ? [`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`] : []),
    `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
  ].join(', ');
}

export const LogFeed: React.FC = () => {
  const log = useGameStore((state) => state.log);
  const worldNotices = useGameStore((state) => state.worldNotices);
  const character = useGameStore((state) => state.character);
  const progression = useGameStore((state) => state.progression);
  const sessionGeneration = useGameStore((state) => state.sessionGeneration);
  const pendingElapsedMs = useGameStore((state) => state.pendingElapsedMs);
  const caseload = useGameStore((state) => state.caseload);
  const currentProjection = projectWorld({ kind: 'current', state: { character, progression } });
  const world = currentProjection.context;
  // Null until a matter has recurred across more than one act, which is most of a run.
  const era = eraAt(caseload, world.act);
  const loadout = currentProjection.loadout;
  const counterfactual = currentProjection.counterfactual;
  const services = venueBulletin(world);
  const muster = raidMuster(world);
  const feedRef = useRef<HTMLDivElement>(null);
  const activityPanelRef = useRef<HTMLElement>(null);
  const chatterTabRef = useRef<HTMLButtonElement>(null);
  const activityTabRef = useRef<HTMLButtonElement>(null);
  const activityFollowingLatest = useRef(true);
  const pendingTabFocus = useRef<'chatter' | 'activity' | null>(null);
  const latest = log[0];
  const latestId = latest?.id;
  const initialLatestId = useRef(latest?.id);
  const [activeView, setActiveView] = useState<'chatter' | 'activity'>('chatter');
  const [showActivityJump, setShowActivityJump] = useState(false);
  const consoleId = useId();
  const chatterTabId = `${consoleId}-chatter-tab`;
  const activityTabId = `${consoleId}-activity-tab`;
  const chatterPanelId = `${consoleId}-chatter-panel`;
  const activityPanelId = `${consoleId}-activity-panel`;
  const chatterTruthId = `${consoleId}-chatter-truth`;
  const activityTruthId = `${consoleId}-activity-truth`;

  useLayoutEffect(() => {
    if (latestId === undefined) {
      activityFollowingLatest.current = true;
      setShowActivityJump(false);
      return;
    }
    if (activeView !== 'activity') return;
    if (activityFollowingLatest.current) {
      if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
      setShowActivityJump(false);
    } else {
      setShowActivityJump(true);
    }
  }, [activeView, latestId]);

  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (focused === activityTabRef.current || (focused instanceof Node && activityPanelRef.current?.contains(focused))) {
      pendingTabFocus.current = 'chatter';
    }
    setActiveView('chatter');
    activityFollowingLatest.current = true;
    setShowActivityJump(false);
  }, [sessionGeneration]);

  useLayoutEffect(() => {
    if (pendingTabFocus.current !== activeView) return;
    (activeView === 'chatter' ? chatterTabRef : activityTabRef).current?.focus();
    pendingTabFocus.current = null;
  }, [activeView]);

  const jumpToLatestActivity = () => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      feedRef.current.focus();
    }
    activityFollowingLatest.current = true;
    setShowActivityJump(false);
  };

  const activateView = (view: 'chatter' | 'activity', focus = false) => {
    if (focus) pendingTabFocus.current = view;
    setActiveView(view);
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, view: 'chatter' | 'activity') => {
    let next: 'chatter' | 'activity' | undefined;
    if (event.key === 'ArrowRight') next = view === 'chatter' ? 'activity' : 'chatter';
    else if (event.key === 'ArrowLeft') next = view === 'activity' ? 'chatter' : 'activity';
    else if (event.key === 'Home') next = 'chatter';
    else if (event.key === 'End') next = 'activity';
    if (!next) return;
    event.preventDefault();
    // Both bounded panels are local and already mounted, so automatic activation is immediate.
    activateView(next, true);
  };

  const getLogTag = (entry: string) => {
    if (entry.startsWith('Defeated monster and looted ') || entry.startsWith('Item ')) return <span className="log-tag tag-loot">Loot</span>;
    if (entry.startsWith('Quest completed:')) return <span className="log-tag tag-quest">Quest</span>;
    if (entry.startsWith('LEVEL UP!') || entry.startsWith('Act ')) return <span className="log-tag tag-levelup">Level</span>;
    if (entry.startsWith('Negotiated purchase:')) return <span className="log-tag tag-market">Market</span>;
    if (entry.startsWith('Defeated ') || entry.startsWith('Executing ')) return <span className="log-tag tag-combat">Combat</span>;
    return null;
  };

  return (
    <section className="card activity-card" aria-labelledby="log-heading">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Scroll size={18} />
          <h2 id="log-heading">World Console</h2>
        </div>
      </div>

      {/*
        Silent while a backlog is draining, which is the difference between a status region and a
        firehose. A closed tab banks up to 11.6 days, and the clock spends it at 50 ms a tick — so a
        six-hour absence pushed roughly sixty new newest-entries in three seconds. `aria-live`
        queues rather than replaces, and a page cannot cancel a queued polite utterance, so a
        screen-reader user got about two minutes of already-happened events during which nothing
        else they did could be heard.

        The right announcement already exists: `describeDigest` lands the one-line summary when the
        drain finishes, and it was being read out *after* the sixty lines it summarises. Suppressing
        until then makes the digest the announcement rather than the postscript.
      */}
      <div className="sr-only" role="status" aria-label="Latest activity" aria-live="polite" aria-atomic="true">
        {latest?.id === initialLatestId.current || pendingElapsedMs > 0 ? '' : latest?.message}
      </div>

      <section className="world-context" role="region" aria-label="Current world context">
        <span className="world-context-truth">Fictional world · activity-derived</span>
        <div className="world-context-line">
          <strong>
            <span aria-hidden="true">LOOK // {world.location}</span>
            <span className="sr-only">Look: {world.spokenLocation}</span>
          </strong>
          <span>
            <span aria-hidden="true"><ActLabel act={world.act} /> · {formatElapsed(world.elapsedSeconds)} adventure elapsed</span>
            <span className="sr-only">{world.act === 0 ? 'Prologue' : `Act ${describeGameNumber(world.act)}`} · {formatElapsedForSpeech(world.elapsedSeconds)} adventure elapsed</span>
          </span>
        </div>
        <div className="world-context-line world-context-meta">
          <span>{world.venue} // {world.activity}</span>
          {world.assignmentScope ? <span>assignment // {world.assignmentScope}</span> : null}
          <span>tenor // {TENOR_LABELS[tenorFor(world)].toLowerCase()}</span>
          {/* The one thing on this line that is not the same for every hero.
              `tenorFor` is a function of the act and nothing else, so the tier, its label and its
              line arrive at identical moments in every save that has ever been played. The register
              is where a run differs from another run, and an era named out of it is the file
              describing its own shape rather than the calendar's. */}
          {era && <span>period // {era.phrase}</span>}
        </div>
        {/* The institution's opinion of itself, which is the only thing here that changes by
            degree rather than by counting up. Every line is literally true of a hero filing
            paperwork and killing rats; only the confidence moves. */}
        <p className="world-context-tenor">{tenorLine(world)}</p>
        {/* A place used to be a name with nothing in it. These notices do nothing the engine does
            not already do — towns list over-administered offices, fields under-administered
            notices, and dungeons administrative notes from people who have never been inside. */}
        {services && (
          <ul className="world-context-services" aria-label="Notices for this venue">
            {services.map((office) => <li key={office}>{office}</li>)}
          </ul>
        )}
        {/* The artefact a raid actually produced: an attendance sheet. Everyone named is from the
            cast the chatter panel already declares fictional, and nobody's attendance changes the
            encounter, which is resolved by opponent puissance and level as it is everywhere. */}
        {muster && (
          <ul className="world-context-services" aria-label="Muster sheet for this raid, fictional">
            {muster.map((entry) => (
              <li key={entry.name}>{entry.name} · {entry.role} · {attendanceLabel(entry.attendance)}</li>
            ))}
          </ul>
        )}
        {/* The loadout, said out loud.
            ADR 0008 gave equipment a real effect — a kill takes `1000 / (1000 + quality)` of the
            time it otherwise would — and it has been invisible since it shipped, because the player
            cannot see the counterfactual and nothing named it. Every figure here is one the engine
            multiplied by, so the console can say it without flattering anything.
            Written as an observation the institution has filed, never as an achievement: the moment
            a repeated modifier reads as something to pursue, the joke becomes a spreadsheet the
            player is forbidden to fill in. */}
        {loadout && loadout.itemOfRecord && (
          <ul className="world-context-services" aria-label="Loadout filing">
            <li>
              Item of record // {loadout.itemOfRecord.name} ({loadout.itemOfRecord.slot})
            </li>
            {loadout.reductionPercent > 0 && (
              <li>
                {/* No emptiness guard: `itemOfRecord` is `contributors[0] ?? null`, so reaching
                    this at all means there is at least one to cite. */}
                Processing time reduced by {loadout.reductionPercent}%
                {`, cited: ${loadout.contributors.slice(0, 3).map(({ name }) => name).join(', ')}`}
              </li>
            )}
            {/* The road not taken, in seconds.
                The engine derives the canonical duration and then multiplies it away, and the
                unmultiplied figure has never been named anywhere. A percentage is a claim about a
                ratio; two durations are a claim about the encounter the player is currently watching
                a bar fill for, which is the only genuinely new thing an idle game can put on screen.
                Both figures come from the same multiplication the engine performed — recovered by
                division rather than recomputed, because two derivations of one number drift. */}
            {counterfactual && (
              <li>
                This encounter is scheduled at {(counterfactual.actualMs / 1000).toFixed(ENCOUNTER_SECONDS_PRECISION)}s.
                Under the original schedule it would have taken {(counterfactual.canonicalMs / 1000).toFixed(ENCOUNTER_SECONDS_PRECISION)}s.
              </li>
            )}
            {loadout.repeatedModifier && (
              <li>
                {loadout.repeatedModifier.name} recorded in {loadout.repeatedModifier.slots} slots. Noted as a coincidence.
              </li>
            )}
          </ul>
        )}
        <details className="world-context-details">
          <summary>World filings{worldNotices.length > 0 ? ` (${worldNotices.length})` : ''}</summary>
          <div className="world-context-notices" role="region" tabIndex={0} aria-label="Derived world notices">
            {worldNotices.length > 0
              ? worldNotices.toReversed().map((entry) => <p key={entry.id}>{entry.text}</p>)
              : <p>No derived notices. The world is between forms.</p>}
          </div>
        </details>
      </section>

      <div className="console-tabs" role="tablist" aria-label="World Console views">
        <button
          ref={chatterTabRef}
          id={chatterTabId}
          type="button"
          role="tab"
          aria-label="Chatter"
          aria-describedby={chatterTruthId}
          aria-selected={activeView === 'chatter'}
          aria-controls={chatterPanelId}
          tabIndex={activeView === 'chatter' ? 0 : -1}
          onClick={() => activateView('chatter')}
          onKeyDown={(event) => onTabKeyDown(event, 'chatter')}
        >
          <span>Chatter</span>
          <small id={chatterTruthId}>Fictional · automated · zero online</small>
        </button>
        <button
          ref={activityTabRef}
          id={activityTabId}
          type="button"
          role="tab"
          aria-label="Activity"
          aria-describedby={activityTruthId}
          aria-selected={activeView === 'activity'}
          aria-controls={activityPanelId}
          tabIndex={activeView === 'activity' ? 0 : -1}
          onClick={() => activateView('activity')}
          onKeyDown={(event) => onTabKeyDown(event, 'activity')}
        >
          <span>Activity</span>
          <small id={activityTruthId}>Authoritative record</small>
        </button>
      </div>

      <section
        id={chatterPanelId}
        className="console-panel"
        role="tabpanel"
        aria-labelledby={chatterTabId}
        hidden={activeView !== 'chatter'}
      >
        <ChatterFeed active={activeView === 'chatter'} />
      </section>

      <section
        ref={activityPanelRef}
        id={activityPanelId}
        className="console-panel activity-console-panel"
        role="tabpanel"
        aria-labelledby={activityTabId}
        hidden={activeView !== 'activity'}
      >
        <div
          ref={feedRef}
          className="log-feed"
          role="region"
          tabIndex={0}
          aria-label="Activity Event Log"
          onScroll={(event) => {
            if (activeView !== 'activity') return;
            const feed = event.currentTarget;
            activityFollowingLatest.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 2;
            setShowActivityJump(!activityFollowingLatest.current);
          }}
        >
          {log.toReversed().map((entry) => (
            <div className="log-entry log-entry-animated" key={entry.id} data-activity-id={entry.id}>
              {getLogTag(entry.message)}
              <span>{entry.message}</span>
              {/* Native disclosure so it is keyboard-operable and screen-reader-announced without
                  any state of its own. Subordinate to the line above it, and closed by default:
                  the chronological record is the feed, and this is a footnote to one entry. */}
              {entry.reason !== undefined && (
                <details className="log-reason">
                  <summary>Why</summary>
                  <span>{entry.reason}</span>
                </details>
              )}
            </div>
          ))}
        </div>
        {showActivityJump ? <button type="button" className="btn btn-compact activity-jump" onClick={jumpToLatestActivity}>Jump to latest activity</button> : null}
      </section>
    </section>
  );
};
