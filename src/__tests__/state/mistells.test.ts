import { describe, expect, it } from 'vitest';
import { MISTELLS } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';

/**
 * A line that went to the wrong channel, and the correction that follows it.
 *
 * The joke only became tellable when the panel started showing the channel: one blended stream with
 * a coloured prefix per line is how the genre has always rendered chat, and it is also what makes a
 * mistell legible — the reader sees the wrong prefix before anybody says a word about it.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' };

const scenes = (tasks: number) => Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task))
  .filter((spoken) => spoken[0]?.sceneId.includes(':mistell'));

describe('a line that went to the wrong window', () => {
  it('reaches the channel', () => {
    expect(scenes(3000).length).toBeGreaterThan(0);
  });

  it('arrives whole, slip and correction together', () => {
    // Half a mistell is just a remark. The correction is the joke, so the scheduler has to gate the
    // pair as a unit — which it does, because they share one scene id.
    for (const spoken of scenes(3000)) {
      expect(spoken.length).toBe(2);
      expect(new Set(spoken.map(({ sceneId }) => sceneId)).size).toBe(1);
    }
  });

  it('corrects onto a different channel from the one it landed in', () => {
    // The whole gag is carried by the layout: two prefixes that disagree, one above the other. A
    // correction on the same channel is a person repeating themselves.
    for (const [slip, correction] of MISTELLS) {
      expect(correction!.channel, slip!.text).not.toBe(slip!.channel);
    }
    for (const spoken of scenes(3000)) {
      expect(spoken[1]!.channel).not.toBe(spoken[0]!.channel);
    }
  });

  it('keeps the slip and the correction on the same shoulders', () => {
    // Somebody else correcting your mistell is a different scene — a telling-off. The person who
    // sent it to the wrong window is the person who files the correction.
    for (const [slip, correction] of MISTELLS) {
      expect(correction!.seat, slip!.text).toBe(slip!.seat);
    }
  });

  it('never has anybody apologise for themselves', () => {
    // An institution that mistells and files a correction is funnier than a person who is
    // embarrassed, and it keeps the cast from acquiring feelings the game does not model. "Sorry"
    // survives in the one line where it is the content of the mistell rather than a reaction to it.
    for (const [, correction] of MISTELLS) {
      expect(correction!.text, correction!.text).not.toMatch(/sorry|apolog|my mistake|oops/i);
    }
  });

  it('stays inside the channels ambient chatter is allowed to use', () => {
    // `raid` and `whisper` would have been the sharper jokes and are deliberately outside
    // `AmbientChannel`: raid chatter outside a raid, and a private whisper arriving in the ambient
    // stream, are both claims about the world that are not true.
    for (const exchange of MISTELLS) {
      for (const line of exchange) expect(['guild', 'world', 'party']).toContain(line.channel);
    }
  });
});
