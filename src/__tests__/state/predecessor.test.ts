import { describe, expect, it } from 'vitest';
import { predecessorFor } from '../../state/predecessor';
import { projectServiceRecord } from '../../state/serviceRecord';
import { createNewCharacter } from '../../engine/sim';
import { EMPTY_CASELOAD } from '../../state/caseload';
import { EMPTY_COMMENDATIONS } from '../../state/commendations';
import type { CharacterSheet } from '../../engine/types';

/**
 * Who held the file before.
 *
 * The ledgers deliberately span characters — *"a new character starting over must not erase the
 * record"* — so a new hero inherits a filing cabinet full of somebody else's work, and until now
 * nothing said whose. That is the whole feature: one line, naming the person the paperwork used to
 * be about.
 */

const sheet = (name: string, level: number, race = 'Double Tenant', klass = 'Incident Paladin'): CharacterSheet => {
  const character = createNewCharacter(name, race, klass, `${name}-seed`);
  return { ...character, Traits: { ...character.Traits, Level: level } };
};

const rosterOf = (...sheets: CharacterSheet[]): Record<string, CharacterSheet> =>
  Object.fromEntries(sheets.map((entry) => [entry.Traits.Name, entry]));

describe('the file names whoever held it before', () => {
  it('cites the most senior character other than the one in hand', () => {
    const roster = rosterOf(sheet('Krg', 4), sheet('Bendrel', 19), sheet('Wilt', 11));

    expect(predecessorFor(roster, 'Krg')?.name).toBe('Bendrel');
  });

  it('never cites the hero to themselves', () => {
    // The current character is usually the highest level in the roster, which is exactly why this
    // has to be excluded rather than assumed away.
    const roster = rosterOf(sheet('Krg', 40), sheet('Bendrel', 19));

    expect(predecessorFor(roster, 'Krg')?.name).toBe('Bendrel');
  });

  it('says nothing when there is nobody else on file', () => {
    expect(predecessorFor(rosterOf(sheet('Krg', 4)), 'Krg')).toBeNull();
    expect(predecessorFor({}, 'Krg')).toBeNull();
  });

  it('holds still, which is why it is seniority rather than recency', () => {
    // "Predecessor" suggests the previous one, and the roster does keep a recency order. Recency
    // moves: a player switching between two characters would see the citation swap every time,
    // which reads as the institution changing its mind rather than as a record. Ties resolve
    // alphabetically so key order cannot decide it either.
    const roster = rosterOf(sheet('Wilt', 19), sheet('Bendrel', 19));
    const reordered = rosterOf(sheet('Bendrel', 19), sheet('Wilt', 19));

    expect(predecessorFor(roster, 'Krg')?.name).toBe('Bendrel');
    expect(predecessorFor(reordered, 'Krg')?.name).toBe('Bendrel');
  });
});

describe('the citation claims no ending', () => {
  it('says what the sheet holds and nothing about what became of them', () => {
    // A character in the roster has not retired, died, or been dismissed. They have not been loaded
    // lately, which is not a fate and must not be written as one.
    const { phrase } = predecessorFor(rosterOf(sheet('Bendrel', 19, 'Sub-Subprocessor', 'Robot Monk')), 'Krg')!;

    expect(phrase).toBe('This file continues one opened for Bendrel, Sub-Subprocessor Robot Monk, last recorded at level 19.');
    expect(phrase.toLowerCase()).not.toMatch(/\bretired\b|\bdied\b|\bdeceased\b|\blost\b|\bformer\b|\bdismissed\b|\bno longer\b/);
    expect(phrase.toLowerCase(), phrase).not.toMatch(/\byou\b|\byour\b|\bwe\b|\bour\b/);
  });
});

describe('the document carries it, and survives without it', () => {
  const input = {
    hero: { name: 'Krg', race: 'Sub-Subprocessor', className: 'Robot Monk', level: 12 },
    act: 5,
    caseload: { ...EMPTY_CASELOAD, kinds: { fetch: 4 } },
    commendations: EMPTY_COMMENDATIONS,
    specimenCount: 0,
  };

  it('files the precedent under everything it explains', () => {
    const record = projectServiceRecord({ ...input, roster: rosterOf(sheet('Bendrel', 19)) })!;

    expect(record.sections.at(-1)?.heading).toBe('Precedent');
    expect(record.sections.at(-1)?.lines[0]).toContain('Bendrel');
  });

  it('drops the section rather than the document when the roster cannot be read', () => {
    // The roster comes from storage, and a storage failure must never cost anybody their service
    // record. It costs them one line.
    const record = projectServiceRecord(input)!;

    expect(record).not.toBeNull();
    expect(record.sections.map(({ heading }) => heading)).not.toContain('Precedent');
  });
});
