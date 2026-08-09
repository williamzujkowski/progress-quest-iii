import { describe, expect, it, vi } from 'vitest';
import { isUnrenderable } from '../../engine/text';
import { AMBIENT_LINES, BLAME_BEATS, EXCHANGES, FEUD_BEATS, ITEM_OF_RECORD_LINES, QUESTION_BEATS, REACTION_LINES, TRADE_LINES } from '../../data/socialAmbient';
import { projectAmbient } from '../../state/socialProjection';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';

const HERO = { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk' } as const;
const ALL = [...AMBIENT_LINES, ...TRADE_LINES, ...REACTION_LINES, ...FEUD_BEATS, ...QUESTION_BEATS];
/** The two lanes that quote the loadout, kept apart because their text carries placeholders. */
const INTERPOLATED = [...ITEM_OF_RECORD_LINES, ...BLAME_BEATS];
const FILING = {
  itemOfRecord: { slot: 'Gauntlets' as const, name: '-4 Lapsed Skeleton Key', quality: 3, base: 'Skeleton Key', standing: 10 },
  reductionPercent: 3,
  contributors: [{ slot: 'Gauntlets' as const, name: '-4 Lapsed Skeleton Key', quality: 3, base: 'Skeleton Key', standing: 10 }],
  repeatedModifier: null,
};

describe('the guild talks about itself', () => {
  it('is deterministic and touches no clock or random source', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random forbidden'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock forbidden'); });

    const once = Array.from({ length: 300 }, (_, task) => JSON.stringify(projectAmbient(HERO, task)));
    const twice = Array.from({ length: 300 }, (_, task) => JSON.stringify(projectAmbient(HERO, task)));

    expect(twice).toEqual(once);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  it('says one thing at a time, except an exchange, which is a unit', () => {
    // Somebody says a thing and the channel moves on. A burst of ambient would be a caption track
    // with a different subject — but half of "Is it shorter?" / "It is a shortcut." is not a
    // shorter joke, it is a different and worse one, so an exchange arrives entire.
    for (let task = 0; task < 400; task += 1) {
      const spoken = projectAmbient(HERO, task);
      // Detected by `includes`, not `endsWith`. Anchoring on the end made the check depend on the
      // exact thing a mutation would change — splitting an exchange across scenes appended an index
      // and the assertion below silently stopped running.
      // Two lanes speak more than once: an exchange, and a mistell — which is an exchange that
      // disagrees with itself about where it was going.
      const sceneId = spoken[0]?.sceneId ?? '';
      const isExchange = sceneId.includes(':exchange') || sceneId.includes(':mistell');
      // Was `toBe(isExchange ? spoken.length : 1)`, whose exchange arm compared a value with
      // itself and could not fail. The two cases are now asserted separately and both say something.
      if (!isExchange) expect(spoken.length, `task ${task}`).toBe(1);
      if (isExchange) {
        expect(spoken.length).toBeGreaterThan(1);
        // One scene, so the scheduler gates it whole.
        expect(new Set(spoken.map(({ sceneId }) => sceneId)).size).toBe(1);
      }
    }
  });

  it('lets two personas talk to each other with the hero not in the room', () => {
    // The measured feed had the hero in every third line and the cast addressing them in the other
    // two. A channel where every exchange includes the person reading it is a caption track with
    // more speakers.
    const exchanges = Array.from({ length: 3000 }, (_, task) => projectAmbient(HERO, task))
      .filter((spoken) => spoken[0]?.sceneId.includes(':exchange'));

    expect(exchanges.length).toBeGreaterThan(0);
    for (const spoken of exchanges) {
      expect(spoken.every(({ speaker }) => speaker.kind === 'cast')).toBe(true);
      expect(spoken.every(({ speaker }) => !speaker.automaticHero)).toBe(true);
      // At least two voices, or it is not an exchange.
      expect(new Set(spoken.map(({ speaker }) => speaker.id)).size).toBeGreaterThan(1);
    }
  });

  it('keeps the slow lanes slow, so no one of them swamps the channel', () => {
    // The cadence budget, written down. `SCENE_LENGTHS` and `AMBIENT_IN` are both scar tissue from
    // content that fired too often, and three lanes have been added since the weights were tuned —
    // utility, mistell, and the two exchange shares. Nothing was checking that the mix still holds.
    //
    // Asserted as bands rather than exact figures: the weights are a design decision and should be
    // free to move, but a lane quietly taking a third of the channel should not pass unnoticed.
    const TASKS = 3000;
    const counts = new Map<string, number>();
    for (let task = 0; task < TASKS; task += 1) {
      const lane = projectAmbient(HERO, task)[0]?.sceneId.split(':')[2] ?? 'none';
      counts.set(lane, (counts.get(lane) ?? 0) + 1);
    }
    const share = (lane: string) => (counts.get(lane) ?? 0) / TASKS;

    // The running bits are the ones that must stay rare: a feud surfacing often stops being a slow
    // burn, and a question re-asked every minute is nagging rather than forlorn.
    for (const slow of ['feud', 'question', 'utility', 'mistell', 'auction']) {
      expect(share(slow), `${slow} must stay a slow lane`).toBeGreaterThan(0.02);
      expect(share(slow), `${slow} must stay a slow lane`).toBeLessThan(0.12);
    }

    // And the filler still carries the channel, or the room stops sounding like a room between
    // events. `ambient` absorbs the two loadout lanes when there is nothing worth citing.
    expect(share('ambient')).toBeGreaterThan(0.25);
    expect(share('ambient')).toBeLessThan(0.45);
  });

  it('reaches every lane, including the two slow ones', () => {
    // With no loadout there is nothing to cite, so the item and blame lanes fall back — but a hero
    // owning nothing worth citing is exactly the one the hall is still explaining itself to, so
    // onboarding does fire.
    const lanes = new Set(Array.from({ length: 2000 }, (_, task) => projectAmbient(HERO, task)[0]?.sceneId.split(':')[2]));
    expect(lanes).toEqual(new Set(['ambient', 'reaction', 'trade', 'feud', 'question', 'utility', 'auction', 'onboarding', 'exchange', 'mistell']));
  });

  it('stops explaining the hall once the hero owns something better than a lanyard', () => {
    // The joke is that the worst loadout in the game has the loudest voice. It has to end on its
    // own, and it does: the window closes the moment anything above entry-tier is equipped, which
    // is why it needs no timer.
    const wellEquipped = Array.from({ length: 2000 }, (_, task) => projectAmbient(HERO, task, FILING)[0]?.sceneId.split(':')[2]);
    expect(wellEquipped).not.toContain('onboarding');

    const entryTier = { ...FILING, itemOfRecord: { ...FILING.itemOfRecord, base: 'Lanyard', standing: 1 } };
    const starting = Array.from({ length: 2000 }, (_, task) => projectAmbient(HERO, task, entryTier)[0]?.sceneId.split(':')[2]);
    expect(starting).toContain('onboarding');
  });

  it('draws all four seats, which the event scenes never managed', () => {
    // Two of four seats spoke 95% of cast lines in the measured baseline, because loot and market
    // are 90% of events and they always open with the same seat.
    const speakers = new Set(Array.from({ length: 600 }, (_, task) => projectAmbient(HERO, task)[0]?.speaker.displayName));
    expect(speakers.size).toBeGreaterThanOrEqual(4);
  });

  it('speaks as somebody from this hero’s own troupe', () => {
    // Identity is asserted as a whole rather than by name. Checking the display name alone let a
    // mutation that pinned every line to one persona's id sail through, because the name still
    // varied and the two disagreed.
    const byId = new Map(SOCIAL_PERSONAS.map((persona) => [persona.id, persona]));
    for (let task = 0; task < 200; task += 1) {
      const entry = projectAmbient(HERO, task)[0];
      const persona = byId.get(entry?.speaker.id ?? '');
      expect(persona).toBeDefined();
      expect(entry?.speaker.displayName).toBe(persona?.displayName);
      expect(entry?.speaker.role).toBe(persona?.role);
      expect(entry?.speaker.fictional).toBe(true);
      expect(entry?.speaker.automaticHero).toBe(false);
    }
  });

  it('repeats its advertisement verbatim, which is the one place repetition is the joke', () => {
    const ads = new Set(
      Array.from({ length: 4000 }, (_, task) => projectAmbient(HERO, task)[0])
        .filter((entry) => entry?.sceneId.endsWith(':trade'))
        .map((entry) => entry?.text),
    );
    // A trade channel that varied its spam would be less true, not more.
    expect(ads.size).toBe(1);
  });

  it('walks its running bits in order and starts them again', () => {
    const beats = Array.from({ length: 4000 }, (_, task) => projectAmbient(HERO, task)[0])
      .filter((entry) => entry?.sceneId.endsWith(':feud'))
      .map((entry) => entry?.text);
    const seen = [...new Set(beats)];
    // Every beat is reached, and the first one comes back — a feud that restarts is truer than one
    // that concludes.
    expect(seen.length).toBe(FEUD_BEATS.length);
    expect(beats.filter((text) => text === FEUD_BEATS[0]?.text).length).toBeGreaterThan(1);
  });

  it('refuses a task count it cannot use', () => {
    expect(projectAmbient(HERO, Number.NaN)).toEqual([]);
    expect(projectAmbient(HERO, -1)).toEqual([]);
  });
});

