import { describe, expect, it } from 'vitest';
import { projectSocialBatch } from '../../state/socialProjection';
import { raidMuster, attendanceLabel } from '../../state/raidMuster';
import { projectWorld } from '../../state/worldContext';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';
import type { GamePresentationSnapshot, GameTransitionEvent } from '../../engine/transition';
import type { IdentifiedGameTransitionRecord } from '../../state/worldContext';

/**
 * The muster sheet, at the one moment a raid would read one out.
 *
 * `raidMuster` has produced a four-name sheet with per-person attendance since it was written, and
 * it reached a list in the world console. Meanwhile the raid milestone — the loudest scene the game
 * has — opened on a remark about quorum and never said who was or was not there.
 *
 * The sheet's own joke is that it cannot tell somebody who is missing from somebody who left years
 * ago, because it never closed either record. That survives only if the names and labels are quoted
 * verbatim; a count would erase exactly the thing worth reading.
 */

const snapshot = (overrides: Partial<GamePresentationSnapshot> = {}): GamePresentationSnapshot => ({
  hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' , level: 40 },
  act: 14,
  // `venueForTask` reads `nextTask`, not `completedTask` — the venue is where the hero is going.
  // A snapshot with the cinematic behind it is standing somewhere else entirely.
  completedTask: 'kill',
  nextTask: 'cinematic',
  completedTasks: 900,
  elapsedSeconds: 90_000,
  interplotRole: 'nemesis',
  ...overrides,
});

const scene = (activityId: number, post: GamePresentationSnapshot, event?: GameTransitionEvent) =>
  projectSocialBatch([{
    activityId,
    record: {
      event: event ?? { type: 'task_started', task: { type: 'cinematic', description: 'A boss', durationMs: 4000, elapsedMs: 0 } } as GameTransitionEvent,
      post,
    },
  } as IdentifiedGameTransitionRecord]);

const contextOf = (post: GamePresentationSnapshot) =>
  projectWorld({ kind: 'transition', source: { activityId: 1, record: { event: { type: 'task_started', task: { type: 'cinematic', description: 'A boss', durationMs: 4000, elapsedMs: 0 } } as GameTransitionEvent, post } } }).context;

describe('a raid milestone reads its own sheet', () => {
  it('opens on the muster rather than on a remark about quorum', () => {
    // The premise. If no sampled act reaches a raid venue, everything below is vacuous.
    let sawSheet = 0;
    for (let act = 10; act < 30; act += 1) {
      const post = snapshot({ act });
      if (raidMuster(contextOf(post)) === null) continue;
      const opening = scene(act, post)[0]!.text;
      expect(opening, `act ${act}`).toMatch(/The sheet notes|Every name on the sheet is attending/);
      expect(opening, `act ${act}`).not.toContain('Quorum is zero external attendees');
      sawSheet += 1;
    }
    expect(sawSheet).toBeGreaterThan(5);
  });

  it('quotes the names and labels the muster actually produced', () => {
    // Verbatim, and checked against the muster rather than against a bank — a scene naming somebody
    // who is not on this raid's sheet would be inventing an attendee.
    for (let act = 10; act < 26; act += 1) {
      const post = snapshot({ act });
      const muster = raidMuster(contextOf(post));
      if (muster === null) continue;

      const opening = scene(act, post)[0]!.text;
      const missing = muster.filter(({ attendance }) => attendance !== 'present');
      if (missing.length === 0) {
        expect(opening, `act ${act}`).toContain('Every name on the sheet is attending');
        continue;
      }
      const first = missing[0]!;
      expect(opening, `act ${act}`).toContain(`${first.name} ${attendanceLabel(first.attendance)}`);
      // Everybody named is on this sheet.
      for (const persona of SOCIAL_PERSONAS) {
        if (muster.some(({ name }) => name === persona.displayName)) continue;
        expect(opening, `act ${act} names an absentee from another raid`).not.toContain(persona.displayName);
      }
    }
  });

  it('keeps the coordinator inside their own word cap', () => {
    // The cap is the voice: the raid coordinator's register is a "compressed readiness order" and
    // their declared preoccupation is quorum. The first draft read all four names with labels and
    // ran to twenty words against a cap of nineteen, so the line compressed rather than the cap
    // moving. Checked here as well as in the global sweep, because this line's length depends on
    // hashed attendance and a lucky sample would hide it.
    const cap = Math.min(...SOCIAL_PERSONAS.filter(({ seat }) => seat === 'field').map(({ voice }) => voice.maxWords));
    for (let act = 10; act < 40; act += 1) {
      const post = snapshot({ act });
      if (raidMuster(contextOf(post)) === null) continue;
      const opening = scene(act, post)[0]!;
      expect(opening.text.trim().split(/\s+/u).length, opening.text).toBeLessThanOrEqual(cap);
    }
  });

  it('states no count, so the sheet stays a sheet', () => {
    // "Four of eleven attending" is a statistic. "Deneb retired, still listed" is an institution that
    // never closed a record, which is the joke and is not reconstructible from a number.
    for (let act = 10; act < 30; act += 1) {
      const post = snapshot({ act });
      if (raidMuster(contextOf(post)) === null) continue;
      expect(scene(act, post)[0]!.text, `act ${act}`).not.toMatch(/\b\d+ of \d+\b|\battendees\b/);
    }
  });

  it('leaves a dungeon milestone alone, because a dungeon takes no attendance', () => {
    // Below the raid act threshold the venue is a dungeon, `raidMuster` returns null, and the
    // original variants must still be reachable.
    const post = snapshot({ act: 3 });
    expect(raidMuster(contextOf(post))).toBeNull();
    expect(scene(3, post)[0]!.text).not.toMatch(/The sheet notes|Every name on the sheet/);
  });

  it('says nothing about a sheet when the framing is a raid but the venue is not', () => {
    // The case that distinguishes the two possible gates, and it is reachable: `raid` is a fact
    // about the framing — nemesis role, act at or past the threshold — while the muster is a fact
    // about the venue, which also needs the hero to be walking into the cinematic. An act closing
    // while the hero heads back to a field is all three of nemesis, act 14, and no sheet.
    //
    // Gating on `raid` would print "Every name on the sheet is attending" about a sheet that was
    // never drawn up, which is the accuracy failure this codebase keeps correcting.
    const post = snapshot({ act: 14, nextTask: 'kill' });
    expect(raidMuster(contextOf(post))).toBeNull();

    const closing = scene(99, post, { type: 'act_completed', act: 14 } as GameTransitionEvent);
    expect(closing[0]!.text).not.toMatch(/The sheet notes|Every name on the sheet/);
    expect(closing[0]!.text).toContain('Act 14 has closed');
  });

  it('still answers, rather than replacing the scene with a sheet', () => {
    // Three lines: the sheet, the running DKP bit, and the hero. A milestone that dropped the middle
    // beat would trade a running joke for a one-off.
    for (let act = 10; act < 20; act += 1) {
      const post = snapshot({ act });
      if (raidMuster(contextOf(post)) === null) continue;
      const lines = scene(act, post);
      expect(lines, `act ${act}`).toHaveLength(3);
      expect(lines.at(-1)?.speaker.automaticHero).toBe(true);
    }
  });
});
