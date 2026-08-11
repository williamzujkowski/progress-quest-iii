import { Milestone } from 'lucide-react';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { hasRoute, projectRoute } from '../state/worldContext';
import { ActLabel } from './GameNumber';

/**
 * Where the paperwork has sent the hero, oldest posting first.
 *
 * A route rather than a map. The engine has no coordinates, no adjacency, and no travel between
 * named places beyond `Road to X` — drawing a map would assert a world that does not exist, which
 * is the one thing every derived surface here is careful not to do. An ordered list of postings is
 * what the engine actually models, and reads as a service record rather than a fantasy atlas.
 *
 * Nothing is stored. `projectRoute` recomputes each act's town from the hero's identity and the act
 * number, through the same helpers the world console names the current location with, so the record
 * agrees with the console and needs no field on the sheet.
 *
 * The act ahead is named as pending rather than left out. A route that simply stopped would read as
 * the end of the game; an institution that has not yet decided where you are going reads as the
 * institution.
 */
export const Route: React.FC = () => {
  // Flat primitives, not a nested object.
  //
  // `useShallow` compares the selector's result one level deep. A selector returning
  // `{ hero: { ... }, act }` builds a fresh `hero` on every call, so the comparison fails every time
  // and the component re-renders for ever — React says "getSnapshot should be cached" and then
  // "Maximum update depth exceeded". Selecting the fields flat keeps every value a primitive, which
  // is what makes the shallow compare mean anything.
  const { name, race, className, level, act } = useGameStore(useShallow((state) => ({
    name: state.character.Traits.Name,
    race: state.character.Traits.Race,
    className: state.character.Traits.Class,
    level: state.character.Traits.Level,
    act: state.character.Plot.act,
  })));

  if (!hasRoute(act)) return null;
  const stops = projectRoute({ name, race, className, level }, act);

  return (
    <>
      <div className="section-label">
        <Milestone size={14} aria-hidden="true" /> Postings
      </div>
      <ol className="equip-list route-list" aria-label="Places this hero has been posted">
        {/* `aria-current` on the current stop, because weight and colour were the only signals.
            The rule beside the CSS asserted "the current posting is marked in text as well as
            weight, because a reader who cannot see the emphasis still needs to know where they
            are" — and the code did not do it, so the behaviour and the comment were both wrong. */}
        {stops.map((stop) => (
          <li
            className={`equip-item${stop.current ? ' route-current' : ''}`}
            key={stop.act}
            {...(stop.current ? { 'aria-current': 'true' as const } : {})}
          >
            <span className="equip-slot"><ActLabel act={stop.act} /></span>
            <span className="route-place">
              {stop.town ?? <span className="route-pending">pending assignment</span>}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
};
