import { describe, expect, it, vi } from 'vitest';
import { admitsEvent, readyToSpeak } from '../../state/chatterSchedule';

/**
 * The rules are asserted as distributions rather than as individual answers.
 *
 * A cadence test that pins one call to one boolean passes whatever the shape of the whole is, and
 * the shape is the entire point — an evenly spaced channel reads as a machine at any rate. So these
 * sweep many keys and measure what comes out.
 */

/**
 * Fixed-width on purpose. With `k:9` beside `k:1000` the keys vary in length, and a rule that keyed
 * off `key.length` instead of the hash sailed through a 20%-admission assertion at 22.5% — the
 * sweep was measuring the shape of the key set rather than the shape of the rule.
 */
const keys = (count: number, prefix = 'k') =>
  Array.from({ length: count }, (_, index) => `${prefix}:${String(index).padStart(6, '0')}`);

describe('when the guild speaks', () => {
  it('is deterministic and touches no clock or random source', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random forbidden'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock forbidden'); });

    const once = keys(200).map((key) => [readyToSpeak(40, 20, key), admitsEvent(60, key)].join('|'));
    const twice = keys(200).map((key) => [readyToSpeak(40, 20, key), admitsEvent(60, key)].join('|'));

    expect(twice).toEqual(once);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  it('draws gaps that are short far more often than they are long', () => {
    // The distribution is the feature. Measured by finding, per key, the smallest elapsed task
    // count that lets a line through — which is exactly the gap that key drew.
    const drawn = keys(4000).map((key) => {
      for (let elapsed = 0; elapsed <= 30; elapsed += 1) if (readyToSpeak(elapsed, 0, key)) return elapsed;
      return Number.POSITIVE_INFINITY;
    });

    expect(drawn.every(Number.isFinite)).toBe(true);
    const short = drawn.filter((gap) => gap <= 2).length / drawn.length;
    const long = drawn.filter((gap) => gap >= 14).length / drawn.length;

    // Bursts have to be common and silences have to be real. Both halves are asserted, because a
    // list that produced only short gaps would pass a "bursty" check while being a drip.
    expect(short).toBeGreaterThan(0.3);
    expect(long).toBeGreaterThan(0.15);
    expect(long).toBeLessThan(short);
    // And no gap may be the mean. An even channel is the failure being designed against.
    expect(drawn.filter((gap) => gap === 6)).toHaveLength(0);
  });

  it('never speaks twice with nothing in between', () => {
    // Zero elapsed tasks must never pass, whatever the key drew, or a burst becomes a flood.
    expect(keys(2000).some((key) => readyToSpeak(10, 10, key))).toBe(false);
  });

  it('speaks immediately when the task counter has gone backwards', () => {
    // A restored or switched session brings someone else's numbers. Waiting out a gap measured
    // against a stranger would silence the channel for as long as the difference.
    expect(readyToSpeak(3, 900, 'restored')).toBe(true);
  });

  it('refuses to speak on figures that are not numbers', () => {
    expect(readyToSpeak(Number.NaN, 0, 'k')).toBe(false);
    expect(readyToSpeak(0, Number.NaN, 'k')).toBe(false);
    expect(readyToSpeak(Number.POSITIVE_INFINITY, 0, 'k')).toBe(false);
  });
});

describe('which events get a line', () => {
  it('lets roughly one ordinary event in five through', () => {
    const admitted = keys(4000).filter((key) => admitsEvent(60, key)).length / 4000;
    expect(admitted).toBeGreaterThan(0.15);
    expect(admitted).toBeLessThan(0.25);
  });

  it('never suppresses a milestone, a level, or an act', () => {
    // The ladder puts milestones at 100/95 and level gains at 90. A silent level-up is the one
    // suppression a player would read as a bug rather than as restraint.
    for (const priority of [90, 95, 100]) {
      expect(keys(500).every((key) => admitsEvent(priority, key))).toBe(true);
    }
    // And the rung below is genuinely subject to the gate, or the threshold means nothing.
    expect(keys(500).some((key) => !admitsEvent(85, key))).toBe(true);
  });

  it('does not admit on a fixed cycle', () => {
    // A modulo of the task count admits exactly every fifth event, and the regularity shows within
    // a minute. Consecutive counts must not alternate predictably.
    const run = Array.from({ length: 60 }, (_, index) => admitsEvent(60, `hero:${index}`));
    const everyFifth = run.filter((_, index) => index % 5 === 0);
    expect(everyFifth.every(Boolean)).toBe(false);
  });
});
