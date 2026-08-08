import { z } from './zod';

import { MAX_PENDING_ELAPSED_MS, MAX_PENDING_TASKS, MAX_PERSISTED_DESCRIPTION_LENGTH, MAX_PERSISTED_GOLD, MAX_PERSISTED_ITEMS, MAX_PERSISTED_VALUE } from '../data/limits';

export { MAX_PERSISTED_ITEMS } from '../data/limits';
export const MAX_CHARACTER_NAME_LENGTH = 120;

/**
 * Code points a saved name may not contain, whatever its length.
 *
 * Every name this game displays it also generated, from fixed tables of ordinary words, so none of
 * these can arrive by playing. They arrive by import, which is the one attacker-controlled route
 * into the state, and length was the only thing the boundary checked.
 *
 * The C0 and C1 ranges because a control character in a name reaches the DOM as one. The bidi
 * formatting characters because U+202E reverses the rest of the line it lands in — an item name is
 * interpolated into guild chatter and printed on the world console, so one of them in a saved
 * loadout rewrites text the player never typed. React escapes markup; it does not escape these.
 * Written as a predicate over code points rather than a character class, because a regex that
 * matches control characters is exactly what `no-control-regex` exists to flag, and the rule fires
 * whether the class is spelled with literals or with escapes. Suppressing it would have been the
 * wrong way round: the lint is right that a control character in a pattern is worth a second look,
 * and the ranges read better named than packed into brackets.
 */
const isForbiddenCodePoint = (point: number): boolean =>
  point <= 0x1f // C0 controls
  || (point >= 0x7f && point <= 0x9f) // delete and the C1 controls
  || point === 0x200e || point === 0x200f // left-to-right and right-to-left marks
  || (point >= 0x202a && point <= 0x202e) // the embedding and override run, U+202E among them
  || (point >= 0x2066 && point <= 0x2069); // the isolates

const isUnrenderable = (value: string): boolean => {
  // Iterated by code point rather than by UTF-16 unit, so an astral character is never split into
  // surrogates and mistaken for something in a forbidden range.
  for (const character of value) {
    if (isForbiddenCodePoint(character.codePointAt(0) ?? 0)) return true;
  }
  return false;
};

/**
 * Rejects rather than strips.
 *
 * Stripping would silently rewrite what the player imported and then persist the rewrite, which is
 * the shape of a data loss: the next save writes the edited bytes back over the original. Refusing
 * the read leaves the file alone and takes the path this app already has for a save it cannot
 * parse, which blocks automatic writes rather than overwriting anything.
 */
const readableText = <T extends z.ZodType<string>>(schema: T) =>
  schema.refine((value) => !isUnrenderable(value), {
    message: 'Text may not contain control or bidirectional formatting characters.',
  });

const shortText = readableText(z.string().max(200));
const description = readableText(z.string().max(MAX_PERSISTED_DESCRIPTION_LENGTH));
const boundedInteger = z.number().int().min(0).max(MAX_PERSISTED_VALUE);
const positiveBoundedInteger = z.number().int().positive().max(MAX_PERSISTED_VALUE);
const boundedNumber = z.number().min(0).max(MAX_PERSISTED_VALUE);
const positiveBoundedNumber = z.number().positive().max(MAX_PERSISTED_VALUE);
const aleaFraction = z.number().min(0).lt(1).refine((value) => Number.isInteger(value * 0x1_0000_0000), {
  message: 'Alea fractions must align to 32-bit state.',
});
const rngStateSchema = z.tuple([
  aleaFraction,
  aleaFraction,
  aleaFraction,
  z.number().int().min(0).max(2_091_638),
]);

export const characterNameSchema = readableText(z.string().min(1).max(MAX_CHARACTER_NAME_LENGTH));

const characterTraitsSchema = z.object({
  Name: characterNameSchema,
  Race: readableText(z.string().min(1).max(120)),
  Class: readableText(z.string().min(1).max(120)),
  Level: z.number().int().min(1).max(MAX_PERSISTED_VALUE),
}).strict();

const statsMapSchema = z.object({
  STR: positiveBoundedInteger,
  CON: positiveBoundedInteger,
  DEX: positiveBoundedInteger,
  INT: positiveBoundedInteger,
  WIS: positiveBoundedInteger,
  CHA: positiveBoundedInteger,
  'HP Max': positiveBoundedNumber,
  'MP Max': positiveBoundedNumber,
}).strict();

