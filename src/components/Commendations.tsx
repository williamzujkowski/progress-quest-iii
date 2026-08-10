import { Award } from 'lucide-react';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { isEmpty } from '../state/commendations';
import { citationsFor } from '../state/citations';
import { GameNumber } from './GameNumber';
import { ItemTooltip } from './ItemTooltip';

/**
 * The institution's filing cabinet about itself: maxima and counts over events that already
 * happened. Every figure is a fact the engine reported — nothing here is a reward, an unlock,
 * or a claim about a mechanic that does not exist.
 *
 * Absent entirely until there is something to file, because a row of zeroes reads as a broken
 * panel rather than a young one.
 */
export const Commendations: React.FC = () => {
  const records = useGameStore(useShallow((state) => state.commendations));
  // Variety rather than quality: the exhibit case opposite keeps the best of each slot, and this
  // counts how many different things have ever passed through at all.
  const specimens = useGameStore((state) => state.specimens.specimens.length);
  // Selected whole rather than through `useShallow`, because these are the objects the citations
  // read and the store already keeps them referentially stable across ticks that change nothing.
  const specimenLog = useGameStore((state) => state.specimens);
  const caseload = useGameStore((state) => state.caseload);
  if (isEmpty(records) && specimens === 0) return null;

  const citations = citationsFor({ commendations: records, caseload, specimens: specimenLog });

  const rows: ReadonlyArray<readonly [string, number]> = [
    ...(specimens > 0 ? [['Distinct specimens filed', specimens] as const] : []),
    ['Highest level attained', records.highestLevel],
    ['Largest single sale, in gold', records.largestSale],
    ['Quests closed', records.questsCompleted],
    ['Acts concluded', records.actsCompleted],
  ];

  // partialRecord means every value is optional to the type system; filter rather than assert.
  const exhibit = Object.entries(records.exhibit).flatMap(([slot, entry]) => (entry ? [[slot, entry] as const] : []));

  return (
    <>
      <div className="section-label">
        <Award size={14} aria-hidden="true" /> Commendations
      </div>
      <ul className="equip-list commendation-list" aria-label="Commendation ledger">
        {rows.map(([label, value]) => (
          <li className="equip-item" key={label}>
            <span className="equip-slot">{label}</span>
            <span className="commendation-value"><GameNumber value={value} /></span>
          </li>
        ))}
      </ul>

      {citations.length > 0 && (
        <>
          <div className="section-label">
            <Award size={14} aria-hidden="true" /> Citations
          </div>
          {/* Only what holds. There is no unearned row, no denominator and no ordering that hints at
              a next one — a citation the player can see but not have is a target, and a target in a
              game with no lever on it is a spreadsheet they are forbidden to fill in. */}
          <ul className="citation-list" aria-label="Citations">
            {citations.map(({ id, title, note }) => (
              <li className="citation-item" key={id}>
                <span className="citation-title">{title}</span>
                <span className="citation-note">{note}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {exhibit.length > 0 && (
        <>
          <div className="section-label">
            <Award size={14} aria-hidden="true" /> Exhibit Case
          </div>
          {/* Prestige, not power: worldContext's own classification, which records explicitly
              that equipment has no combat contribution. */}
          <ul className="equip-list commendation-list" aria-label="Exhibit case">
            {exhibit.map(([slot, entry]) => (
              <li className="equip-item" key={slot}>
                <span className="equip-slot">{slot}</span>
                <ItemTooltip kind="equipment" name={entry.name} slot={slot as never} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
};
