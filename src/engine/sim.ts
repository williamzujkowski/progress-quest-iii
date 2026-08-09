import { encounterSpeedMultiplier, loadoutQuality } from './loadout';
import { armourNameForSlot } from '../data/armourBySlot';
import { ALL_STATS, ARMORS, BORING_ITEMS, DEFENSE_ATTRIB, DEFENSE_BAD, EQUIP_SLOTS, ITEM_ATTRIB, ITEM_OFS, KLASSES, MONSTERS, OFFENSE_ATTRIB, OFFENSE_BAD, PRIME_STATS, RACES, SHIELDS, SPECIALS, SPELLS, TITLES, WEAPONS } from '../data/traits';
import { MAX_PERSISTED_GOLD, MAX_PERSISTED_ITEMS, MAX_PERSISTED_VALUE } from '../data/limits';
import { storageAllowance } from './storage';
import { calculateEncumbranceMax, generateInitialStats, generateName, MAX_FINITE_CHARACTER_LEVEL } from './math';
import { RandomGenerator, type PRNGSeed } from './prng';
import { definite, indefinite } from './text';
import type { CharacterSheet, EquipSlot, InventoryItem, ProgressTask, SpellItem, StatName, StatsMap } from './types';

const NAME_PARTS_1 = ['Brog', 'Grim', 'Kael', 'Thor', 'Zar', 'Vex', 'Gor', 'Drak', 'Thul', 'Borg', 'Loth', 'Morg', 'Fizz', 'Wiz', 'Snag'];
const NAME_PARTS_2 = ['nar', 'gath', 'dor', 'karn', 'rak', 'mar', 'vark', 'zog', 'thor', 'bluff', 'sout', 'fang', 'jaw', 'beard', 'gorm'];

export function generateRandomName(rng?: RandomGenerator): string {
  const r = rng || new RandomGenerator(Date.now());
  return r.pick(NAME_PARTS_1) + r.pick(NAME_PARTS_2);
}

export function equipPrice(level: number): number {
  return 5 * level * level + 10 * level + 20;
}

export function createNewCharacter(name: string, race: string, klass: string, seed?: PRNGSeed | RandomGenerator): CharacterSheet {
  const rng = seed instanceof RandomGenerator ? seed : new RandomGenerator(seed ?? (name + Date.now()));
  const stats = generateInitialStats(rng, race, klass);

  const initialEquip: Record<EquipSlot, string> = {
    Weapon: 'Stick',
    Shield: '',
    Helm: '',
    Hauberk: '-3 Burlap',
    Brassairts: '',
    Vambraces: '',
    Gauntlets: '',
    Gambeson: '',
    Cuisses: '',
    Greaves: '',
    Sollerets: '',
  };

  return {
    Traits: {
      Name: name,
      Race: race,
      Class: klass,
      Level: 1,
    },
    Stats: stats,
    Equip: initialEquip,
    Inventory: [
      { name: 'Gold', qty: 0 },
    ],
    Spells: [],
    Gold: 0,
    Plot: {
      act: 0,
      currentProgress: 0,
      maxProgress: 26,
    },
    Quest: {
      description: 'Heading to the killing fields...',
      currentProgress: 0,
      maxProgress: 1,
    },
    Task: {
      description: 'Loading....',
      durationMs: 2000,
      elapsedMs: 0,
      type: 'loading',
    },
    PendingTasks: [
      { description: 'Experiencing an enigmatic and foreboding night vision', durationMs: 10_000, elapsedMs: 0, type: 'prologue' },
      { description: "Much is revealed about that wise old bastard you'd underestimated", durationMs: 6000, elapsedMs: 0, type: 'prologue' },
      { description: 'A shocking series of events leaves you alone and bewildered, but resolute', durationMs: 6000, elapsedMs: 0, type: 'prologue' },
      { description: 'Drawing upon an unrealized reserve of determination, you set out on a long and dangerous journey', durationMs: 4000, elapsedMs: 0, type: 'prologue' },
      { description: 'Loading', durationMs: 2000, elapsedMs: 0, type: 'act_marker' },
    ],
  };
}

export function calculateEncumbrance(inventory: InventoryItem[]): number {
  let count = 0;
  for (const item of inventory) {
    if (item.name !== 'Gold') {
      count += item.qty;
    }
  }
  return count;
}

