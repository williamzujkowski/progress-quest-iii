import { Scale } from 'lucide-react';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { KIND_LABELS, QUEST_KINDS, describeSpan, displayTarget, isEmpty, mostLitigated } from '../state/caseload';
import { GameNumber } from './GameNumber';

/**
 * What the casework has consisted of. Every figure is a count of quests the engine classified
 * itself — nothing here is a reward, an unlock, or a claim about a mechanic that does not exist.
 *
 * Absent entirely until something has been filed, because five zeroes read as a broken panel
 * rather than a young one.
 */
export const Caseload: React.FC = () => {
  const caseload = useGameStore(useShallow((state) => state.caseload));
  if (isEmpty(caseload)) return null;

  // Every kind, in the engine's own order, but only those actually seen. A kind with no cases is
  // not a zero worth reporting; it is a category this hero has not been assigned.
  const filed = QUEST_KINDS.flatMap((kind) => {
    const count = caseload.kinds[kind];
    return count ? [[KIND_LABELS[kind], count] as const] : [];
  });
  const frequent = mostLitigated(caseload);
  // `hasOwn` rather than a bare read — the third place this map is indexed and the second to be
  // written without the guard. A target name is engine-generated in ordinary play, but the schema
  // admits any string and an imported ledger chooses these keys; for one inherited from
  // `Object.prototype` a bare read returns a *function*, so `describeSpan`'s null check passes and
  // this panel renders "The file opens in Act undefined and last records this in Act undefined."
  // Reproduced, not theorised.
  //
  // The two maps also disagree legitimately: every ledger written before the register has counts and
  // no spans, so a missing entry is the ordinary case rather than the corrupt one.
  const span = frequent && Object.hasOwn(caseload.targetActs, frequent.target)
    ? describeSpan(caseload.targetActs[frequent.target])
    : null;

  return (
    <>
      <div className="section-label">
        <Scale size={14} aria-hidden="true" /> Docket Summary
      </div>
      <ul className="equip-list commendation-list" aria-label="Docket summary">
        {filed.map(([label, count]) => (
          <li className="equip-item" key={label}>
            <span className="equip-slot">{label}</span>
            <span className="commendation-value"><GameNumber value={count} /></span>
          </li>
        ))}
        {frequent && (
          <li className="equip-item" key="most-litigated">
            <span className="equip-slot">Most frequently filed against</span>
            <span className="commendation-value">
              {displayTarget(frequent.target)} (<GameNumber value={frequent.count} />)
            </span>
          </li>
        )}
      </ul>
      {/* Outside the list, because it is a sentence rather than a row: the register dates what the
          row counts, and setting it as a value would make an act ordinal look like a second tally. */}
      {span && <p className="docket-register">{span}</p>}
    </>
  );
};
