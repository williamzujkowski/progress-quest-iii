import { addInventoryItem, applyQuestReward, applySpellReward, calculateEncumbrance, equipPrice, generateEquipUpgrade, generateItemReward, generateQuest, generateStatReward, generateTaskDescription } from './sim';
import { BORING_ITEMS, IMPRESSIVE_TITLES, MONSTERS, RACES } from '../data/traits';
import { MAX_PENDING_TASKS, MAX_PERSISTED_DESCRIPTION_LENGTH, MAX_PERSISTED_GOLD, MAX_PERSISTED_VALUE } from '../data/limits';
import { earnGold, goldEarnedBetween, spendGold } from './gold';
import { storageAllowance } from './storage';
import { marketFavour } from './marketFavour';
import { clawbackPerMille } from './clawback';
import { bulkStacks } from './bulkDisposal';
import { hagglingFavour, nimbleStacks } from './heroAptitude';
import { vitalsFlourish } from './vitalsFlourish';
import { calculateEncumbranceMax, generateName, levelUpTime } from './math';
import type { RandomGenerator } from './prng';
import { formatGameNumber, indefinite, plural } from './text';
import type { CharacterSheet, EquipSlot, NemesisSequenceCursor, PendingSequenceEntry, ProgressionState, ProgressTask, QuestKind, QuestState, SequenceTask, SpellItem, StatName } from './types';

export interface GameTransitionState {
  character: CharacterSheet;
  progression: ProgressionState;
}

export type GameTransitionEvent =
  | { type: 'level_gained'; level: number; reason?: { experienceSeconds: number } }
  | { type: 'stat_gained'; stat: StatName; amount: number }
  | { type: 'quest_completed'; description: string }
  | { type: 'quest_started'; description: string }
  | { type: 'save_requested'; characterName: string }
  | { type: 'item_gained'; name: string; quantity: number }
  | { type: 'gold_received'; amount: number }
  | { type: 'inventory_sold'; gold: number }
  | { type: 'equipment_purchased'; slot: EquipSlot; name: string }
  | { type: 'equipment_gained'; slot: EquipSlot; name: string }
  | { type: 'act_completed'; act: number }
  // `reason` carries the cause the engine already knew at the decision site. It is never
  // recomputed downstream, and never describes a mechanic that does not exist.
  | { type: 'task_started'; task: ProgressTask; reason?: { carriedCubits: number; capacityCubits: number } };

export interface QuestIdentity {
  readonly kind?: QuestKind;
  readonly target?: string;
  readonly targetIndex?: number;
}

export interface GamePresentationSnapshot {
  readonly hero: {
    readonly name: string;
    readonly race: string;
    readonly className: string;
    readonly level: number;
  };
  readonly act: number;
  readonly completedTask: ProgressTask['type'];
  readonly nextTask: ProgressTask['type'];
  readonly completedTasks: number;
  readonly elapsedSeconds: number;
  readonly activeQuest?: QuestIdentity;
  readonly completedQuest?: QuestIdentity;
  readonly spellRewards?: readonly SpellRewardPresentation[];
  readonly interplotRole?: 'nemesis';
  readonly marketSale?: {
    readonly name: string;
    readonly quantity: number;
    readonly gold: number;
  };
}

export interface SpellRewardPresentation {
  readonly name: string;
  readonly level: number;
  readonly source: 'level' | 'quest';
}

export interface GameTransitionRecord {
  readonly event: GameTransitionEvent;
  readonly post: GamePresentationSnapshot;
}

export interface GameTransitionResult {
  state: GameTransitionState;
  records: GameTransitionRecord[];
  remainingElapsedMs: number;
}

const MAX_CATCH_UP_TASKS = 100;

type CinematicOpening =
  | { branch: 0; first: SequenceTask }
  | { branch: 1; first: SequenceTask }
  | { branch: 2; first: SequenceTask; patron: string };

function sequenceTask(description: string, durationSeconds: number, type: SequenceTask['type'] = 'cinematic'): SequenceTask {
  return { description, durationMs: durationSeconds * 1000, elapsedMs: 0, type };
}