export function addInventoryItem(inventory: InventoryItem[], name: string): { inventory: InventoryItem[]; added: boolean } {
  const existingIndex = inventory.findIndex((item) => item.name === name);
  const existing = inventory[existingIndex];
  if (existing) {
    if (existing.qty >= MAX_PERSISTED_VALUE) return { inventory, added: false };
    return {
      inventory: inventory.map((item, index) => index === existingIndex ? { ...item, qty: item.qty + 1 } : item),
      added: true,
    };
  }
  if (inventory.length >= MAX_PERSISTED_ITEMS) return { inventory, added: false };
  return { inventory: [...inventory, { name, qty: 1 }], added: true };
}

function getRandomMonster(rng: RandomGenerator, level: number) {
  let result = rng.pick(MONSTERS);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = rng.pick(MONSTERS);
    if (Math.abs(level - candidate.level) < Math.abs(level - result.level)) result = candidate;
  }
  return result;
}

export function generateExterminateQuest(rng: RandomGenerator, level: number): {
  kind: 'exterminate';
  description: string;
  target: string;
  targetIndex: number;
} {
  let targetIndex = rng.random(MONSTERS.length);
  let target = MONSTERS[targetIndex];
  if (!target) throw new RangeError('Monster table is empty');
  for (let attempt = 1; attempt < 4; attempt += 1) {
    const candidateIndex = rng.random(MONSTERS.length);
    const candidate = MONSTERS[candidateIndex];
    if (candidate && Math.abs(level - candidate.level) < Math.abs(level - target.level)) {
      target = candidate;
      targetIndex = candidateIndex;
    }
  }
  return {
    kind: 'exterminate',
    description: `Exterminate ${definite(target.name, 2)}`,
    target: `${target.name}|${target.level}|${target.item}`,
    targetIndex,
  };
}

export function generateSeekQuest(rng: RandomGenerator) {
  const target = `${rng.pick(ITEM_ATTRIB)} ${rng.pick(SPECIALS)}`;
  return { kind: 'seek' as const, description: `Seek ${definite(target)}` };
}

export function generateDeliverQuest(rng: RandomGenerator) {
  const target = rng.pick(BORING_ITEMS);
  return { kind: 'deliver' as const, description: `Deliver this ${target}` };
}

export function generateFetchQuest(rng: RandomGenerator) {
  const target = rng.pick(BORING_ITEMS);
  return { kind: 'fetch' as const, description: `Fetch me ${indefinite(target)}` };
}

export function generatePlacateQuest(rng: RandomGenerator, level: number) {
  let target = rng.pick(MONSTERS);
  const candidate = rng.pick(MONSTERS);
  if (Math.abs(level - candidate.level) < Math.abs(level - target.level)) target = candidate;
  return { kind: 'placate' as const, description: `Placate ${definite(target.name, 2)}` };
}

export function generateQuest(rng: RandomGenerator, level: number) {
  switch (rng.random(5)) {
    case 0: return generateExterminateQuest(rng, level);
    case 1: return generateSeekQuest(rng);
    case 2: return generateDeliverQuest(rng);
    case 3: return generateFetchQuest(rng);
    case 4: return generatePlacateQuest(rng, level);
    default: throw new RangeError('Quest branch is outside the legacy table');
  }
}

export type QuestRewardKind = 'spell' | 'equipment' | 'stat' | 'item';
export type QuestRewardEffect =
  | { type: 'equipment'; slot: EquipSlot; name: string }
  | { type: 'stat'; stat: StatName; amount: number }
  | { type: 'item'; name: string; quantity: number }
  | { type: 'gold'; amount: number };

export function selectQuestReward(rng: RandomGenerator): QuestRewardKind {
  return rng.pick(['spell', 'equipment', 'stat', 'item'] as const);
}

export function generateSpellReward(rng: RandomGenerator, level: number, wisdom: number): string | undefined {
  const limit = Math.min(wisdom + level, SPELLS.length);
  if (!Number.isInteger(limit) || limit <= 0) return undefined;
  const spellName = SPELLS[Math.min(rng.random(limit), rng.random(limit))];
  return spellName;
}

