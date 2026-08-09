import {
  Bandage, Footprints, Grab, Hand, HardHat, PersonStanding, Ruler, Shield, Shirt, Sparkles, Sword, Watch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EQUIP_SLOTS } from '../data/traits';
import type { EquipSlot } from '../engine/types';

/**
 * A glyph per slot, because the words did not fit.
 *
 * This column is ~145px at the desktop breakpoint, and the slot name was taking 34-43px of it —
 * enough that every one of the eleven labels clipped, "Helm" included, while the item name got the
 * remainder and clipped too. The names are the joke, so the label is what gives way.
 *
 * The glyphs are distinguishable rather than illustrative, and only some are literal: a hard hat
 * for the helm and a wristwatch for the vambraces suit the register better than heraldry would,
 * and no icon set has a brassairt. They identify a row; the slot name still reaches assistive
 * technology through the adjacent sr-only text, and sighted readers get it from the title.
 */
const SLOT_ICONS: Record<EquipSlot, LucideIcon> = {
  Weapon: Sword,
  Shield,
  Helm: HardHat,
  Hauberk: Shirt,
  Brassairts: Grab,
  Vambraces: Watch,
  Gauntlets: Hand,
  Gambeson: Bandage,
  Cuisses: PersonStanding,
  Greaves: Ruler,
  Sollerets: Footprints,
};
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { GameNumber } from './GameNumber';
import { ItemTooltip } from './ItemTooltip';
import { Commendations } from './Commendations';
import { Caseload } from './Caseload';
import { hasRoute } from '../state/worldContext';
import { Route } from './Route';
import { ServiceRecord } from './ServiceRecord';
import { isEmpty as caseloadIsEmpty } from '../state/caseload';
import { isEmpty as commendationsIsEmpty } from '../state/commendations';

