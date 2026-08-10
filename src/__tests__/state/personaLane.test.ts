import { describe, expect, it } from 'vitest';
import { PERSONA_LINES } from '../../data/socialAmbient';
import { SOCIAL_PERSONAS } from '../../data/socialCatalog';
import { projectAmbient } from '../../state/socialProjection';

/**
 * The cast, finally speaking as the people the roster says they are.
 *
 * `socialCatalog.ts` gives every persona a name, a role and a declared preoccupation, and the feed
 * prints the name and role beside every line — so a reader has been looking at
 * `SOLILOQ_TankAlt · Tank liaison` for hours. `Tank liaison` and `Healer auditor` appeared in zero
 * lines of dialogue. The roles were labels next to a speaker and never things the speaker was.
 *
 * Per-seat banks structurally could not fix it: a seat has two personas, so a `support` line is
 * spoken by the healer in some saves and the tank in others and cannot be about either. `castForHero`
 * fixes one persona per seat for the life of a save, which is what makes a persona-keyed line belong
 * to a person rather than a rotation.
 */

const hero = (name: string) => ({ name, race: 'Sub-Subprocessor', className: 'Robot Monk' } as const);

const linesFor = (name: string, tasks = 1500) =>
  Array.from({ length: tasks }, (_unused, task) => projectAmbient(hero(name), task)[0]).filter(Boolean);

describe('the cast speaks as itself', () => {
  it('gives every persona on the roster something of their own to say', () => {
    // A line for one persona is a line most saves never see, since a save seats four of the eight.
    // All eight must be covered or the lane is dead for whoever drew the uncovered ones.
    const covered = new Set(PERSONA_LINES.map(({ persona }) => persona));
    for (const { id, displayName } of SOCIAL_PERSONAS) {
      expect(covered.has(id), `${displayName} has no line of their own`).toBe(true);
    }
  });

  it('seats each line with the persona that owns it', () => {
    // The bank is drawn through the seat machinery, so a line keyed to the tank liaison must sit in
    // the support seat or it would be spoken by somebody else entirely.
    for (const line of PERSONA_LINES) {
      const owner = SOCIAL_PERSONAS.find(({ id }) => id === line.persona);
      expect(owner, line.text).toBeDefined();
      expect(line.seat, `${line.text} is seated ${line.seat} but ${owner!.displayName} sits ${owner!.seat}`).toBe(owner!.seat);
    }
  });

  it('never puts words in the mouth of a persona this save did not seat', () => {
    // The load-bearing assertion. Four of the eight are somebody else's guild in any given file, and
    // a line about being the tank is wrong when the support seat drew the healer.
    for (const name of ['Krg', 'Render', 'Morgbluff', 'Gornar', 'Vashenko', 'Porter']) {
      const spoken = linesFor(name).filter((entry) => entry!.sceneId.includes(':persona'));
      expect(spoken.length, `${name} never reached the lane`).toBeGreaterThan(0);

      for (const entry of spoken) {
        const owner = PERSONA_LINES.find(({ text }) => text === entry!.text)?.persona;
        expect(owner, entry!.text).toBeDefined();
        // The speaker rendered must be the persona the line belongs to.
        expect(entry!.speaker.id, `${entry!.text} spoken by ${entry!.speaker.displayName}`).toBe(owner);
      }
    }
  });

  it('says what the job is rather than announcing the job title', () => {
    // The feed already prints the role beside the name. A line that restated it would be the
    // agreement failure the deadpan rule forbids — the preoccupation is the brief, not the label.
    for (const { text } of PERSONA_LINES) {
      expect(text, text).not.toMatch(/\bTank liaison\b|\bHealer auditor\b|\bRaid coordinator\b|\bQuartermaster\b|\bGuild registrar\b|\bQuest clerk\b|\bMarket broker\b/);
      expect(text, text).not.toMatch(/\d/);
    }
  });
});