export function applySpellReward(rng: RandomGenerator, level: number, wisdom: number, spells: SpellItem[]): SpellItem[] {
  const spellName = generateSpellReward(rng, level, wisdom);
  if (!spellName) return spells;
  const existing = spells.find((spell) => spell.name === spellName);
  return existing
    ? spells.map((spell) => spell.name === spellName ? { ...spell, level: Math.min(MAX_PERSISTED_VALUE, spell.level + 1) } : spell)
    : spells.length < MAX_PERSISTED_ITEMS ? [...spells, { name: spellName, level: 1 }] : spells;
}

export function generateStatReward(rng: RandomGenerator, stats: StatsMap): keyof StatsMap {
  if (rng.random(2) < 1) return rng.pick(ALL_STATS);
  let roll = rng.random(PRIME_STATS.reduce((total, stat) => total + Math.trunc(stats[stat]) ** 2, 0));
  for (const stat of PRIME_STATS) {
    roll -= Math.trunc(stats[stat]) ** 2;
    if (roll < 0) return stat;
  }
  return PRIME_STATS.at(-1) ?? 'STR';
}

export function generateItemReward(rng: RandomGenerator, inventoryNames: readonly string[]): string {
  if (Math.max(250, rng.random(999)) < inventoryNames.length) {
    const existing = inventoryNames[rng.random(inventoryNames.length)];
    if (existing !== undefined) return existing;
  }
  return `${rng.pick(ITEM_ATTRIB)} ${rng.pick(SPECIALS)} of ${rng.pick(ITEM_OFS)}`;
}

/**
 * How many of the modifiers that fit a character are worth drawing between.
 *
 * Four, and the number is doing one job: keeping the answer from being a foregone conclusion. Drawn
 * from the grandest that fit, so a hero of standing reads as one — but always the single grandest
 * would make every item at a given level carry the same word, which is a ladder rather than a
 * wardrobe.
 */
const MODIFIER_WINDOW = 4;

/**
 * The tables as ladders, sorted by how much they are worth rather than by when they were written.
 *
 * Sorted copies rather than sorted sources. `WEAPONS`, `SHIELDS`, `ARMORS` and `OFFENSE_ATTRIB`
 * ascend already and are asserted to; the other three modifier tables deliberately do not, and that
 * ordering is fidelity to the original build which `traitTables` exists to protect. The draw needs a
 * ladder, so it builds one here and leaves the record alone.
 *
 * By magnitude, so the good and bad tables sort the same way — the bad table's values are negative
 * and "grander" there means further from zero.
 *
 * Hoisted, because these are static and `generateEquipUpgrade` runs on every equipment reward.
 */
const LADDERS = new WeakMap<readonly [string, number][], readonly [string, number][]>();

function ladderFor(table: [string, number][]): readonly [string, number][] {
  const cached = LADDERS.get(table);
  if (cached) return cached;
  const sorted = [...table].sort(([, left], [, right]) => Math.abs(left) - Math.abs(right));
  LADDERS.set(table, sorted);
  return sorted;
}

/**
 * A modifier the character can actually carry, drawn from the grand end of what fits.
 *
 * The old draw was `rng.pick(better)` — uniform over the whole table — followed by a break when the
 * value did not fit inside the remaining shortfall. Two things were wrong with that, and only the
 * second is obvious.
 *
 * The obvious one: a level-200 hero was exactly as likely to draw `Vetted` (+1) as `Ratified` (+7).
 * Measured over 4 000 items per level, the mean modifier value flatlined at +2.82 from level 60 all
 * the way to 200, and the three most common modifiers at 200 were the same three as at 60. The
 * vocabulary stopped saying anything about the character wearing it, and the shortfall it failed to
 * absorb went into the assessor's mark instead — mean |mark| 4.4 at level 25, 174 at level 200. A
 * late item was a large integer with two decorative words attached.
 *
 * The less obvious one: drawing something too large did not retry, it ended the loop. So a slot was
 * lost to an unlucky draw rather than filled with something smaller, which is why two thirds of
 * level-2 items carried no modifier at all.
 *
 * The fix needs no level curve of its own, and that is the point. `plus` is already the shortfall
 * between the base and the character, so "what fits" is already a level-appropriate question — the
 * ramp was there in the arithmetic and the uniform draw was throwing it away. This selects among the
 * entries that fit, from the top, and the range that fits grows with the character on its own.
 *
 * One draw, exactly as before. Null when nothing fits, which is the honest end of the loop.
 */
