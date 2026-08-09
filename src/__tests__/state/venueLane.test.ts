import { describe, expect, it } from 'vitest';
import { VENUE_LINES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';
import { venueBulletin } from '../../state/venueBulletin';

/**
 * The one lane whose availability changes during a session rather than across one.
 *
 * `venueBulletin` gives every settlement, field and dungeon a handful of departments — *Committee
 * for the Naming of Streets, deadlocked* — and it reached one panel in the world console. The
 * channel meanwhile sounded identical whether the hero was in a town, a swamp or a vault, which is
 * the one part of this world that read as scenery rather than as bureaucracy.
 *
 * The effect wanted is a guild channel that quietly acquires local business while the hero shops and
 * loses it again on the road, **without once mentioning that the hero is there**. A road is passed
 * through rather than administered and a cinematic is not a place at all — both decisions belong to
 * `venueBulletin` and are not repeated here.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;

const TOWN = { venue: 'town' as const, location: 'Ashfield', act: 3 };
const ROAD = { venue: 'road' as const, location: 'The Long Way', act: 3 };

const linesOf = (memory: Parameters<typeof projectAmbient>[2], tasks = 3000) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(HERO, task, memory)[0]);

const venueLines = (memory: Parameters<typeof projectAmbient>[2]) =>
  linesOf(memory).filter((entry) => entry?.sceneId.includes(':venue'));

describe('the channel picks up local business while the hero is somewhere', () => {
  it('reaches the lane in a place that keeps a catalogue', () => {
    expect(venueLines({ venue: TOWN }).length).toBeGreaterThan(0);
  });

  it('quotes an office the bulletin is actually showing, status and all', () => {
    // The status after the comma is the joke, so the entry is quoted whole. Checked against the
    // bulletin rather than against the bank, so a lane quoting some other town's office fails.
    const showing = venueBulletin(TOWN)!;
    expect(showing.length).toBeGreaterThan(0);

    for (const entry of venueLines({ venue: TOWN })) {
      expect(showing.some((office) => entry!.text.includes(office)), entry!.text).toBe(true);
      expect(entry!.text, entry!.text).not.toMatch(/\{office\}|\{venue\}/);
      expect(entry!.text, entry!.text).not.toContain('the office');
    }
  });

  it('changes what it talks about when the hero changes room', () => {
    // The whole point of reading the venue rather than a fixed bank. Two towns with different
    // catalogue windows must not produce the same offices, or the lane is decoration.
    const elsewhere = { venue: 'dungeon' as const, location: 'The Vault', act: 6 };
    const here = new Set(venueLines({ venue: TOWN }).map((entry) => entry!.text));
    const there = new Set(venueLines({ venue: elsewhere }).map((entry) => entry!.text));

    expect(here.size).toBeGreaterThan(0);
    expect(there.size).toBeGreaterThan(0);
    for (const text of there) expect(here.has(text), text).toBe(false);
  });

  it('never says the hero is there, or anything about the hero at all', () => {
    // The channel follows the hero and does not address them. A lane that acquired local colour by
    // narrating where the player's character is standing would be the one place that stopped being
    // true of this feed.
    for (const { text } of VENUE_LINES) {
      expect(text, text).not.toMatch(/\bhero\b|\byou\b|\byour\b/i);
    }
  });

  it('falls back on a road, in a cinematic, and when nowhere is known', () => {
    // `venueBulletin` returns null for both, and the lane follows rather than deciding again.
    expect(venueBulletin(ROAD)).toBeNull();

    for (const memory of [{}, { venue: ROAD }, { venue: { venue: 'cinematic' as const, location: 'Act 3 Intermission', act: 3 } }]) {
      const entries = linesOf(memory);
      expect(entries.filter(Boolean).length, JSON.stringify(memory)).toBeGreaterThan(2000);
      for (const entry of entries) {
        expect(entry?.sceneId, entry?.text).not.toContain(':venue');
        expect(entry?.text, entry?.text).not.toContain('the district');
      }
    }
  });
});
