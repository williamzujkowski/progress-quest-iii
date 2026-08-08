export type PrimeStat = 'STR' | 'CON' | 'DEX' | 'INT' | 'WIS' | 'CHA';
export type SecondaryStat = 'HP Max' | 'MP Max';
export type StatName = PrimeStat | SecondaryStat;

export interface CharacterTraits {
  Name: string;
  Race: string;
  Class: string;
  Level: number;
}

export type StatsMap = Record<StatName, number>;

export type EquipSlot =
  | 'Weapon'
  | 'Shield'
  | 'Helm'
  | 'Hauberk'
  | 'Brassairts'
  | 'Vambraces'
  | 'Gauntlets'
  | 'Gambeson'
  | 'Cuisses'
  | 'Greaves'
  | 'Sollerets';

export type EquipmentMap = Record<EquipSlot, string>;

export interface InventoryItem {
  name: string;
  qty: number;
}

export interface SpellItem {
  name: string;
  level: number;
}

export interface ProgressTask {
  description: string;
  durationMs: number;
  elapsedMs: number;
  type: 'kill' | 'buying' | 'selling' | 'quest' | 'plot' | 'loading' | 'prologue' | 'cinematic' | 'act_marker' | 'heading_to_market' | 'heading';
  loot?: { type: 'fixed'; item: string } | { type: 'random' } | undefined;
  /**
   * Whether this encounter is the monster the active quest named.
   *
   * `generateMonsterTask` has always biased one kill in four toward the quest's target, and then
   * thrown the fact away — so meeting the named thing advanced the quest by exactly as much as
   * meeting anything else. The game arranged a coincidence and declined to notice it.
   *
   * Optional and only ever set, so a task restored from a save written before this field reads as
   * an ordinary kill rather than as a missing one.
   */
  questTarget?: boolean | undefined;
  /**
   * How many opponents this task is against, where the engine decided a number.
   *
   * Already computed - the encounter's duration is derived from `targetLevel * quantity` - and
   * previously discarded, surviving only as the pluralised noun inside `description`. Exposed so
   * a reader can be told about a multi-opponent pull without anything parsing presentation text.
   *
   * Absent on every task that is not an encounter, and read by nothing in the engine: it is a
   * fact the simulation reports, never one it consults.
   */
  opponents?: number | undefined;
}

export type SequenceTask = Omit<ProgressTask, 'elapsedMs' | 'loot' | 'type'> & {
  elapsedMs: 0;
  type: 'prologue' | 'cinematic' | 'act_marker';
};

export interface NemesisSequenceCursor {
  description: string;
  type: 'nemesis_cursor';
  nemesis: string;
  round: number;
  advantageMod3: number;
  rollLimit: number;
  replayRngState: PRNGState;
}

export type PendingSequenceEntry = SequenceTask | NemesisSequenceCursor;

export interface QuestState {
  description: string;
  currentProgress: number;
  maxProgress: number;
  history?: string[] | undefined;
  kind?: QuestKind | undefined;
  target?: string | undefined;
  targetIndex?: number | undefined;
}

export type QuestKind = 'exterminate' | 'seek' | 'deliver' | 'fetch' | 'placate';

export interface ProgressionState {
  experience: {
    currentSeconds: number;
    maxSeconds: number;
  };
  completedTasks: number;
  elapsedSeconds: number;
}

export interface CharacterSheet {
  Traits: CharacterTraits;
  Stats: StatsMap;
  Equip: EquipmentMap;
  Inventory: InventoryItem[];
  Spells: SpellItem[];
  Gold: number;
  /** Powers of ten shed from Gold once it passes the cap. Absent on sheets written before ADR 0009. */
  GoldDecades?: number | undefined;
  Plot: {
    act: number;
    currentProgress: number;
    maxProgress: number;
  };
  Quest: QuestState;
  Task: ProgressTask;
  PendingTasks?: PendingSequenceEntry[] | undefined;
}
import type { PRNGState } from './prng';
