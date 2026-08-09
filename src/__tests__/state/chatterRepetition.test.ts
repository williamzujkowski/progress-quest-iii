import { describe, expect, it } from 'vitest';
import { projectAmbient } from '../../state/socialProjection';
import { EMPTY_CASELOAD } from '../../state/caseload';
import { EMPTY_COMMENDATIONS } from '../../state/commendations';

/**
 * How often the channel repeats itself, and how much it has to say — both asserted rather than
 * claimed.
 *
 * `recentTexts` exists because two lanes deliberately hold one string for a long stretch: a running
 * bit keeps its beat for forty completed tasks, and the trade advertisement is fixed for the life of
 * a character. The justification written beside that field was "15% of ambient lines repeating
 * within five", measured against a rotation of eleven lanes. It is 6.0% now, on eighteen.
 *
 * The guard still earns its place — six lines in a hundred arriving twice inside one unscrolled
 * panel still looks broken — but the number had drifted by two and a half times with nobody able to
 * notice, because a figure in a comment is not something anybody runs. Same failure as the ambient
 * thunk's rate, which is why both now have a test.
 *
 * The two directions are asserted separately on purpose. Repetition is a ceiling: it may fall freely
 * and must not climb. Distinct lines are a floor: the corpus may grow freely and must not shrink.
 */

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;

/** Everything the institution can remember, which is what a session past its first minutes has. */
const FURNISHED = {
  loadout: {
    itemOfRecord: { slot: 'Gauntlets' as const, name: '-4 Lapsed Skeleton Key', quality: 3, base: 'Skeleton Key', standing: 10 },
    reductionPercent: 3,
    contributors: [{ slot: 'Gauntlets' as const, name: '-4 Lapsed Skeleton Key', quality: 3, base: 'Skeleton Key', standing: 10 }],
    repeatedModifier: { name: 'Lapsed', slots: 4 },
  },
  caseload: { ...EMPTY_CASELOAD, targets: { 'Gnoll|2|hide': 31 }, targetActs: { 'Gnoll|2|hide': { first: 3, last: 7 } } },
  predecessor: { name: 'Vashenko', phrase: 'This file continues one opened for Vashenko.' },
  commendations: {
    ...EMPTY_COMMENDATIONS,
    exhibit: { Gauntlets: { name: '+9 Bonded Signing Authority', label: 'legendary' as const, quality: 40 } },
  },
  venue: { venue: 'town' as const, location: 'Ashfield', act: 3 },
  specimens: { specimens: ['item:rubber duck', 'item:paperclip', 'item:egg timer'] },
};

/** The window a repeat is actually noticed in — about what fits on screen at once. */
const WINDOW = 5;

const survey = (memory: Parameters<typeof projectAmbient>[2], tasks = 4000) => {
  const lines: string[] = [];
  for (let task = 0; task < tasks; task += 1) for (const { text } of projectAmbient(HERO, task, memory)) lines.push(text);

  let repeats = 0;
  for (let index = 0; index < lines.length; index += 1) {
    for (let back = Math.max(0, index - WINDOW); back < index; back += 1) {
      if (lines[back] === lines[index]) { repeats += 1; break; }
    }
  }

  return { lines: lines.length, distinct: new Set(lines).size, repeatShare: repeats / lines.length };
};

describe('the channel does not repeat itself inside one panel', () => {
  it('keeps the raw repetition rate well under what the guard was built against', () => {
    // Measured without `scheduleChatter`, so this is the rate the guard has to absorb rather than
    // the rate a player sees. 0.060 bare and 0.046 furnished when written; the ceiling is set above
    // both with room for a cadence change, and far below the 0.15 that justified the guard.
    expect(survey({}).repeatShare).toBeLessThan(0.10);
    expect(survey(FURNISHED).repeatShare).toBeLessThan(0.10);
  });

  it('repeats less once the institution has something to remember', () => {
    // The direction matters more than either figure: a furnished channel draws the running bits a
    // smaller share of the time, so it must not repeat itself more than a bare one.
    expect(survey(FURNISHED).repeatShare).toBeLessThanOrEqual(survey({}).repeatShare);
  });
});

describe('the channel has enough to say', () => {
  it('holds a corpus a floor below which the room stops sounding like a room', () => {
    // 127 distinct bare and 204 furnished when written. A floor rather than a band, because banks
    // should be free to grow — what this refuses is a lane being deleted or a gate closing on one
    // without anybody noticing the corpus shrank.
    expect(survey({}).distinct).toBeGreaterThan(110);
    expect(survey(FURNISHED).distinct).toBeGreaterThan(180);
  });

  it('says substantially more when the filing cabinet is full, which is the whole of #620', () => {
    // Seven lanes were added to reach this. Asserted as a ratio so it survives the banks growing on
    // both sides — what it refuses is the memory-fed lanes quietly ceasing to contribute.
    const bare = survey({});
    const furnished = survey(FURNISHED);
    expect(furnished.distinct).toBeGreaterThan(bare.distinct * 1.4);
  });
});
