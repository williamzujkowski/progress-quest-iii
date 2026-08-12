import type { z } from './zod';
import { MAX_STORED_PAYLOAD_LENGTH } from '../data/limits';
import { carriesProtoKey } from './schemas';

/**
 * The read and write every side ledger shares.
 *
 * Three of them — casework, commendations, specimens — had these two functions written out in
 * full, identical apart from a storage key, a schema, an empty value, and in two cases a tidy-up
 * applied after parsing. Everything else was the same, including the order of the guards, which is
 * the part that matters: the payload cap has to be checked before `JSON.parse` sees the string,
 * because parsing is the expensive step and it happens before validation could reject anything.
 *
 * Written once because the invariants live here rather than in any one ledger. Storage readers
 * that disagree about their defences are how the next one gets written without any — and the defect that prompted this was
 * a bug in exactly one of three near-identical copies of a different piece of ledger code.
 */

/**
 * Reads fail closed. Anything unreadable — absent, denied, oversized, malformed, or failing its
 * schema — is the empty ledger, never an error. A tally nobody can load must not stop the game
 * starting.
 *
 * `normalise` runs after a successful parse, for bounds a hostile file can violate but the merge
 * path never produces: more entries than the cap allows, or duplicates that would inflate a count.
 * It defaults to identity for ledgers whose schema already says everything.
 */
export function readLedger<Schema extends z.ZodTypeAny>(
  storage: Pick<Storage, 'getItem'> | undefined,
  key: string,
  schema: Schema,
  empty: z.infer<Schema>,
  normalise: (value: z.infer<Schema>) => z.infer<Schema> = (value) => value,
): z.infer<Schema> {
  if (!storage) return empty;

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return empty;
  }

  if (raw === null) return empty;
  // Refused unparsed. The cap is shared rather than restated per ledger for the same reason this
  // function is: a reader that forgets it is indistinguishable from one that never had it.
  if (raw.length > MAX_STORED_PAYLOAD_LENGTH) return empty;

  try {
    const decoded: unknown = JSON.parse(raw);
    // Fails closed to empty like every other unreadable ledger here, rather than being accepted
    // with the key quietly removed.
    if (carriesProtoKey(decoded)) return empty;
    const parsed = schema.safeParse(decoded);
    return parsed.success ? normalise(parsed.data) : empty;
  } catch {
    return empty;
  }
}

/**
 * Writes are best-effort. A ledger that cannot be saved must never interrupt play, so a full or
 * denied storage is swallowed rather than raised.
 *
 * Validated on the way out as well as in. That is not redundant: it is what stops a value the
 * merge path should never have produced from being the thing that is on disk next time.
 */
export function writeLedger<Schema extends z.ZodTypeAny>(
  storage: Pick<Storage, 'setItem'> | undefined,
  key: string,
  schema: Schema,
  value: z.infer<Schema>,
): void {
  if (!storage) return;

  const parsed = schema.safeParse(value);
  if (!parsed.success) return;

  try {
    storage.setItem(key, JSON.stringify(parsed.data));
  } catch {
    // Storage full or denied. The game continues; this ledger simply does not update.
  }
}