/** What marks a sequence entry as the one running, rather than one still queued. */
const ELLIPSIS = '...';

/**
 * The pending entry as it reads while it is running, which is the same sentence trailing off.
 *
 * The ellipsis is trimmed out of the description rather than off the end of the result. Both the
 * pending and the active description are held to the same `MAX_PERSISTED_DESCRIPTION_LENGTH`, so
 * appending three characters overflowed the cap the source field was allowed to fill — and a
 * near-cap entry then made every write fail from the first task transition onward, forever, since
 * the reload restored the same entry and ran the same transition again.
 *
 * Clamped so the ellipsis survives, because the ellipsis is the part carrying the meaning: it is
 * what distinguishes the task being done now from the same task waiting its turn. Truncating the
 * result instead would drop the mark and leave a sentence that merely looks cut off.
 *
 * `describeGameEvent` clamps against the same cap for the same reason. This path is the one that
 * lacked it.
 */
function activeSequenceTask(task: SequenceTask): ProgressTask {
  const description = `${task.description.slice(0, MAX_PERSISTED_DESCRIPTION_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`;
  return { ...task, description };
}

function impressiveGuy(rng: RandomGenerator): string {
  if (rng.random(2)) return `the ${rng.pick(IMPRESSIVE_TITLES)} of the ${plural(rng.pick(RACES).name)}`;
  return `${rng.pick(IMPRESSIVE_TITLES)} ${generateName(rng)} of ${generateName(rng)}`;
}

function beginInterplotCinematic(rng: RandomGenerator): CinematicOpening {
  switch (rng.random(3)) {
    case 0: return { branch: 0, first: sequenceTask('Exhausted, you arrive at a friendly oasis in a hostile land', 1) };
    case 1: return { branch: 1, first: sequenceTask('Your quarry is in sight, but a mighty enemy bars your path!', 1) };
    case 2: {
      const patron = impressiveGuy(rng);
      return { branch: 2, patron, first: sequenceTask(`Oh sweet relief! You've reached the kind protection of ${patron}`, 2) };
    }
    default: throw new RangeError('Interplot branch is outside the legacy table');
  }
}

function namedMonster(rng: RandomGenerator, level: number): string {
  let best = rng.pick(MONSTERS);
  for (let attempt = 1; attempt < 5; attempt += 1) {
    const candidate = rng.pick(MONSTERS);
    if (Math.abs(level - candidate.level) < Math.abs(level - best.level)) best = candidate;
  }
  return `${generateName(rng)} the ${best.name}`;
}

function nemesisRoundTask(nemesis: string, advantageMod3: number): SequenceTask {
  if (advantageMod3 === 0) return sequenceTask(`Locked in grim combat with ${nemesis}`, 2);
  if (advantageMod3 === 1) return sequenceTask(`${nemesis} seems to have the upper hand`, 2);
  return sequenceTask(`You seem to gain the advantage over ${nemesis}`, 2);
}

function replayNemesisRound(cursor: NemesisSequenceCursor, rng: RandomGenerator): { task?: SequenceTask; cursor?: NemesisSequenceCursor } {
  rng.setState(cursor.replayRngState);
  if (cursor.round > rng.random(cursor.rollLimit)) return {};
  const advantageMod3 = (cursor.advantageMod3 + 1 + rng.random(2)) % 3;
  return {
    task: nemesisRoundTask(cursor.nemesis, advantageMod3),
    cursor: {
      ...cursor,
      round: cursor.round + 1,
      advantageMod3,
      replayRngState: rng.getState(),
    },
  };
}

