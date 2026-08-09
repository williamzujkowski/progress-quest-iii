import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore } from '../state/gameStore';
import type { SocialChannel } from '../state/socialProjection';

/**
 * One stream, with the channel carried by a prefix rather than by a control.
 *
 * There used to be a channel dropdown and a mute button. Both were the wrong shape for what this
 * panel is: a chat window in this genre is a *blend*, and the reader tells the channels apart by the
 * prefix and its colour — guild green, party blue, raid orange, a whisper in magenta — exactly as
 * EverQuest and WoW have always done it. A filter that shows one channel at a time turns a room back
 * into a log, which is the thing this whole area was rebuilt to stop being.
 *
 * The colours come from the terminal palette the themes already define, so every theme gets its own
 * version of the convention rather than a hard-coded one, and no new token is introduced.
 */
const CHANNEL_LABEL: Readonly<Record<SocialChannel, string>> = {
  guild: 'Guild',
  world: 'World',
  party: 'Party',
  raid: 'Raid',
  whisper: 'Whisper',
  system: 'System',
  hero: 'Say',
};

export const ChatterFeed: React.FC<{ readonly active?: boolean }> = ({ active = true }) => {
  const entries = useGameStore((state) => state.socialEntries);
  /*
   * Whether this file has a past, which decides what an empty channel means.
   *
   * `socialEntries` is reset to `[]` on every load path while `log` is restored from the checkpoint,
   * so a returning player's first sight is an empty default tab beside a full one. The old copy said
   * "yet" to somebody whose save reads *0:10:12 adventure elapsed*, which is the wrong word and the
   * wrong promise — nothing is coming that was said before.
   *
   * The panel stays empty either way. This only stops it being empty and wrong.
   */
  const hasHistory = useGameStore((state) => state.progression.completedTasks > 0);
  const [showJump, setShowJump] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const messagesId = useId();
  const disclosureId = useId();
  const visibleEntries = entries.toReversed();
  const latestVisibleId = visibleEntries.at(-1)?.id;

  const jumpToLatest = () => {
    const messages = messagesRef.current;
    if (messages) {
      messages.scrollTop = messages.scrollHeight;
      messages.focus();
    }
    followingLatest.current = true;
    setShowJump(false);
  };

  useLayoutEffect(() => {
    if (!latestVisibleId) {
      followingLatest.current = true;
      setShowJump(false);
      return;
    }
    if (!active) return;
    if (followingLatest.current) {
      if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      setShowJump(false);
    }
    else if (latestVisibleId) setShowJump(true);
  }, [active, latestVisibleId]);

  return (
    <section className="chatter-panel" role="region" aria-label="Simulated chatter">
      <div className="chatter-header">
        <div className="chatter-heading-copy">
          <h3>Simulated chatter</h3>
          <p id={disclosureId}>No people are online. Every message is fictional, generated locally, and sent nowhere.</p>
        </div>
      </div>

      <div
        id={messagesId}
        ref={messagesRef}
        className="chatter-messages"
        role="region"
        tabIndex={0}
        aria-label="Fictional chatter messages"
        aria-describedby={disclosureId}
        aria-live="off"
        onScroll={(event) => {
          if (!active) return;
          const messages = event.currentTarget;
          followingLatest.current = messages.scrollHeight - messages.scrollTop - messages.clientHeight <= 2;
          setShowJump(!followingLatest.current);
        }}
      >
        {visibleEntries.length > 0
          ? <ol className="chatter-list">
              {visibleEntries.map((entry) => (
                <li key={entry.id} data-social-id={entry.id}>
                  {/* The channel is named in text as well as coloured, because colour alone is not a
                      distinction a reader who cannot see it can make. */}
                  <div className="chatter-meta">
                    <span className="chatter-channel" data-channel={entry.channel}>[{CHANNEL_LABEL[entry.channel]}]</span>
                    <bdi data-speaker-name dir="auto">{entry.speaker.displayName}</bdi>
                    <span>{entry.speaker.role}</span>
                  </div>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ol>
          : (
            <p className="chatter-empty">
              {hasHistory
                // "Minuted" is the catch-up row's word for the same distinction — the channel
                // continues whether or not anybody writes it down, and this one is not written down.
                ? 'The channel is not minuted between sessions. Anything said before now is not on file.'
                : 'No fictional messages yet. Even the silence is simulated.'}
            </p>
          )}
      </div>
      {showJump ? <button type="button" className="btn btn-compact chatter-jump" onClick={jumpToLatest}>Jump to latest chatter</button> : null}
    </section>
  );
};
