import { describe, expect, it } from 'vitest';
import { PREDECESSOR_MISTELLS } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';

/**
 * The rarest thing the channel does, and the only one that needs a second character to exist.
 *
 * The mistell mechanism already shipped, and this borrows exactly the right shape for exactly the
 * wrong mistake: a shipped mistell went to the wrong *channel* and is retracted a beat later, while
 * this went to the wrong *person* — somebody who has not been on file for three characters — and the
 * retraction fixes the channel, or the location, or the timing.
 *
 * Nobody corrects the name. That is the joke, and it is why these have to stay two-beat units: a
 * line naming a predecessor is a mistake, and a mistake followed by a scrupulous correction of
 * something else is an institution.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;
const HELD = { name: 'Vashenko', phrase: 'This file continues one opened for Vashenko.' } as const;

const scenesOf = (memory: Parameters<typeof projectAmbient>[2], tasks = 3000) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task, memory));

const mistells = (memory: Parameters<typeof projectAmbient>[2]) =>
  scenesOf(memory).filter((scene) => scene[0]?.sceneId.includes(':predecessor'));

describe('the guild keeps writing to whoever held the file before', () => {
  it('reaches the lane once a predecessor exists', () => {
    expect(mistells({ predecessor: HELD }).length).toBeGreaterThan(0);
  });

  it('names them, and never renders the placeholder or the fallback', () => {
    const spoken = mistells({ predecessor: HELD }).flat();
    expect(spoken.some(({ text }) => text.includes('Vashenko'))).toBe(true);
    for (const { text } of spoken) {
      expect(text, text).not.toContain('{predecessor}');
      expect(text, text).not.toContain('the previous holder');
    }
  });

  it('arrives as a pair, because half of it is a different and worse joke', () => {
    // A first beat alone is somebody making a mistake. The correction is what makes it an
    // institution, and the scheduler gates whole scenes, so the unit must survive selection intact.
    for (const scene of mistells({ predecessor: HELD })) expect(scene).toHaveLength(2);
  });

  it('corrects everything except the name', () => {
    // The load-bearing assertion. A second beat that said "apologies, wrong person" would be a
    // correction rather than a joke — the room has to fail to notice, scrupulously.
    for (const unit of PREDECESSOR_MISTELLS) {
      expect(unit).toHaveLength(2);
      expect(unit[0]!.text).toContain('{predecessor}');
      expect(unit[1]!.text, unit[1]!.text).not.toContain('{predecessor}');
    }
  });

  it('speaks about them rather than to them, so no line can be read as addressing the watcher', () => {
    // Third person throughout. This channel is a room the hero is not in, and a second person here
    // would be the one place that stopped being true.
    for (const { text } of PREDECESSOR_MISTELLS.flat()) {
      expect(text, text).not.toMatch(/\byou\b|\byour\b|\byours\b/i);
    }
  });

  it('stays away on a fresh save, which is every save until somebody makes a second character', () => {
    // `predecessorFor` returns null for a one-character roster, and the lane falls back with it
    // rather than falling silent — a lane producing nothing would quietly lower the chatter rate.
    for (const memory of [{}, { predecessor: null }]) {
      const scenes = scenesOf(memory);
      expect(scenes.filter((scene) => scene.length > 0).length, JSON.stringify(memory)).toBeGreaterThan(2000);
      for (const scene of scenes) {
        expect(scene[0]?.sceneId, scene[0]?.text).not.toContain(':predecessor');
        expect(scene[0]?.text, scene[0]?.text).not.toContain('the previous holder');
      }
    }
  });

  it('quotes the name alone, not the file\'s careful sentence', () => {
    // `predecessorFor` also returns a finished phrase, and the service record renders it — but that
    // sentence says "last recorded at level 9", which is the file being careful. Nothing in this
    // room is being careful.
    for (const { text } of mistells({ predecessor: HELD }).flat()) {
      expect(text, text).not.toContain('This file continues');
      expect(text, text).not.toMatch(/last recorded at level/);
    }
  });
});