function drawModifier(
  rng: RandomGenerator,
  table: [string, number][],
  plus: number,
): readonly [string, number] | null {
  const ladder = ladderFor(table);
  // Ascending by magnitude, so everything that fits is a prefix and the grand end of it is the tail.
  let fits = 0;
  while (fits < ladder.length && Math.abs(ladder[fits]![1]) <= Math.abs(plus)) fits += 1;
  if (fits === 0) return null;

  const low = Math.max(0, fits - MODIFIER_WINDOW);
  return ladder[low + rng.random(fits - low)]!;
}

export function generateEquipUpgrade(rng: RandomGenerator, level: number): { slot: EquipSlot; name: string } {
  const slot = rng.pick(EQUIP_SLOTS);
  let stuff: [string, number][];
  let better: [string, number][];
  let worse: [string, number][];

  if (slot === 'Weapon') {
    stuff = WEAPONS;
    better = OFFENSE_ATTRIB;
    worse = OFFENSE_BAD;
  } else if (slot === 'Shield') {
    stuff = SHIELDS;
    better = DEFENSE_ATTRIB;
    worse = DEFENSE_BAD;
  } else {
    stuff = ARMORS;
    better = DEFENSE_ATTRIB;
    worse = DEFENSE_BAD;
  }

  // Index rather than name, so the slot can rename what the draw chose without changing the draw.
  // `rng.pick` consumes one value and returns a position; the quality at that position drives every
  // figure below, and renaming afterwards leaves all of it identical.
  // `rng.random(n)` is exactly what `pick` calls internally, so this is the same single draw and
  // the same sequence — it simply keeps the position instead of discarding it.
  let index = rng.random(stuff.length);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = rng.random(stuff.length);
    if (Math.abs(level - stuff[index]![1]) > Math.abs(level - stuff[candidate]![1])) index = candidate;
  }
  let quality = stuff[index]![1];
  let name = slot === 'Weapon' || slot === 'Shield' ? stuff[index]![0] : armourNameForSlot(slot, index);

  let plus = level - quality;
  if (plus < 0) better = worse;
  for (let count = 0; count < 2 && plus !== 0; count += 1) {
    const drawn = drawModifier(rng, better, plus);
    // Nothing in the table is small enough to fit inside the remaining shortfall. Previously this
    // was the same `break` as a duplicate, reached by drawing something too large — see the note on
    // `drawModifier` for why that mattered.
    if (drawn === null) break;
    const [modifier, value] = drawn;
    if (name.includes(modifier)) break;
    name = `${modifier} ${name}`;
    plus -= value;
  }
  if (plus !== 0) name = `${plus} ${name}`;
  if (plus > 0) name = `+${name}`;

  return { slot, name };
}

export function applyQuestReward(rng: RandomGenerator, character: CharacterSheet): {
  kind: QuestRewardKind;
  character: CharacterSheet;
  effect?: QuestRewardEffect;
} {
  const kind = selectQuestReward(rng);
  if (kind === 'spell') {
    const spells = applySpellReward(rng, character.Traits.Level, character.Stats.WIS, character.Spells);
    return { kind, character: { ...character, Spells: spells } };
  }
  if (kind === 'equipment') {
    const upgrade = generateEquipUpgrade(rng, character.Traits.Level);
    return {
      kind,
      character: { ...character, Equip: { ...character.Equip, [upgrade.slot]: upgrade.name } },
      effect: { type: 'equipment', ...upgrade },
    };
  }
  if (kind === 'stat') {
    const stat = generateStatReward(rng, character.Stats);
    const value = Math.min(MAX_PERSISTED_VALUE, Math.trunc(character.Stats[stat]) + 1);
    const effect = value !== character.Stats[stat] ? { type: 'stat' as const, stat, amount: value - character.Stats[stat] } : undefined;
    return {
      kind,
      character: { ...character, Stats: { ...character.Stats, [stat]: value } },
      ...(effect ? { effect } : {}),
    };
  }

  const itemName = generateItemReward(rng, [
    'Gold',
    ...character.Inventory.filter(({ name }) => name !== 'Gold').map(({ name }) => name),
  ]);
  if (itemName === 'Gold') {
    const gold = Math.min(MAX_PERSISTED_GOLD, character.Gold + 1);
    const effect = gold > character.Gold ? { type: 'gold' as const, amount: gold - character.Gold } : undefined;
    return {
      kind,
      character: { ...character, Gold: gold },
      ...(effect ? { effect } : {}),
    };
  }
  const { inventory, added } = addInventoryItem(character.Inventory, itemName);
  const effect = added ? { type: 'item' as const, name: itemName, quantity: 1 } : undefined;
  return {
    kind,
    character: { ...character, Inventory: inventory },
    ...(effect ? { effect } : {}),
  };
}

