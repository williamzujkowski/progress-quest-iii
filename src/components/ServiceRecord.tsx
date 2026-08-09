import { FileText } from 'lucide-react';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { projectServiceRecord } from '../state/serviceRecord';
import { loadRoster } from '../state/saveManager';

/**
 * The file, as a file.
 *
 * Everything in it is already on the page — the postings, the docket, the register, the
 * commendations. What this adds is that they are one document rather than four panels, in the
 * institution's own voice, ending in a refusal to conclude anything from them.
 *
 * Absent entirely until there is something to file, the same as every other record surface here.
 */
export const ServiceRecord: React.FC = () => {
  // Flat primitives for the hero, because `useShallow` compares one level deep and a selector
  // returning a fresh nested object re-renders for ever. The ledgers are selected whole because the
  // store keeps them referentially stable across ticks that change nothing.
  const { name, race, className, level, act } = useGameStore(useShallow((state) => ({
    name: state.character.Traits.Name,
    race: state.character.Traits.Race,
    className: state.character.Traits.Class,
    level: state.character.Traits.Level,
    act: state.character.Plot.act,
  })));
  const caseload = useGameStore((state) => state.caseload);
  const commendations = useGameStore((state) => state.commendations);
  const specimenCount = useGameStore((state) => state.specimens.specimens.length);

  // Read at render rather than held in the store: the roster changes only when the player saves or
  // switches characters, and a failed read is one missing line rather than a reason to show nothing.
  const roster = loadRoster();

  const record = projectServiceRecord({
    hero: { name, race, className, level },
    act,
    caseload,
    commendations,
    specimenCount,
    ...(roster.ok ? { roster: roster.value } : {}),
  });
  if (!record) return null;

  return (
    <>
      <div className="section-label">
        <FileText size={14} aria-hidden="true" /> Service Record
      </div>
      <article className="service-record" aria-label="Service record">
        <p className="service-record-subject">{record.subject}</p>
        {record.sections.map((section) => (
          <section className="service-record-section" key={section.heading}>
            <h4 className="service-record-heading">{section.heading}</h4>
            <ul className="service-record-lines">
              {section.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
        ))}
        <p className="service-record-closing">{record.closing}</p>
      </article>
    </>
  );
};