const equipmentMapSchema = z.object({
  Weapon: shortText,
  Shield: shortText,
  Helm: shortText,
  Hauberk: shortText,
  Brassairts: shortText,
  Vambraces: shortText,
  Gauntlets: shortText,
  Gambeson: shortText,
  Cuisses: shortText,
  Greaves: shortText,
  Sollerets: shortText,
}).strict();

const inventoryItemSchema = z.object({
  name: shortText,
  qty: boundedInteger,
}).strict();

const spellItemSchema = z.object({
  name: shortText,
  level: z.number().int().min(1).max(MAX_PERSISTED_VALUE),
}).strict();

const questStateSchema = z.object({
  description,
  currentProgress: boundedNumber,
  maxProgress: positiveBoundedNumber,
  history: z.array(description).max(100).optional(),
  kind: z.enum(['exterminate', 'seek', 'deliver', 'fetch', 'placate']).optional(),
  target: readableText(z.string().min(1).max(200)).optional(),
  targetIndex: boundedInteger.optional(),
}).strict().refine(({ currentProgress, maxProgress }) => currentProgress <= maxProgress, {
  message: 'Quest progress cannot exceed its maximum.',
  path: ['currentProgress'],
});

const plotStateSchema = z.object({
  act: z.number().int().min(0).max(MAX_PERSISTED_VALUE),
  currentProgress: boundedNumber,
  maxProgress: positiveBoundedNumber,
}).strict().refine(({ currentProgress, maxProgress }) => currentProgress <= maxProgress, {
  message: 'Plot progress cannot exceed its maximum.',
  path: ['currentProgress'],
});

export const progressTaskSchema = z.object({
  description,
  durationMs: z.number().min(1).max(86_400_000),
  elapsedMs: z.number().min(0).max(86_400_000),
  type: z.enum(['kill', 'buying', 'selling', 'quest', 'plot', 'loading', 'prologue', 'cinematic', 'act_marker', 'heading_to_market', 'heading']),
  loot: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixed'), item: readableText(z.string().min(1).max(200)) }).strict(),
    z.object({ type: z.literal('random') }).strict(),
  ]).optional(),
  // Optional so a checkpoint written before the field still restores, and bounded by the same
  // ceiling every other persisted figure uses. A tighter, more plausible-looking bound was tried
  // first and rejected a character the engine can legitimately produce: at the maximum level the
  // count reaches hundreds of millions, because it is derived from the level. The bound is here
  // to keep a hostile save finite, not to express an opinion about crowd sizes.
  opponents: z.number().int().min(1).max(MAX_PERSISTED_VALUE).optional(),
  // Optional, so a checkpoint written before the field still restores. Absent reads as an ordinary
  // kill, which is the safe direction: the worst a lost marker costs is one quest tick.
  questTarget: z.boolean().optional(),
}).strict().refine(({ durationMs, elapsedMs }) => elapsedMs <= durationMs, {
  message: 'Task elapsed time cannot exceed its duration.',
  path: ['elapsedMs'],
});

const sequenceTaskSchema = z.object({
  description,
  durationMs: z.number().int().min(1).max(86_400_000),
  elapsedMs: z.literal(0),
  type: z.enum(['prologue', 'cinematic', 'act_marker']),
}).strict();

const nemesisSequenceCursorSchema = z.object({
  description,
  type: z.literal('nemesis_cursor'),
  nemesis: shortText,
  round: z.number().int().min(MAX_PENDING_TASKS - 4).max(MAX_PERSISTED_VALUE + 2),
  advantageMod3: z.number().int().min(0).max(2),
  rollLimit: z.number().int().min(2).max(MAX_PERSISTED_VALUE + 2),
  replayRngState: rngStateSchema,
}).strict().refine(({ round, rollLimit }) => round <= rollLimit, {
  message: 'A nemesis cursor round cannot exceed its roll limit.',
  path: ['round'],
});

const pendingTasksSchema = z.array(z.union([sequenceTaskSchema, nemesisSequenceCursorSchema])).min(1).max(MAX_PENDING_TASKS).superRefine((tasks, context) => {
  const markerIndexes = tasks.flatMap((task, index) => task.type === 'act_marker' ? [index] : []);
  if (markerIndexes.length !== 1 || markerIndexes[0] !== tasks.length - 1) {
    context.addIssue({ code: 'custom', message: 'Pending tasks require exactly one final Act marker.' });
  }
  if (tasks.filter(({ type }) => type === 'nemesis_cursor').length > 1) context.addIssue({ code: 'custom', message: 'Pending tasks may contain at most one nemesis cursor.' });
});

