import { describe, expect, it } from 'vitest';
import { REPEATED_MODIFIER_LINES } from '../../data/socialAmbient';
import { projectAmbient, projectSocialBatch } from '../../state/socialProjection';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { LoadoutFiling } from '../../engine/loadoutFiling';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * Two facts the engine has always computed and the channel has never mentioned.
 *
 * `repeatedModifier` reached exactly one surface — a line in the world console — and `spellRewards`
 * reached one dry world notice. Both are things the guild would obviously remark on, and the guild
 * is what people actually watch. This file holds each of them to the thing that made it worth
 * saying: the modifier lane must quote the modifier the filing actually found rather than a
 * placeholder, and a certified promotion must name the certificate.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;

const filing = (modifier: string | null): LoadoutFiling => ({
  itemOfRecord: { slot: 'Weapon', name: '+2 Bonded Skeleton Key', quality: 5, standing: 8, base: 'Skeleton Key' },
  reductionPercent: 1,
  contributors: [],
  repeatedModifier: modifier === null ? null : { name: modifier, slots: 4 },
});

const sweep = (tasks: number, loadout: LoadoutFiling) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task, loadout)).flat();

describe('the guild mentions a modifier worn in three places', () => {
  it('reaches the lane at all, which nothing else in this file would prove', () => {
    // The premise. Every assertion below is over a filtered subset, so a lane that never fired
    // would satisfy all of them vacuously.
    const spoken = sweep(400, filing('Misfiled')).filter(({ text }) => text.includes('misfiled'));
    expect(spoken.length).toBeGreaterThan(0);
  });

  it('quotes the modifier the filing found, and never the placeholder', () => {
    // The substitution is the whole feature: a lane that rendered `{modifier}` or fell through to
    // its default would be a lane saying nothing about this hero.
    for (const { text } of sweep(400, filing('Breached'))) {
      expect(text, text).not.toContain('{modifier}');
      expect(text, text).not.toContain('unmarked');
    }
    expect(sweep(400, filing('Breached')).some(({ text }) => text.includes('breached'))).toBe(true);
  });

  it('lower-cases it, because these are adjectives in the middle of a sentence', () => {
    // The filing holds `Bonded` the way an item name carries it. Mid-sentence that is a proper noun
    // this world does not have.
    const spoken = sweep(400, filing('Bonded')).filter(({ text }) => text.toLowerCase().includes('bonded'));
    expect(spoken.length).toBeGreaterThan(0);
    for (const { text } of spoken) expect(text, text).not.toContain('Bonded');
  });

  it('never opens a line on the substitution, which lower-casing would leave mid-sentence', () => {
    // Enforced against the bank rather than a rendering, so a line added later cannot slip past by
    // happening not to be drawn in the sweep above.
    for (const { text } of REPEATED_MODIFIER_LINES) expect(text, text).not.toMatch(/^\{modifier\}/);
  });

  it('stays silent when no modifier repeats, rather than inventing one', () => {
    // Most loadouts have no repeat. The lane falls back to ambient rather than falling silent —
    // a lane that produced nothing would quietly lower the rate the cadence was tuned to — so the
    // observable is that the channel keeps talking and says nothing about modifiers.
    const spoken = sweep(400, filing(null));
    expect(spoken.length).toBeGreaterThan(100);
    for (const { text } of spoken) {
      expect(text, text).not.toContain('unmarked');
      expect(text, text).not.toContain('{modifier}');
    }
  });

  it('states no figure, including the number of slots it counted', () => {
    // The filing knows there are four. The bank is asserted to quote no figures, and the count is
    // not the funny part — "more places than the form has boxes for" is.
    for (const { text } of REPEATED_MODIFIER_LINES) expect(text, text).not.toMatch(/\d|\b(?:three|four|five|several dozen)\b/);
  });
});

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 7 },
  act: 2,
  completedTask: 'kill',
  nextTask: 'kill',
  completedTasks: 42,
  elapsedSeconds: 3671,
  ...overrides,
});

const promotion = (completedTasks: number, post: Partial<GamePresentationSnapshot>) =>
  projectSocialBatch([{
    activityId: 100 + completedTasks,
    record: { event: { type: 'level_gained', level: 7 } as GameTransitionEvent, post: snapshot({ completedTasks, ...post }) },
  } as IdentifiedGameTransitionRecord]);

const CERTIFIED = { name: 'Summon a Stakeholder', level: 3, source: 'level' } as const;

describe('the guild names the certificate a promotion came with', () => {
  it('quotes the spell on every variant, so the reading does not depend on the draw', () => {
    // Three variants, selected by a hash of hero and task count. A certificate named in one of them
    // would be a certificate most promotions never mention.
    for (let task = 0; task < 30; task += 1) {
      const lines = promotion(task, { spellRewards: [CERTIFIED] });
      expect(lines.map(({ text }) => text).join(' '), `task ${task}`).toContain('Summon a Stakeholder');
    }
  });

  it('leaves an uncertified promotion exactly as it was', () => {
    // A spell is not awarded at every level — `generateSpellReward` can decline — so the ordinary
    // three variants must stay reachable and must not acquire an empty certification clause.
    for (let task = 0; task < 30; task += 1) {
      const text = promotion(task, {}).map(({ text: spoken }) => spoken).join(' ');
      expect(text, `task ${task}`).not.toMatch(/certifi|accredited|permitted to attempt/i);
    }
  });

  it('ignores a certification the promotion did not produce', () => {
    // `spellRewards` carries quest awards too, and a quest reward arriving in the same batch is not
    // something the promotion conferred. Claiming it would be the accuracy failure this codebase
    // keeps correcting.
    for (let task = 0; task < 30; task += 1) {
      const text = promotion(task, { spellRewards: [{ name: 'Cone of Boilerplate', level: 1, source: 'quest' }] })
        .map(({ text: spoken }) => spoken).join(' ');
      expect(text, `task ${task}`).not.toContain('Cone of Boilerplate');
    }
  });

  it('still answers the promotion, rather than replacing the room with an announcement', () => {
    // The scene is three lines and one of them is a `grats`. A certification variant that dropped
    // the answer would make the rarest scene in the game the quietest.
    const lines = promotion(7, { spellRewards: [CERTIFIED] });
    expect(lines).toHaveLength(3);
    expect(lines.at(-1)?.speaker.automaticHero).toBe(true);
  });
});
