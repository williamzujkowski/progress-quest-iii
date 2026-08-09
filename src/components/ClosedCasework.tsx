import { Archive } from 'lucide-react';
import React from 'react';
import { useGameStore } from '../state/gameStore';

/**
 * The quests already closed, in the order an archive would hand them back: most recent first.
 *
 * The engine has kept this list all along — it is persisted with the character and trimmed to a
 * hundred entries at the point a new quest is filed — and until now nothing displayed it. This
 * only reads it. No entry is summarised, ranked, or interpreted; the descriptions are the ones
 * the engine wrote, verbatim, because the joke is that the record is kept scrupulously and means
 * nothing.
 *
 * Absent entirely until the first quest closes, on the same reasoning as the commendation ledger:
 * an empty archive reads as a broken panel rather than a new one.
 *
 * ## Why this is "matters on file" rather than "closed casework"
 *
 * `Quest.history` is not a list of closures. `advanceGame` pushes the *newly generated* quest as it
 * assigns it — `history.push(generatedQuest.description)` — so the live assignment is always the
 * last entry, and this panel showed it, first, under a heading calling it closed. The string sat
 * about forty pixels below the same string in the live quest bar.
 *
 * The entry is not dropped, because an institution that files the open matter alongside the closed
 * ones is exactly right. It is named instead. That also settles a discrepancy on the same screen:
 * `questsCompleted` counts `quest_completed` events and the first assignment never emits one, so a
 * count of closures could never agree with the length of this list — and now does not claim to.
 */
export const ClosedCasework: React.FC = () => {
  // Selected on its own rather than through the character, so this re-renders when the archive
  // changes and not when the hero takes a step. The array is replaced only when a quest closes.
  const history = useGameStore((state) => state.character.Quest.history);
  if (!history || history.length === 0) return null;

  return (
    <>
      <div className="section-label">
        <Archive size={14} aria-hidden="true" /> Matters On File
      </div>
      {/*
        Stored oldest-first and shown newest-first, which is the order an archive is actually read.
        Deliberately unnumbered: the engine trims the front of this list once it passes a hundred,
        so any ordinal would quietly stop meaning "the Nth quest" and start meaning "the Nth
        surviving record" — a distinction no reader would make and this panel cannot defend. The
        sequence carries the recency on its own.

        Bounded by that same engine-side trim, so there is nothing to slice here.
      */}
      {/*
        Focusable because it scrolls. A scrollable box with nothing tabbable inside cannot be
        reached by keyboard at all in some browsers.

        tabIndex alone, without the role="region" the sibling panels carry. Those are divs with no
        implicit role to lose; this is an ordered list, and naming it a region would trade the
        announcement that actually helps here — "list, N items" — for one that says less.
      */}
      <ol className="casework-list" tabIndex={0} aria-label="Matters on file, most recent first">
        {history.toReversed().map((description, index) => (
          <li className="casework-entry" key={`${history.length - index}-${description}`}>
            {description}
            {/* The head of the list is the assignment currently in hand. Marked rather than hidden:
                the file holds it either way, and saying which one is open is the whole repair. */}
            {index === 0 && <span className="casework-open">open</span>}
          </li>
        ))}
      </ol>
    </>
  );
};