function finishInterplotCinematic(rng: RandomGenerator, act: number, level: number, opening: CinematicOpening): PendingSequenceEntry[] {
  if (opening.branch === 0) {
    return [
      sequenceTask('You greet old friends and meet new allies', 2),
      sequenceTask('You are privy to a council of powerful do-gooders', 2),
      sequenceTask('There is much to be done. You are chosen!', 1),
      sequenceTask('Loading', 1, 'act_marker'),
    ];
  }
  if (opening.branch === 1) {
    const nemesis = namedMonster(rng, level + 3);
    let advantageMod3 = rng.random(3);
    const materializedRounds: SequenceTask[] = [];
    const maxRounds = MAX_PENDING_TASKS - 4;
    for (let round = 1; round < maxRounds; round += 1) {
      if (round > rng.random(act + 2)) {
        return [
          sequenceTask(`A desperate struggle commences with ${nemesis}`, 4),
          ...materializedRounds,
          sequenceTask(`Victory! ${nemesis} is slain! Exhausted, you lose consciousness`, 3),
          sequenceTask('You awake in a friendly place, but the road awaits', 2),
          sequenceTask('Loading', 1, 'act_marker'),
        ];
      }
      advantageMod3 = (advantageMod3 + 1 + rng.random(2)) % 3;
      materializedRounds.push(nemesisRoundTask(nemesis, advantageMod3));
    }
    const ending = [
      sequenceTask(`Victory! ${nemesis} is slain! Exhausted, you lose consciousness`, 3),
      sequenceTask('You awake in a friendly place, but the road awaits', 2),
      sequenceTask('Loading', 1, 'act_marker'),
    ];
    const openingTask = sequenceTask(`A desperate struggle commences with ${nemesis}`, 4);
    return [openingTask, ...materializedRounds, {
      description: `Continuing the regrettably extensive struggle with ${nemesis}`,
      type: 'nemesis_cursor',
      nemesis,
      round: maxRounds,
      advantageMod3,
      rollLimit: act + 2,
      replayRngState: rng.getState(),
    }, ...ending];
  }
  return [
    sequenceTask(`There is rejoicing, and an unnerving encounter with ${opening.patron} in private`, 3),
    sequenceTask(`You forget your ${rng.pick(BORING_ITEMS)} and go back to get it`, 2),
    sequenceTask("What's this!? You overhear something shocking!", 2),
    sequenceTask(`Could ${opening.patron} be a dirty double-dealer?`, 2),
    sequenceTask('Who can possibly be trusted with this news!? -- Oh yes, of course', 3),
    sequenceTask('Loading', 1, 'act_marker'),
  ];
}

function toRoman(value: number): string {
  const numerals: Array<[number, string]> = [[10_000, 'T'], [9000, 'MT'], [5000, 'A'], [4000, 'MA'], [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let remaining = value;
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      remaining -= amount;
      result += numeral;
    }
  }
  return result || 'N';
}

function actLabel(act: number): string {
  // ponytail: retire unbounded Roman output before it becomes the dominant save format.
  return act > 10_000 ? formatGameNumber(act) : toRoman(act);
}

function leaveMarketTask(gold: number, level: number): ProgressTask {
  return gold > equipPrice(level)
    ? { description: 'Negotiating purchase of better equipment...', durationMs: 5000, elapsedMs: 0, type: 'buying' }
    : { description: 'Heading to the killing fields...', durationMs: 4000, elapsedMs: 0, type: 'heading' };
}

function questIdentity(quest: QuestState): QuestIdentity | undefined {
  if (quest.kind === undefined && quest.target === undefined && quest.targetIndex === undefined) return undefined;
  return {
    ...(quest.kind === undefined ? {} : { kind: quest.kind }),
    ...(quest.target === undefined ? {} : { target: quest.target }),
    ...(quest.targetIndex === undefined ? {} : { targetIndex: quest.targetIndex }),
  };
}

function gainedSpell(previous: readonly SpellItem[], next: readonly SpellItem[]): SpellItem | undefined {
  return next.find((spell) => spell.level > (previous.find(({ name }) => name === spell.name)?.level ?? 0));
}

/**
 * How much faster the quest track moves when the hero meets the thing it named.
 *
 * Three, against a one-in-four bias, so a hero fighting their own quest finishes it roughly twice as
 * fast as one who never runs into it. Large enough that the bar visibly jumps — which is the entire
 * point, since the effect has to be attributable by a player who never acts — and bounded because
 * quests hand out rewards and this is the rate at which they arrive.
 *
 * Exported because the quest panel names it. The multiplier was attributable in principle and
 * invisible in practice for as long as this was private: the bar lurched and nothing on any surface
 * connected the lurch to the monster. `QuestLog` reads the figure from here rather than writing a
 * `3` of its own, so a change to the rate cannot leave the interface asserting the old one.
 */
