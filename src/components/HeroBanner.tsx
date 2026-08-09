import { Coins, Heart, Sparkles } from 'lucide-react';
import React from 'react';
import { PRIME_STATS } from '../data/traits';
import { Gauge } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/gameStore';
import { useFilingVelocity } from '../state/useFilingVelocity';
import { useTrackProjection } from '../state/useTrackProjection';
import { useTabTitle } from '../state/useTabTitle';
import { formatDuration } from '../engine/text';
import { ActLabel, GameNumber } from './GameNumber';
import { ItemTooltip } from './ItemTooltip';


export const HeroBanner: React.FC = () => {
  // Traits and Stats changed identity 3 times across a measured 400 ticks, Inventory 0; the
  // character reference changed 400 times, because Task advances every tick and this banner
  // renders none of it.
  const { Traits, Stats, Gold, Inventory, act, experience } = useGameStore(useShallow((state) => ({
    Traits: state.character.Traits,
    Stats: state.character.Stats,
    Gold: state.character.Gold,
    Inventory: state.character.Inventory,
    act: state.character.Plot.act,
    experience: state.progression.experience,
  })));
  const character = { Traits, Stats, Gold, Inventory, Plot: { act } };
  // Derived, non-authoritative, and sampled on its own timer - see useFilingVelocity.
  const velocity = useFilingVelocity();
  // Projected from the observed rate rather than the experience track's own arithmetic, which
  // only advances on kill tasks and so runs about a quarter short. See useTrackProjection.
  const promotionSeconds = useTrackProjection('experience');
  // The act is the coarsest thing the engine advances and the unit a watcher thinks in.
  const actSeconds = useTrackProjection('plot');
  // The tab strip is this game's only surface while it is not the active tab.
  useTabTitle({ velocity });
  const progression = { experience };

  // Saturates at Number.MAX_VALUE for absurd levels, so guard the denominator.
  const experiencePct = progression.experience.maxSeconds > 0
    ? Math.min(100, Math.floor((progression.experience.currentSeconds / progression.experience.maxSeconds) * 100))
    : 0;

  return (
    <div className="hero-banner" role="region" aria-label="Hero Overview Banner">
      <div className="hero-identity">
        <div className="hero-name">
          <span>{character.Traits.Name}</span>
          <span className="badge" title="Character Level">Lvl{' '}<GameNumber value={character.Traits.Level} /></span>
        </div>
        {/* The bar is four pixels of accent under the hero's name, and until now the word
            "Experience" appeared in the rendered interface zero times — it lived in `aria-label` and
            `aria-valuetext`, which is to say for screen readers only. The nearest labelled thing to
            it was a heart icon reading HP Max, so a watcher reads a filling bar as health and then
            cannot explain why it empties on promotion.
            The one line that ever named it — "Next promotion expected in…" — is absent for the first
            minute and absent again after *every* level-up, because the projection discards any
            window straddling a reset. Missing, in other words, at exactly the moments the bar does
            something dramatic. So the label is unconditional and the figure travels with it. */}
        <div className="progress-label hero-experience-label">
          <span>Experience</span>
          <span>{experiencePct}%</span>
        </div>
        <div
          className="hero-experience"
          role="progressbar"
          aria-label="Experience toward next level"
          aria-valuenow={experiencePct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${experiencePct}% toward the next level`}
        >
          <div className="progress-bar-fill" style={{ width: `${experiencePct}%` }} />
        </div>
        {/*
          Absent until the sampled window can support a figure, rather than showing a placeholder.
          "Expected" and "pending review" are doing real work here: this is a projection from a
          five-minute average, and the copy should not promise a schedule the institution has no
          way to keep.
        */}
        {promotionSeconds !== null && (
          <div className="hero-eta">
            Next promotion expected in ~{formatDuration(promotionSeconds)}, pending administrative review.
          </div>
        )}
        {actSeconds !== null && (
          <div className="hero-eta">
            Current act expected to close in ~{formatDuration(actSeconds)}, barring a revision.
          </div>
        )}
        <div className="hero-sub">
          {character.Traits.Race} {character.Traits.Class} • <ActLabel act={character.Plot.act} />
        </div>
      </div>

      <div className="hero-meters">
        <div className="meter-group">
          <div className="meter-header">
            <span className="inline-icon meter-health">
              <Heart size={12} /> HP Max
            </span>
            <strong><GameNumber value={character.Stats['HP Max']} /></strong>
          </div>
        </div>

        <div className="meter-group">
          <div className="meter-header">
            <span className="inline-icon meter-magic">
              <Sparkles size={12} /> MP Max
            </span>
            <strong><GameNumber value={character.Stats['MP Max']} /></strong>
          </div>
        </div>

        {/* Gold reads once, here. Carried weight lives on the inventory panel, where the
            bag it describes is. The tooltip is what teaches that Gold weighs nothing. */}
        <div className="stat-pill gold-pill">
          <Coins size={16} aria-hidden="true" />
          <ItemTooltip kind="inventory" name="Gold" quantity={character.Gold}>
            <GameNumber value={character.Gold} />{' '}<span className="stat-unit">GP</span>
          </ItemTooltip>
        </div>

        {/* The rate, not the total. Absent until the window is long enough to mean something,
            because a wild first figure is worse than no figure on a dashboard made of numbers. */}
        {velocity !== null && (
          <div className="stat-pill velocity-pill" title="Completed tasks per hour, averaged over the last few minutes">
            <Gauge size={16} aria-hidden="true" />
            <span>
              {/* The noun, on the surface rather than in the tooltip. `1240 /hr` sits beside
                  `0 GP` and a watcher reads it as gold per hour — and on touch there is no hover to
                  correct them. `filed` is the internal name for what it counts and is already the
                  right word. */}
              <GameNumber value={velocity} />{' '}<span className="stat-unit">filed/hr</span>
              <span className="sr-only"> tasks filed per hour</span>
            </span>
          </div>
        )}
      </div>

      <div className="hero-prime-stats" data-testid="hero-prime-stats" aria-label="Prime stats">
        {PRIME_STATS.map((stat) => (
          <div className="hero-stat" key={stat}>
            <span>{stat}</span>
            <strong><GameNumber value={character.Stats[stat]} /></strong>
          </div>
        ))}
      </div>

    </div>
  );
};