/**
 * Every word the engine puts in front of a monster's name.
 *
 * Exported so the content guard can read them rather than keep a copy. They are shipped strings a
 * player sees on every kill, they sit here rather than in `src/data/`, and no content test looked at
 * them until one did — at which point the only way to check them was to duplicate the list, which is
 * the failure mode that guard exists to catch.
 *
 * Also the last vocabulary in the game inherited rather than rewritten: high-fantasy register in a
 * compute-industrial world. Worth knowing about separately from whether it names anything real.
 */
export const MONSTER_PREFIXES = {
  sick: ['dead', 'comatose', 'crippled', 'sick', 'undernourished'],
  young: ['foetal', 'baby', 'preadolescent', 'teenage', 'underage'],
  big: ['greater', 'massive', 'enormous', 'giant', 'titanic'],
  special: ['veteran', 'cursed', 'warrior', 'undead', 'demon'],
  /** The same five, joined without a space for a single-word creature. */
  specialJoined: ['Battle-', 'cursed ', 'Were-', 'undead ', 'demon '],
  /** Applied whole rather than by magnitude, at the two ends of the range. */
  remote: ['imaginary', 'messianic'],
} as const;

function generateMonsterTask(rng: RandomGenerator, character: CharacterSheet): { description: string; durationMs: number; loot: NonNullable<ProgressTask['loot']>; opponents: number; questTarget?: true } {
  const characterLevel = character.Traits.Level;
  let targetLevel = characterLevel;
  // ponytail: levels beyond finite progression get the last finite level's legacy roll budget.
  for (let step = Math.min(targetLevel, MAX_FINITE_CHARACTER_LEVEL); step >= 1; step -= 1) {
    if (rng.random(5) < 2) targetLevel += rng.random(2) * 2 - 1;
  }
  targetLevel = Math.max(1, targetLevel);

  let definiteName = false;
  let isQuestTarget = false;
  const questMonster = character.Quest.targetIndex === undefined ? undefined : MONSTERS[character.Quest.targetIndex];
  const validQuestTarget = character.Quest.kind === 'exterminate'
    && questMonster !== undefined
    && character.Quest.target === `${questMonster.name}|${questMonster.level}|${questMonster.item}`;
  let monster: (typeof MONSTERS)[number];
  if (rng.random(25) === 0) {
    const race = rng.pick(RACES).name;
    if (rng.random(2) === 0) {
      monster = { name: `passing ${race} ${rng.pick(KLASSES).name}`, level: targetLevel, item: '*' };
    } else {
      const title = TITLES[Math.min(rng.random(TITLES.length), rng.random(TITLES.length))];
      monster = { name: `${title} ${generateName(rng)} the ${race}`, level: targetLevel, item: '*' };
      definiteName = true;
    }
  } else {
    // Already decided here, and until now thrown away. The bias exists so the hero sometimes meets
    // the thing the quest named; carrying the fact forward is what lets the quest notice.
    const takesQuestTarget = validQuestTarget && rng.random(4) === 0;
    monster = takesQuestTarget ? questMonster : getRandomMonster(rng, targetLevel);
    isQuestTarget = takesQuestTarget;
  }
  let quantity = 1;
  if (targetLevel - monster.level > 10) {
    const divisor = Math.max(monster.level, 1);
    quantity = Math.max(1, Math.floor((targetLevel + rng.random(divisor)) / divisor));
    targetLevel = Math.floor(targetLevel / quantity);
  }

  const prefix = (values: readonly string[], magnitude: number, name: string, separator = ' ') => {
    const value = values[Math.abs(magnitude) - 1];
    return value ? `${value}${separator}${name}` : name;
  };
  const sick = (magnitude: number, name: string) => prefix(MONSTER_PREFIXES.sick, 6 - Math.abs(magnitude), name);
  const young = (magnitude: number, name: string) => prefix(MONSTER_PREFIXES.young, 6 - Math.abs(magnitude), name);
  const big = (magnitude: number, name: string) => prefix(MONSTER_PREFIXES.big, magnitude, name);
  const special = (magnitude: number, name: string) => name.includes(' ')
    ? prefix(MONSTER_PREFIXES.special, magnitude, name)
    : prefix(MONSTER_PREFIXES.specialJoined, magnitude, name, '');

  let displayName = monster.name;
  const difference = targetLevel - monster.level;
  if (difference <= -10) displayName = `${MONSTER_PREFIXES.remote[0]} ${displayName}`;
  else if (difference < -5) {
    const sickMagnitude = 5 - rng.random(11 + difference);
    displayName = sick(sickMagnitude, young(-difference - sickMagnitude, displayName));
  } else if (difference < 0 && rng.random(2) === 1) displayName = sick(difference, displayName);
  else if (difference < 0) displayName = young(difference, displayName);
  else if (difference >= 10) displayName = `${MONSTER_PREFIXES.remote[1]} ${displayName}`;
  else if (difference > 5) {
    const bigMagnitude = 5 - rng.random(11 - difference);
    displayName = big(bigMagnitude, special(difference - bigMagnitude, displayName));
  } else if (difference > 0 && rng.random(2) === 1) displayName = big(difference, displayName);
  else if (difference > 0) displayName = special(difference, displayName);

  const opponentLevel = targetLevel * quantity;
  return {
    description: `Executing ${definiteName ? displayName : indefinite(displayName, quantity)}...`,
    // Canonical duration first, then the loadout. Kept in that order so the classic formula stays
    // legible as itself: opponent puissance over character level, exactly as the original computed
    // it, with this build's one divergence applied to the result rather than folded into it.
    //
    // A starting loadout floors to zero quality and multiplies by exactly one, which is why every
    // recorded golden is unchanged rather than merely close. See ADR 0008.
    durationMs: Math.floor(
      ((2 * 3 * opponentLevel * 1000) / characterLevel) * encounterSpeedMultiplier(loadoutQuality(character)),
    ),
    // Reported at the site that decided it. Nothing downstream recomputes it, and nothing in the
    // engine reads it back - the duration above is still derived from the same local value.
    opponents: quantity,
    loot: monster.item === '*'
      ? { type: 'random' }
      : { type: 'fixed', item: `${monster.name} ${monster.item}`.toLowerCase() },
    // Only ever set, never cleared, so a task that predates the field reads as an ordinary kill.
    ...(isQuestTarget ? { questTarget: true as const } : {}),
  };
}

export function generateTaskDescription(rng: RandomGenerator, character: CharacterSheet): { description: string; type: ProgressTask['type']; durationMs: number; loot?: ProgressTask['loot']; opponents?: number; questTarget?: true } {
  const encum = calculateEncumbrance(character.Inventory);
  const maxEncum = calculateEncumbranceMax(character.Stats.STR, storageAllowance(character.Equip));
  const price = equipPrice(character.Traits.Level);

  if (encum >= maxEncum) {
    return {
      description: 'Heading to market to sell loot...',
      type: 'heading_to_market',
      durationMs: 4000,
    };
  }

  if (character.Gold > price) {
    return {
      description: 'Negotiating purchase of better equipment...',
      type: 'buying',
      durationMs: 5000,
    };
  }

  const monster = generateMonsterTask(rng, character);
  return {
    description: monster.description,
    type: 'kill',
    durationMs: monster.durationMs,
    loot: monster.loot,
    ...(monster.questTarget ? { questTarget: true as const } : {}),
    // Rebuilt field by field here rather than spread, so a new fact has to be threaded through
    // deliberately - which is why the count reached the task only after this line was added.
    opponents: monster.opponents,
  };
}
