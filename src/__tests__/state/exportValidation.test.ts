import { describe, expect, it } from 'vitest';
import { RandomGenerator } from '../../engine/prng';
import { createNewCharacter } from '../../engine/sim';
import { decodePQWSave, encodePQWSave } from '../../state/saveManager';
import { MAX_PERSISTED_DESCRIPTION_LENGTH } from '../../data/limits';
import type { CharacterSheet } from '../../engine/types';

/**
 * The escape hatch that produced a dead file.
 *
 * While a hero was in a state the checkpoint writer and the roster writer both correctly refused,
 * the export button and the error boundary's "download current save" both succeeded — and handed
 * the player a `.pqw` that `decodePQWSave` then turned away as `invalid_schema`.
 *
 * So the one path offering a way out of a broken save was the one that silently produced a file that
 * could not be imported anywhere, and nothing said so until the player tried it somewhere else, by
 * which time the session it came from is usually gone.
 *
 * The round trip is the assertion that matters. Not "encode refuses bad input" on its own, which any
 * check would satisfy, but the property the player actually relies on: **anything this produces, the
 * importer accepts.**
 */

const legal = () => createNewCharacter('Exportable', 'Half Daemon', 'Robot Monk', new RandomGenerator('export'));

/** Illegal in the way the save bugs were: a field one step past a cap the schema enforces. */
const illegal = (): CharacterSheet => ({
  ...legal(),
  Task: {
    description: 'x'.repeat(MAX_PERSISTED_DESCRIPTION_LENGTH + 1),
    durationMs: 1000,
    elapsedMs: 0,
    type: 'kill',
  },
});

describe('an exported save is one the importer will accept', () => {
  it('round-trips a legal character', () => {
    const encoded = encodePQWSave(legal());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    // The whole property, stated as a round trip rather than as two separate checks: whatever the
    // exporter hands over, the importer takes.
    const decoded = decodePQWSave(encoded.value);
    expect(decoded.ok, decoded.ok ? '' : decoded.error.message).toBe(true);
  });

  it('refuses to encode a character the importer would reject', () => {
    const encoded = encodePQWSave(illegal());
    expect(encoded).toMatchObject({ ok: false, error: { code: 'invalid_schema' } });
  });

  it('says so in the same breath as refusing, rather than returning an empty string', () => {
    // A refusal the caller cannot show the player is barely better than the dead file. Both call
    // sites put this message on screen.
    const encoded = encodePQWSave(illegal());
    expect(encoded.ok).toBe(false);
    if (encoded.ok) return;
    expect(encoded.error.message).toMatch(/cannot be exported/i);
    expect(encoded.error.message).toMatch(/nothing was changed/i);
  });

  it('agrees with the importer about what is legal, in both directions', () => {
    /*
     * The two schemas cannot be allowed to drift apart. If the exporter were stricter, a player
     * would be refused a file the importer would have taken; if it were looser, the dead file is
     * back. Asserted as agreement rather than as two independent thresholds so neither can move
     * without this noticing.
     */
    for (const [name, sheet] of [['legal', legal()], ['illegal', illegal()]] as const) {
      const encoded = encodePQWSave(sheet);
      // Encoded the way any other producer would, so the importer's verdict can be obtained even
      // for the sheet the exporter refuses.
      const bytes = new TextEncoder().encode(JSON.stringify(sheet));
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const importerAccepts = decodePQWSave(btoa(binary)).ok;

      expect(encoded.ok, name).toBe(importerAccepts);
    }
  });
});