describe('the written bank', () => {
  it('has a short tail, which the event corpus entirely lacked', () => {
    // Measured at 9.7 words mean with no lines under five. The one-to-three word utterance is the
    // most common in a real channel and was zero per cent of this one.
    const short = ALL.filter(({ text }) => text.split(/\s+/).length <= 3);
    expect(short.length).toBeGreaterThanOrEqual(8);
  });

  it('carries lines that are not jokes', () => {
    // A channel where every utterance is a polished aphorism reads as generated however good each
    // aphorism is. These are what make the others detectable as jokes.
    const plain = ['back', 'afk, kettle', 'Kettle.', 'Received.', 'Noted.', 'Logged.'];
    for (const text of plain) expect(ALL.some((line) => line.text === text)).toBe(true);
  });

  it('does not lean on the construction that is already a fingerprint', () => {
    // "emotionally complete and legally decorative" is the best move in this project's kit and is
    // spent often enough in the event corpus to be recognisable. None here.
    const paired = ALL.filter(({ text }) => /\b\w+ly \w+ and \w+ly \w+/.test(text));
    expect(paired).toEqual([]);
  });

  it('names no real vendor, product, lab, or person', () => {
    const serialized = JSON.stringify(ALL).toLowerCase();
    for (const forbidden of [
      'aws', 'amazon', 'azure', 'google', 'microsoft', 'oracle', 'nvidia', 'intel', 'apple',
      'kubernetes', 'docker', 'jira', 'slack', 'github', 'postgres', 'redis', 'nginx',
      'openai', 'anthropic', 'deepmind', 'chatgpt', 'claude', 'gemini', 'copilot', 'llama',
      'turing', 'lovelace', 'mccarthy', 'minsky', 'hopper', 'torvalds', 'stallman',
      'everquest', 'world of warcraft', 'http://', 'https://',
    ]) expect(serialized, `ambient bank must not name ${forbidden}`).not.toContain(forbidden);
  });

  it('carries no markup, control characters, or bidirectional overrides', () => {
    // Scanned as strings, not as JSON. This used to test `JSON.stringify(ALL)`, and `JSON.stringify`
    // escapes every code point below 0x20 into a six-character `\uXXXX` sequence — so the clause
    // looking for them could never be true, and half the assertion was decoration. Proved by
    // mutation: a line carrying U+0000 and U+001B left it passing.
    //
    // `isUnrenderable` is the same predicate the save boundary rejects on, so the rule the shipped
    // catalogue is held to and the rule an imported name is held to cannot drift apart.
    for (const { text } of ALL) {
      expect(isUnrenderable(text), text).toBe(false);
      expect(text, text).not.toMatch(/[<>]/u);
    }
  });

  it('states no figure, because an ambient line citing one would be asserting state', () => {
    for (const { text } of ALL) expect(text).not.toMatch(/\d/);
  });

  it('fits the persona word caps', () => {
    const cap = Math.min(...SOCIAL_PERSONAS.map(({ voice }) => voice.maxWords));
    for (const { text } of ALL) expect(text.split(/\s+/).length).toBeLessThanOrEqual(cap);
  });
});