export const QUEST_TARGET_PROGRESS = 3;

export function advanceGame(state: GameTransitionState, elapsedMs: number, rng: RandomGenerator): GameTransitionResult {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return { state, records: [], remainingElapsedMs: 0 };

  let current = state;
  let remainingElapsedMs = elapsedMs;
  const events: GameTransitionEvent[] = [];
  const records: GameTransitionRecord[] = [];

  for (let completedTasks = 0; completedTasks < MAX_CATCH_UP_TASKS; completedTasks += 1) {
    const { character, progression } = current;
    const firstEventIndex = events.length;
    const completedTask = character.Task.type;
    let completedQuestIdentity: QuestIdentity | undefined;
    const spellRewards: SpellRewardPresentation[] = [];
    const task = { ...character.Task, elapsedMs: character.Task.elapsedMs + remainingElapsedMs };
    if (task.elapsedMs < task.durationMs) {
      return {
        state: { character: { ...character, Task: task }, progression },
        records,
        remainingElapsedMs: 0,
      };
    }

    remainingElapsedMs = task.elapsedMs - task.durationMs;
    const progressDelta = task.durationMs / 1000;
    let traits = { ...character.Traits };
    let stats = { ...character.Stats };
    let spells = [...character.Spells];
    let experience = { ...progression.experience };
    if (task.type === 'kill') {
      if (experience.currentSeconds < experience.maxSeconds) {
        experience.currentSeconds = Math.min(experience.maxSeconds, experience.currentSeconds + progressDelta);
      } else {
        const nextLevel = Math.min(MAX_PERSISTED_VALUE, traits.Level + 1);
        if (nextLevel > traits.Level) events.push({ type: 'level_gained', level: nextLevel, reason: { experienceSeconds: experience.maxSeconds } });
        traits.Level = nextLevel;

        // Read from the sheet rather than from the task loop's `equip`, which is not in scope here
        // and would not be right if it were: this runs before any equipment can change on this tick,
        // so the sheet is the live value at the moment the level lands.
        //
        // Added after the draw, never instead of one, so the stream is untouched.
        const flourish = vitalsFlourish(character.Equip);
        const hpGain = Math.floor(stats.CON / 3) + 1 + rng.random(4) + flourish.hp;
        const nextHpMax = Math.min(MAX_PERSISTED_VALUE, stats['HP Max'] + hpGain);
        if (nextHpMax > stats['HP Max']) events.push({ type: 'stat_gained', stat: 'HP Max', amount: nextHpMax - stats['HP Max'] });
        stats['HP Max'] = nextHpMax;

        const mpGain = Math.floor(stats.INT / 3) + 1 + rng.random(4) + flourish.mp;
        const nextMpMax = Math.min(MAX_PERSISTED_VALUE, stats['MP Max'] + mpGain);
        if (nextMpMax > stats['MP Max']) events.push({ type: 'stat_gained', stat: 'MP Max', amount: nextMpMax - stats['MP Max'] });
        stats['MP Max'] = nextMpMax;

        for (let upgrades = 0; upgrades < 2; upgrades += 1) {
          const stat = generateStatReward(rng, stats);
          const nextStat = Math.min(MAX_PERSISTED_VALUE, Math.trunc(stats[stat]) + 1);
          if (nextStat !== stats[stat]) events.push({ type: 'stat_gained', stat, amount: nextStat - stats[stat] });
          stats[stat] = nextStat;
        }

        const previousSpells = spells;
        spells = applySpellReward(rng, traits.Level, stats.WIS, spells);
        const spell = gainedSpell(previousSpells, spells);
        if (spell) spellRewards.push({ name: spell.name, level: spell.level, source: 'level' });
        experience = { currentSeconds: 0, maxSeconds: levelUpTime(traits.Level) };
        events.push({ type: 'save_requested', characterName: traits.Name });
      }
    }
    const nextProgression: ProgressionState = {
      experience,
      completedTasks: Math.min(MAX_PERSISTED_VALUE, progression.completedTasks + 1),
      elapsedSeconds: Math.min(MAX_PERSISTED_VALUE, progression.elapsedSeconds + Math.floor(progressDelta)),
    };
    let quest = { ...character.Quest };
    let plot = { ...character.Plot };
    let inventory = character.Inventory;
    let gold = character.Gold;
    let goldDecades = character.GoldDecades ?? 0;
    let equip = { ...character.Equip };
    let pendingTasks = [...(character.PendingTasks ?? [])];
    let cinematicOpening: CinematicOpening | undefined;
    let marketSale: GamePresentationSnapshot['marketSale'];

    if (task.type === 'kill') {
      const questHistory = quest.history ?? [];
      const questWasComplete = quest.currentProgress >= quest.maxProgress || questHistory.length === 0;
      if (!questWasComplete) {
        // The coincidence the game already goes to trouble to arrange, finally noticed.
        //
        // `generateMonsterTask` biases one kill in four toward the monster the quest named, and
        // until now killing it advanced the track by exactly as much as killing anything else — so
        // the quest line and the kill line agreed on screen and the bar did not care.
        //
        // Golden-safe by arithmetic rather than by coverage: the marker is only ever set when the
        // quest has a `kind` of `exterminate` and a resolvable `targetIndex`, and every fixture's
        // quest is `Test quest` with neither, so the multiplier is exactly one there.
        const questProgress = progressDelta * (task.questTarget ? QUEST_TARGET_PROGRESS : 1);
        quest.currentProgress = Math.min(quest.maxProgress, quest.currentProgress + questProgress);
      } else {
        const completedQuestDescription = quest.description;
        quest.currentProgress = 0;
        quest.maxProgress = 50 + rng.random(100);
        if (questHistory.length > 0) {
          completedQuestIdentity = questIdentity(quest);
          events.push({ type: 'quest_completed', description: completedQuestDescription });
          const previousSpells = spells;
          const reward = applyQuestReward(rng, {
            ...character,
            Traits: traits,
            Stats: stats,
            Equip: equip,
            Spells: spells,
            Inventory: inventory,
            Gold: gold,
            GoldDecades: goldDecades,
            Quest: quest,
            Plot: plot,
            Task: task,
          });
          stats = reward.character.Stats;
          equip = reward.character.Equip;
          spells = reward.character.Spells;
          inventory = reward.character.Inventory;
          gold = reward.character.Gold;
          const spell = gainedSpell(previousSpells, spells);
          if (spell) spellRewards.push({ name: spell.name, level: spell.level, source: 'quest' });
          if (reward.effect?.type === 'stat') events.push({ type: 'stat_gained', stat: reward.effect.stat, amount: reward.effect.amount });
          else if (reward.effect?.type === 'item') events.push({ type: 'item_gained', name: reward.effect.name, quantity: reward.effect.quantity });
          else if (reward.effect?.type === 'gold') events.push({ type: 'gold_received', amount: reward.effect.amount });
          else if (reward.effect?.type === 'equipment') events.push({ type: 'equipment_gained', slot: reward.effect.slot, name: reward.effect.name });
        }

        const generatedQuest = generateQuest(rng, traits.Level);
        const history = [...questHistory];
        while (history.length > 99) history.shift();
        history.push(generatedQuest.description);
        quest = {
          description: generatedQuest.description,
          currentProgress: 0,
          maxProgress: quest.maxProgress,
          history,
          kind: generatedQuest.kind,
          ...('target' in generatedQuest ? { target: generatedQuest.target } : {}),
          ...('targetIndex' in generatedQuest ? { targetIndex: generatedQuest.targetIndex } : {}),
        };
        events.push({ type: 'quest_started', description: generatedQuest.description });
        events.push({ type: 'save_requested', characterName: traits.Name });
      }
      // The act guard is what keeps the engine inside the phase rule its own sheet is validated
      // against. `characterSheetSchema` permits a cinematic only above act 0, and permits act 0 only
      // alongside `loading` or `prologue` — but `plot.act` advances when the act marker fires, not
      // when the bar fills, so a full bar at act 0 started a cinematic the sheet then refused. Every
      // write failed from that tick on, which meant no checkpoint was ever written at all.
      //
      // Act 0 has exactly one way out, and it is not this one: the prologue ends with its own act
      // marker. So a bar that fills early there is clamped and waits, which is what the branch below
      // already does for every other tick. Not reachable in play — the plot only advances through
      // prologue tasks while the act is 0 — but reachable from any imported sheet pairing act 0 with
      // a kill, and a save that cannot be written is worth a condition either way.
      if (plot.act > 0 && plot.currentProgress >= plot.maxProgress) {
        cinematicOpening = beginInterplotCinematic(rng);
        pendingTasks.push(cinematicOpening.first);
      } else {
        plot.currentProgress = Math.min(plot.maxProgress, plot.currentProgress + progressDelta);
      }

      const itemName = task.loot?.type === 'fixed'
        ? task.loot.item
        : generateItemReward(rng, ['Gold', ...inventory.filter(({ name }) => name !== 'Gold').map(({ name }) => name)]);
      if (itemName === 'Gold') {
        if (gold < MAX_PERSISTED_GOLD) {
          gold += 1;
          events.push({ type: 'gold_received', amount: 1 });
        }
      } else {
        const addedItem = addInventoryItem(inventory, itemName);
        inventory = addedItem.inventory;
        if (addedItem.added) events.push({ type: 'item_gained', name: itemName, quantity: 1 });
      }

      // A second helping, when the weapon is grand enough to make that much mess.
      //
      // The guard short-circuits on purpose, and that is the whole golden argument: at zero standing
      // no `random` call is reached at all, so the stream advances exactly as it did before. This is
      // the one effect in the set that can add a draw, and a draw shifts every value after it — so
      // inertness has to hold at the draw, not merely at the outcome. Every fixture weapon is
      // `Sharp Rock`, which matches no `WEAPONS` label, so no base resolves and this returns zero.
      const clawback = clawbackPerMille(equip);
      if (clawback > 0 && rng.random(1000) < clawback) {
        const extra = generateItemReward(rng, ['Gold', ...inventory.filter(({ name }) => name !== 'Gold').map(({ name }) => name)]);
        if (extra === 'Gold') {
          if (gold < MAX_PERSISTED_GOLD) {
            gold += 1;
            events.push({ type: 'gold_received', amount: 1 });
          }
        } else {
          const addedExtra = addInventoryItem(inventory, extra);
          inventory = addedExtra.inventory;
          if (addedExtra.added) events.push({ type: 'item_gained', name: extra, quantity: 1 });
        }
      }
      if (cinematicOpening) pendingTasks.push(...finishInterplotCinematic(rng, plot.act, traits.Level, cinematicOpening));
    } else if (task.type === 'selling') {
      // One pass always, then as many more as the shoulders carry authority for.
      //
      // The first pass runs unconditionally, including on an empty bag, because that is what this
      // branch did before: an empty selling task still reported a sale of nothing, and a restored
      // save can hold one. Only the extra passes stop early. At one stack the loop is the original
      // straight-line code, executed once, which is what keeps every recorded market trip identical.
      // What the shoulders authorise, plus what a quick pair of hands manages on top. Two sources,
      // added rather than folded into one function, so each can be attributed separately.
      const stacks = bulkStacks(equip) + nimbleStacks(stats);
      for (let pass = 0; pass < stacks; pass += 1) {
        const [soldItem, ...remainingInventory] = inventory;
        if (pass > 0 && !soldItem) break;
        let earned = soldItem ? soldItem.qty * traits.Level : 0;
        if (soldItem?.name.includes(' of ')) {
          earned *= (1 + Math.min(rng.random(10), rng.random(10)))
            * (1 + Math.min(rng.random(traits.Level), rng.random(traits.Level)));
        }
        // Applied after the draws, never instead of one, so the multiplier cannot move the RNG
        // stream. Floored rather than rounded: the hero should never be paid a fraction of a gold
        // piece, and rounding up would let a `Desk Space` add a coin to a sale worth nothing.
        earned = Math.floor(earned * marketFavour(equip) * hagglingFavour(stats));
        inventory = remainingInventory;
        // Sheds a decade rather than saturating, so a sale past the cap still pays. The earning is
        // reported from what was asked for, not from the change in the stored figure — once a decade
        // is shed the balance falls even though the player gained.
        const before = { gold, decades: goldDecades };
        const after = earnGold(before, earned);
        gold = after.gold;
        goldDecades = after.decades;
        const receivedGold = goldEarnedBetween(before, after, earned);
        // Last stack wins, as it did when a task only ever sold one. The quartermaster names a thing
        // and its price, and a bulk pass has several — naming the last is at least a true sentence,
        // where a total attributed to one item would not be.
        if (soldItem) marketSale = { name: soldItem.name, quantity: soldItem.qty, gold: receivedGold };
        // One line per stack, worded exactly as before. The trip gets shorter; the sentences do not
        // change. This log is compared string for string by the goldens and read aloud through an
        // `aria-live` region, so a summarising line would be a separate decision from this one.
        events.push({ type: 'inventory_sold', gold: receivedGold });
      }
    } else if (task.type === 'buying') {
      const price = equipPrice(traits.Level);
      if (gold >= price) {
        // Through `spendGold` rather than subtracting here. It was written alongside `earnGold` in
        // the decade-shedding change and never wired, so the one place the game spends gold carried
        // a second copy of the rule — which is how two copies drift.
        //
        // The guard stays and is what makes the two identical. `spendGold` clamps at zero when no
        // decade has been shed, and returns the purse untouched when one has and the balance is
        // short; behind `gold >= price` neither branch can differ from the subtraction it replaces.
        ({ gold } = spendGold({ gold, decades: goldDecades }, price));
        const upgrade = generateEquipUpgrade(rng, traits.Level, character.Plot.act);
        equip = { ...equip, [upgrade.slot]: upgrade.name };
        events.push({ type: 'equipment_purchased', slot: upgrade.slot, name: upgrade.name });
      }
    }
    if (task.type === 'prologue' && plot.act === 0 && plot.currentProgress < plot.maxProgress) {
      plot.currentProgress = Math.min(plot.maxProgress, plot.currentProgress + progressDelta);
    }

    let transitionedCharacter: CharacterSheet = { ...character, Traits: traits, Stats: stats, Equip: equip, Spells: spells, Inventory: inventory, Gold: gold, GoldDecades: goldDecades, Quest: quest, Plot: plot, Task: task, PendingTasks: pendingTasks };
    let nextTask: ProgressTask | undefined;
    // Set only where the engine actually made the decision, so the feed never has to guess.
    let marketReason: { carriedCubits: number; capacityCubits: number } | undefined;
    if (pendingTasks.length > 0) {
      let queuedTask = pendingTasks[0];
      if (!queuedTask) throw new Error('Pending task queue became empty while dequeuing');
      pendingTasks = pendingTasks.slice(1);
      while (queuedTask.type === 'nemesis_cursor') {
        const replayed = replayNemesisRound(queuedTask, rng);
        if (replayed.task && replayed.cursor) {
          pendingTasks = [replayed.cursor, ...pendingTasks];
          nextTask = activeSequenceTask(replayed.task);
          break;
        }
        queuedTask = pendingTasks[0];
        if (!queuedTask) throw new Error('Nemesis cursor requires a following sequence task');
        pendingTasks = pendingTasks.slice(1);
      }
      if (queuedTask.type === 'act_marker') {
        const completedAct = plot.act;
        const nextAct = Math.min(MAX_PERSISTED_VALUE, plot.act + 1);
        plot = {
          act: nextAct,
          currentProgress: 0,
          maxProgress: Math.min(MAX_PERSISTED_VALUE, 60 * 60 * (1 + 5 * nextAct)),
        };
        events.push({ type: 'act_completed', act: completedAct });
        if (nextAct > 1) {
          const itemName = generateItemReward(rng, ['Gold', ...inventory.filter(({ name }) => name !== 'Gold').map(({ name }) => name)]);
          if (itemName === 'Gold') {
            if (gold < MAX_PERSISTED_GOLD) {
              gold += 1;
              events.push({ type: 'gold_received', amount: 1 });
            }
          } else {
            const addedItem = addInventoryItem(inventory, itemName);
            inventory = addedItem.inventory;
            if (addedItem.added) events.push({ type: 'item_gained', name: itemName, quantity: 1 });
          }
          const upgrade = generateEquipUpgrade(rng, traits.Level, character.Plot.act);
          equip = { ...equip, [upgrade.slot]: upgrade.name };
          events.push({ type: 'equipment_gained', slot: upgrade.slot, name: upgrade.name });
        }
        events.push({ type: 'save_requested', characterName: traits.Name });
        nextTask = { ...queuedTask, description: `Loading Act ${actLabel(nextAct)}...` };
      } else if (queuedTask.type !== 'nemesis_cursor') {
        nextTask = activeSequenceTask(queuedTask);
      }
    } else if (task.type === 'act_marker') {
      const carriedCubits = calculateEncumbrance(inventory);
      const capacityCubits = calculateEncumbranceMax(stats.STR, storageAllowance(equip));
      if (carriedCubits >= capacityCubits) {
        marketReason = { carriedCubits, capacityCubits };
        nextTask = { description: 'Heading to market to sell loot...', durationMs: 4000, elapsedMs: 0, type: 'heading_to_market' };
      } else {
        nextTask = leaveMarketTask(gold, traits.Level);
      }
    } else if (task.type === 'selling' || task.type === 'heading_to_market') {
      const nextItem = inventory[0];
      nextTask = nextItem
        ? { description: `Selling ${indefinite(nextItem.name, nextItem.qty)}...`, durationMs: 1000, elapsedMs: 0, type: 'selling' }
        : leaveMarketTask(gold, traits.Level);
    } else if (task.type === 'buying') {
      nextTask = leaveMarketTask(gold, traits.Level);
    } else {
      const nextTaskInfo = generateTaskDescription(rng, transitionedCharacter);
      nextTask = { ...nextTaskInfo, elapsedMs: 0 };
    }
    if (!nextTask) throw new Error('Sequence transition did not produce a task');
    transitionedCharacter = { ...transitionedCharacter, Equip: equip, Inventory: inventory, Gold: gold, GoldDecades: goldDecades, Plot: plot, PendingTasks: pendingTasks };
    if (pendingTasks.length === 0) delete transitionedCharacter.PendingTasks;
    events.push(marketReason
      ? { type: 'task_started', task: structuredClone(nextTask), reason: marketReason }
      : { type: 'task_started', task: structuredClone(nextTask) });
    current = { character: { ...transitionedCharacter, Task: nextTask }, progression: nextProgression };

    const activeQuest = questIdentity(current.character.Quest);
    const post: GamePresentationSnapshot = {
      hero: {
        name: current.character.Traits.Name,
        race: current.character.Traits.Race,
        className: current.character.Traits.Class,
        level: current.character.Traits.Level,
      },
      act: current.character.Plot.act,
      completedTask,
      nextTask: current.character.Task.type,
      completedTasks: current.progression.completedTasks,
      elapsedSeconds: current.progression.elapsedSeconds,
      ...(activeQuest ? { activeQuest } : {}),
      ...(completedQuestIdentity ? { completedQuest: completedQuestIdentity } : {}),
      ...(spellRewards.length > 0 ? { spellRewards } : {}),
      ...(cinematicOpening?.branch === 1 ? { interplotRole: 'nemesis' as const } : {}),
      ...(marketSale ? { marketSale } : {}),
    };
    records.push(...events.slice(firstEventIndex).map((event) => ({ event, post })));

    if (remainingElapsedMs === 0) return { state: current, records, remainingElapsedMs: 0 };
  }

  return { state: current, records, remainingElapsedMs };
}