/** The exact, recursively strict, unversioned modern PQW v0 compatibility profile. */
export const characterSheetSchema = z.object({
  Traits: characterTraitsSchema,
  Stats: statsMapSchema,
  Equip: equipmentMapSchema,
  Inventory: z.array(inventoryItemSchema).max(MAX_PERSISTED_ITEMS),
  Spells: z.array(spellItemSchema).max(MAX_PERSISTED_ITEMS),
  Gold: z.number().min(0).max(MAX_PERSISTED_GOLD),
  /**
   * How many powers of ten the gold figure has shed.
   *
   * Gold used to stop at MAX_PERSISTED_GOLD, which is a cap rather than an ending — the number
   * simply froze and the game carried on. It now sheds a decade instead of saturating, so it keeps
   * growing while the value the engine adds to stays bounded and exact. See ADR 0009.
   *
   * Optional and defaulting to zero, so every save written before this reads back as the number it
   * always was. Nothing needs migrating.
   */
  GoldDecades: z.number().int().min(0).max(MAX_PERSISTED_VALUE).optional(),
  Plot: plotStateSchema,
  Quest: questStateSchema,
  Task: progressTaskSchema,
  PendingTasks: pendingTasksSchema.optional(),
}).strict().refine(({ Inventory }) => new Set(Inventory.map(({ name }) => name)).size === Inventory.length, {
  message: 'Inventory item names must be unique.',
  path: ['Inventory'],
}).superRefine(({ PendingTasks, Plot, Task }, context) => {
  if (!PendingTasks) return;
  const sequenceEntries = PendingTasks.slice(0, -1);
  const validPrologue = Plot.act === 0
    && (Task.type === 'loading' || Task.type === 'prologue')
    && sequenceEntries.every(({ type }) => type === 'prologue');
  const validCinematic = Plot.act > 0
    && Task.type === 'cinematic'
    && sequenceEntries.every(({ type }) => type === 'cinematic' || type === 'nemesis_cursor');
  if (!validPrologue && !validCinematic) {
    context.addIssue({ code: 'custom', message: 'Pending tasks must match the active Act phase.', path: ['PendingTasks'] });
  }
  const cursor = PendingTasks.find(({ type }) => type === 'nemesis_cursor');
  if (cursor?.type === 'nemesis_cursor' && cursor.rollLimit !== Plot.act + 2) {
    context.addIssue({ code: 'custom', message: 'A nemesis cursor roll limit must match its Act.', path: ['PendingTasks'] });
  }
});

export type PersistedCharacterSheet = z.infer<typeof characterSheetSchema>;

export const activeCheckpointV1Schema = z.object({
  schemaVersion: z.literal(1),
  session: z.object({
    character: characterSheetSchema,
    rngState: rngStateSchema,
    progression: z.object({
      experience: z.object({
        currentSeconds: z.number().finite().min(0),
        maxSeconds: z.number().finite().positive(),
      }).strict().refine(({ currentSeconds, maxSeconds }) => currentSeconds <= maxSeconds, {
        message: 'Experience progress cannot exceed its maximum.',
        path: ['currentSeconds'],
      }),
      completedTasks: boundedInteger,
      elapsedSeconds: boundedInteger,
    }).strict(),
    pendingElapsedMs: z.number().finite().min(0).max(MAX_PENDING_ELAPSED_MS).default(0),
    // Wall-clock, written when the checkpoint is saved, so a reopened app can credit the time
    // it was closed. Optional: checkpoints written before this existed simply credit nothing,
    // which is the behaviour they already had. It is never read by the engine - only at the
    // load boundary, converted once into elapsed milliseconds.
    savedAtMs: z.number().finite().min(0).optional(),
    isPaused: z.boolean(),
    log: z.array(description).max(50),
  }).strict(),
}).strict().superRefine(({ session }, context) => {
  const cursor = session.character.PendingTasks?.find(({ type }) => type === 'nemesis_cursor');
  if (cursor?.type === 'nemesis_cursor' && cursor.replayRngState.some((value, index) => value !== session.rngState[index])) {
    context.addIssue({ code: 'custom', message: 'A nemesis cursor must match the checkpoint RNG continuation.', path: ['session', 'rngState'] });
  }
});

export type ActiveCheckpointV1 = z.infer<typeof activeCheckpointV1Schema>;