export const CharacterSheetView: React.FC = () => {
  // Equip and Spells changed identity 3 times across a measured 400 ticks; the character
  // reference changed 400 times, because Task advances every tick.
  const { Equip, Spells } = useGameStore(useShallow((state) => ({
    Equip: state.character.Equip,
    Spells: state.character.Spells,
  })));
  const character = { Equip, Spells };
  // The disclosure follows the same rule its contents do: absent until there is something to
  // file. An empty "Records" heading is a promise of nothing, and takes up the vertical room the
  // one-screen desktop layout is measured against.
  const hasRecords = useGameStore(
    (state) => !commendationsIsEmpty(state.commendations)
      || !caseloadIsEmpty(state.caseload)
      || hasRoute(state.character.Plot.act),
  );

  /*
   * The card takes a tab stop exactly while it scrolls, and not otherwise.
   *
   * It carried none on measured grounds: at `overflow: visible` with nothing to scroll, the stop
   * announced a name and did nothing. That inverted when the records fix gave the card
   * `overflow-y: auto` while this disclosure is open — a scroll container with no tab stop cannot be
   * scrolled by keyboard at all, and every other scrolling panel here carries one for that reason.
   *
   * Conditioned on whether it *actually scrolls*, not on the disclosure being open. Those are the
   * same thing only on the one-screen layout: the clipping lives in a
   * `(min-width: 1025px) and (min-height: 760px)` media query, so on a narrow viewport the card is
   * `overflow: visible`, the page scrolls instead, and a stop there is the original defect again —
   * measured at 390x844, where the card was 3637px tall, scrolled nothing, and took a tab stop
   * anyway.
   *
   * Measured rather than matched against a copy of that media query. The question is "does this
   * element scroll", the CSS is free to change its mind about when, and a duplicated query string is
   * a second place to be wrong.
   */
  const cardRef = useRef<HTMLElement | null>(null);
  const [scrolls, setScrolls] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);

  const measure = useCallback(() => {
    const element = cardRef.current;
    setScrolls(element !== null && element.scrollHeight > element.clientHeight + 4);
  }, []);

  // Layout effect so the stop is present on the paint that first shows the scrollbar, rather than a
  // frame later.
  useLayoutEffect(measure, [measure, recordsOpen]);

  useEffect(() => {
    // A viewport that crosses the breakpoint while the disclosure is open changes the answer.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <section
      className="card character-card"
      aria-labelledby="loadout-heading"
      ref={cardRef}
      {...(scrolls ? { tabIndex: 0 } : {})}
    >
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={18} />
          <h2 id="loadout-heading">Character Loadout</h2>
        </div>
      </div>

      <div className="section-label">
        <Shield size={14} /> Equipment Slots
      </div>
      {/*
        A list rather than a region, so a reader is told there are eleven slots and where they are
        among them. No tabIndex: the sibling panels carry one because they scroll, and this one
        cannot — it is `max-height: none` and a two-column grid above 1025px, measured at
        `overflowY: visible`. A focus stop that announces a name and does nothing is a stop worth
        removing.
      */}
      <ul className="equip-list equipment-list" aria-label="Equipment List">
        {EQUIP_SLOTS.map((slot: EquipSlot) => (
          <li className="equip-item" key={slot}>
            <span className="equip-slot-icon" title={slot}>
              {React.createElement(SLOT_ICONS[slot], { size: 13, 'aria-hidden': true })}
              <span className="sr-only">{slot}</span>
            </span>
            {/*
              The dash is the visible placeholder and stays here, where it was chosen. The name
              passed through is the real one, so the trigger can say which slot it belongs to —
              nine of eleven of these are empty on a new character, and every one of them used to
              announce as "dash, button" with nothing to tell them apart.
            */}
            <ItemTooltip kind="equipment" name={character.Equip[slot]} slot={slot}>
              {character.Equip[slot] || '—'}
            </ItemTooltip>
          </li>
        ))}
      </ul>

      <div className="section-label">
        <Sparkles size={14} /> Spell Book ({character.Spells.length})
      </div>
      <ul className="equip-list spell-list" tabIndex={0} aria-label="Spell Book">
        {character.Spells.length === 0 ? (
          <li className="empty-state">
            No spells have been learned. They arrive automatically at level-up and may also be awarded for completed quests; the curriculum remains aggressively theoretical.
          </li>
        ) : (
          character.Spells.map((spell) => (
            <li className="equip-item" key={spell.name}>
              <ItemTooltip kind="spell" name={spell.name} level={spell.level} />
              <span className="badge">Lvl{' '}<GameNumber value={spell.level} /></span>
            </li>
          ))
        )}
      </ul>

      {/*
        Records fold away by default. They change on a level, a sale, or a closed quest — not on
        the tick — while everything above them moves constantly, and on a phone they were three
        stacked sections standing between the loadout and the rest of the page.

        A native disclosure rather than tabs, a drawer, or a separate screen. It is keyboard
        operable and announced without a line of ARIA, it cannot strand anyone away from the live
        numbers the way a route could, and each future record type becomes one more block in here
        rather than one more panel to place.
      */}
      {hasRecords && (
        <details className="records-details" onToggle={(event) => setRecordsOpen(event.currentTarget.open)}>
          <summary>Departmental records</summary>
          {/*
            Grouped so the stylesheet has one thing to name, and so the records read as a
            continuous document rather than as four independently scrolling windows. What actually
            makes them reachable is the card scrolling while this disclosure is open — see the
            one-screen media query, which records the two narrower fixes that failed first.
          */}
          <div className="records-scroll">
            {/*
              Whose these are, said once at the top.

              The ledgers are global on purpose — `startSession` carries the commendations, the
              caseload and the specimen log through a new character, because a hero starting over
              must not erase the record. Every module that reads them says so, and each takes the
              same precaution: never address the reader. That makes the prose honest and leaves the
              placement lying, because the whole thing renders inside a card headed Character
              Loadout, under this hero's equipment, with their own postings interleaved.

              So a brand-new level-one character opened this and read "Highest level attained: 14".
              The only line that ever said whose — the precedent — needs a roster entry, which needs
              an explicit save, which a watcher may never make.

              One sentence fixes it without a roster and without breaking the voice: the institution
              may be precise, it just may not be helpful.
            */}
            <p className="records-provenance">
              Retained by the department across every appointment, including those preceding this
              one. Nothing here is a statement about the current holder.
            </p>
            <Commendations />
            <Caseload />
            <Route />
            {/* Last, because it is the composition of everything above it: a reader who has just
                been through the panels arrives at the same figures assembled into a document that
                declines to conclude anything from them. */}
            <ServiceRecord />
          </div>
        </details>
      )}
    </section>
  );
};