describe('the guild notices what is being worn', () => {
  const lanesOf = (loadout?: typeof FILING) =>
    Array.from({ length: 3000 }, (_, task) => projectAmbient(HERO, task, loadout)[0])
      .map((entry) => entry?.sceneId.split(':')[2]);

  it('reaches the two loadout lanes when there is something to cite', () => {
    expect(new Set(lanesOf(FILING))).toEqual(new Set(['ambient', 'reaction', 'trade', 'feud', 'question', 'utility', 'auction', 'item', 'blame', 'exchange', 'mistell']));
  });

  it('says nothing about a loadout that earns nothing, rather than falling silent', () => {
    // A lane producing no line would quietly lower the rate the cadence was tuned to, so it falls
    // back instead. Both halves matter: the lanes are gone AND the channel still speaks.
    const lanes = lanesOf(undefined);
    expect(lanes).not.toContain('item');
    expect(lanes).not.toContain('blame');
    expect(lanes.filter(Boolean).length).toBe(lanes.length);
  });

  it('quotes the bare noun, never the generated name', () => {
    // A full name carries an assessor's mark, and a figure in an ambient line asserts state nothing
    // computed. The noun is the funny part anyway.
    const spoken = Array.from({ length: 3000 }, (_, task) => projectAmbient(HERO, task, FILING)[0])
      .filter((entry) => entry?.sceneId.endsWith(':item') || entry?.sceneId.endsWith(':blame'))
      .map((entry) => entry?.text ?? '');

    expect(spoken.length).toBeGreaterThan(0);
    for (const text of spoken) {
      expect(text).not.toMatch(/\d/);
      expect(text).not.toContain('Lapsed');
      expect(text).not.toContain('{');
    }
    expect(spoken.some((text) => text.includes('Skeleton Key'))).toBe(true);
    expect(spoken.some((text) => text.includes('Gauntlets'))).toBe(true);
  });

  it('walks the blame beats in order and starts them again', () => {
    const beats = Array.from({ length: 6000 }, (_, task) => projectAmbient(HERO, task, FILING)[0])
      .filter((entry) => entry?.sceneId.endsWith(':blame'))
      .map((entry) => entry?.text);
    expect(new Set(beats).size).toBe(BLAME_BEATS.length);
  });
});

describe('the interpolated bank', () => {
  it('carries a placeholder in every line, so none is a fixed string by accident', () => {
    for (const { text } of INTERPOLATED) expect(text).toMatch(/\{(item|slot)\}/);
  });

  it('states no figure of its own', () => {
    for (const { text } of INTERPOLATED) expect(text).not.toMatch(/\d/);
  });

  it('gives every exchange at least two speakers and no hero', () => {
    for (const exchange of EXCHANGES) {
      expect(exchange.length).toBeGreaterThan(1);
      expect(new Set(exchange.map(({ seat }) => seat)).size).toBeGreaterThan(1);
    }
  });
});
