import { Package, Weight } from 'lucide-react';
import React from 'react';
import { calculateEncumbranceMax } from '../engine/math';
import { calculateEncumbrance } from '../engine/sim';
import { storageAllowance } from '../engine/storage';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { GameNumber } from './GameNumber';
import { ItemTooltip } from './ItemTooltip';

export const InventoryView: React.FC = () => {
  // Inventory changed identity 0 times across a measured 400 ticks, Stats 3 times. Equip changes
  // only when the hero is handed something, which is rarer than either.
  const { Inventory, Stats, Equip } = useGameStore(useShallow((state) => ({
    Inventory: state.character.Inventory,
    Stats: state.character.Stats,
    Equip: state.character.Equip,
  })));
  const character = { Inventory, Stats, Equip };

  const nonGoldItems = character.Inventory.filter((item) => item.name !== 'Gold');
  // Carried weight belongs on the bag, the way EverQuest and WoW put it there. Gold is
  // reported once, on the hero banner, and carries no weight anyway.
  const encumbrance = calculateEncumbrance(character.Inventory);
  // Read through `storageAllowance` rather than from strength alone, because the engine decides the
  // market trip on the larger figure. A bar that filled at 20 while procurement waited until 30
  // would be the readout calling the engine a liar.
  const encumbranceMax = calculateEncumbranceMax(character.Stats.STR, storageAllowance(character.Equip));
  const atCapacity = encumbrance >= encumbranceMax;
  const encumbrancePct = encumbranceMax > 0
    ? Math.min(100, Math.floor((encumbrance / encumbranceMax) * 100))
    : 0;

  return (
    <section className="card inventory-card" aria-labelledby="inventory-heading">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} />
          <h2 id="inventory-heading">Inventory & Loot</h2>
        </div>
        {/* The rule, on the figure that obeys it.
            "cubits" is visible here, but what a cubit *is* was nowhere in the app — there is no
            glossary — and the consequence of filling the bar was behind a collapsed disclosure that
            never populated until the market trip started carrying its reason. Now that it does, the
            same sentence can sit on the figure it is about, so the number and the rule are in one
            place rather than two panels apart. */}
        <div
          className={`inventory-weight${atCapacity ? ' inventory-weight-full' : ''}`}
          title="Cubits — how much the pack holds. When it fills, procurement routes the hero to market."
        >
          <Weight size={16} aria-hidden="true" />
          {/* The noun, on screen rather than under it.
              This read `0 / 14` beside a weight icon, with "cubits" living only in an `sr-only`
              span and the progressbar's own label — and on touch there is no hover to reach either.
              Third instance of the same pattern after the filing rate and the two second-denominated
              bars, and the rule it keeps proving: a figure whose noun lives only in `title` or
              `sr-only` is unlabelled for most of the people looking at it.
              Legacy already had it visible — `$position/$max cubits`, per the comment below — so
              this is a restoration rather than an invention.
              The `sr-only` span keeps only the capacity clause. Repeating "cubits" there would have
              a screen reader say it twice, and the clause is doing real work: at capacity the bar
              turns red, which is otherwise colour-only signalling. */}
          <span>
            <GameNumber value={encumbrance} /> / <GameNumber value={encumbranceMax} />{' '}
            <span className="stat-unit">cubits</span>
            {/* Visible, not `sr-only`. At capacity the ratio turns red and the bar turns danger, and
                the comment below argued the `sr-only` clause existed *because* that is colour-only
                signalling — which is backwards: `sr-only` reaches only the readers who were never
                going to see the red. A sighted player with a colour-vision deficiency got nothing.
                Visible text fixes WCAG 1.4.1 and removes an sr-only-only string in one edit. */}
            {atCapacity && <span className="inventory-at-capacity">, at capacity</span>}
          </span>
        </div>
      </div>

      {/* Legacy renders this as a bar labelled "$position/$max cubits" (main.js:955); the
          numeric ratio stays in the header where the eye already looks for it. */}
      <div className={`progress-container progress-encumbrance${atCapacity ? ' progress-encumbrance-full' : ''}`}>
        <div
          className="progress-bar-track"
          role="progressbar"
          aria-label="Encumbrance, in cubits carried of capacity"
          // Clamped, because ARIA requires `valuenow <= valuemax` and the visible fill is clamped
          // already — so the two disagreed whenever a capacity drop left the hero over-loaded, which
          // ordinary play reaches: capacity comes from the Gambeson's base rating, and an upgrade
          // picks the noun nearest the level, so a swap can lower it below what is already carried.
          // `aria-valuetext` below stays honest and reports the real figures.
          aria-valuenow={Math.min(encumbrance, encumbranceMax)}
          aria-valuemin={0}
          aria-valuemax={encumbranceMax}
          aria-valuetext={`${encumbrance} of ${encumbranceMax} cubits`}
        >
          <div className="progress-bar-fill" style={{ width: `${encumbrancePct}%` }} />
        </div>
      </div>

      {/*
        A list, not a region. `ClosedCasework` already reasons this out: naming a collection a region
        trades the list role away, and the list role is what tells a reader how many things are here
        and where they are in them. Without it there is no count on entry, no "3 of 80" while
        arrowing, and no list-jump navigation.
      */}
      <ul className="equip-list inventory-list" tabIndex={0} aria-label="Inventory items">
        {nonGoldItems.length === 0 ? (
          <li className="equip-empty" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
            No loot has been retained. Combat supplies it automatically; procurement awaits a monster with transferable assets.
          </li>
        ) : (
          nonGoldItems.map((item, index) => (
            <li className="equip-item" key={index}>
              <ItemTooltip kind="inventory" name={item.name} quantity={item.qty} />
              <span style={{ fontWeight: 600 }}>x<GameNumber value={item.qty} /></span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
