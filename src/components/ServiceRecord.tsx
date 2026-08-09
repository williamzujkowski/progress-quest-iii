import { FileText } from 'lucide-react';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { projectServiceRecord } from '../state/serviceRecord';

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

  // Off the store, not out of storage. `loadRoster` reads up to 500 KB, parses it and validates
  // every entry, and this component re-renders whenever any of the four ledgers above moves — which
  // early in a run is most of the time a new specimen is filed. The store reads it at a session
  // boundary, which is when the set of characters on file can actually change.
  const roster = useGameStore((state) => state.roster);

  const record = projectServiceRecord({
    hero: { name, race, className, level },
    act,
    caseload,
    commendations,
    specimenCount,
    roster,
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
