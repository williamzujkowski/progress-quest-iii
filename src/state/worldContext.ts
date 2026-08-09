import { dungeonNamesAt, fieldNamesAt, RAID_ACT_THRESHOLD, raidNamesAt, townNamesAt } from '../data/worldContext';
import { analyzeItemMechanics } from '../engine/itemMechanics';
import { fileLoadout, type LoadoutFiling } from '../engine/loadoutFiling';
import { boundCodePoints, MAX_TEXT_CODE_POINTS, describeGameNumber, formatGameNumber, stableIndex } from '../engine/text';
import type { GamePresentationSnapshot, GameTransitionEvent, GameTransitionRecord, GameTransitionState } from '../engine/transition';
import type { ProgressTask, QuestKind } from '../engine/types';

export type WorldVenue = 'field' | 'road' | 'town' | 'dungeon' | 'raid' | 'cinematic';
export type WorldActivity = 'hunt' | 'travel' | 'sell' | 'buy' | 'quest' | 'loot' | 'advancement' | 'milestone' | 'administration';
export type AssignmentScope = 'local' | 'travel' | 'dungeon';
export type WorldNoticeKind = 'departure' | 'arrival' | 'assignment' | 'training' | 'commerce' | 'loot' | 'milestone';

export interface IdentifiedGameTransitionRecord {
  readonly activityId: number;
  readonly record: GameTransitionRecord;
}

export interface WorldContext {
  readonly venue: WorldVenue;
  readonly activity: WorldActivity;
  readonly location: string;
  readonly spokenLocation: string;
  readonly assignmentScope?: AssignmentScope;
  readonly level: number;
  readonly act: number;
  readonly elapsedSeconds: number;
}

export interface WorldNotice {
  readonly id: string;
  readonly sourceActivityId: number;
  readonly kind: WorldNoticeKind;
  readonly text: string;
}

export interface EquipmentClassification {
  readonly label: 'questionable' | 'serviceable' | 'notable' | 'legendary';
  readonly quality: number;
  readonly combatContribution: 'none';
}

export interface WorldProjection {
  readonly context: WorldContext;
  readonly notices: readonly WorldNotice[];
  readonly equipment?: EquipmentClassification;
  /**
   * What the institution has noticed about the loadout, on the current-state path only.
   *
   * A standing observation rather than an event, so it belongs where the console reports the world
   * as it is, not in the notices, which report things that just happened. Absent from the
   * transition path for the same reason.
   */
  readonly loadout?: LoadoutFiling;
}

export type WorldProjectionInput =
  | { readonly kind: 'current'; readonly state: GameTransitionState }
  | { readonly kind: 'transition'; readonly source: IdentifiedGameTransitionRecord };

const assignmentScope = (kind: QuestKind | undefined): AssignmentScope | undefined => {
  if (kind === 'exterminate' || kind === 'placate') return 'local';
  if (kind === 'deliver' || kind === 'fetch') return 'travel';
  if (kind === 'seek') return 'dungeon';
  return undefined;
};

/**
 * A place name drawn from a per-hero ordering of the pool rather than a per-hero index into it.
 *
 * `choose` picks an index from the whole key, act included. With a pool six wide that gives six
 * possible names at each act, and the act dominates: two heroes whose keys land on the same offset
 * then agree at every act, for ever. Measured before this existed — 400 generated heroes produced
 * **24 distinct routes**, the largest identical group 25.
 *
 * So the hero shuffles the pool once and the act indexes into the result. The available orderings go
 * from the pool's length to its factorial, which for six names is six versus seven hundred and
 * twenty, out of the same vocabulary. A hero's sequence is still a pure function of who they are and
 * how far they have come, so nothing is stored and a replay names the same places.
 *
 * The shuffle is a Fisher-Yates driven by `stableIndex` rather than a rotation. A rotation only
 * multiplies the offsets, so two heroes still walk the same towns in the same order starting from
 * different points — which is most of the original complaint.
 */
function orderedFor(values: readonly string[], identity: string): readonly string[] {
  const order = [...values];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = stableIndex(`${identity}:shuffle:${index}`, index + 1);
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}

const placeFor = (values: readonly string[], identity: string, step: number): string => {
  const ordering = orderedFor(values, identity);
  // No guard on `step`, and that is deliberate. Field names are indexed by the hero's level, which
  // comes off the sheet and is whatever an imported save said — but a negative or non-finite index
  // lands outside the array and the fallback below catches it, naming the place `Unallocated
  // Territory`, which is the honest answer for a reading nobody can trust.
  //
  // A clamp to zero was written first and removed: a mutation deleting it changed nothing
  // observable, because the fallback had already handled every case it covered.
  return ordering[Math.floor(step) % ordering.length] ?? 'Unallocated Territory';
};

function fieldName(post: GamePresentationSnapshot, level = post.hero.level, spoken = false): string {
  const name = placeFor(fieldNamesAt(post.act), `${post.hero.name}:${post.hero.race}:${post.hero.className}:field`, level);
  return `${name} // ${spoken ? 'level ' : 'L'}${spoken ? describeGameNumber(level) : formatGameNumber(level)}`;
}

function townName(post: GamePresentationSnapshot, spoken = false): string {
  const name = placeFor(townNamesAt(post.act), `${post.hero.name}:${post.hero.className}:town`, post.act);
  return `${name} // Act ${spoken ? describeGameNumber(post.act) : formatGameNumber(post.act)}`;
}

function milestoneName(post: GamePresentationSnapshot, venue: 'dungeon' | 'raid', spoken = false): string {
  const names = venue === 'raid' ? raidNamesAt(post.act) : dungeonNamesAt(post.act);
  const name = placeFor(names, `${post.hero.name}:${venue}`, post.act);
  return `${name} // Act ${spoken ? describeGameNumber(post.act) : formatGameNumber(post.act)}`;
}

function venueForTask(post: GamePresentationSnapshot): WorldVenue {
  const task = post.nextTask;
  if (task === 'kill') return 'field';
  if (task === 'heading' || task === 'heading_to_market') return 'road';
  if (task === 'buying' || task === 'selling') return 'town';
  if (task === 'cinematic' && post.interplotRole === 'nemesis') return post.act >= RAID_ACT_THRESHOLD ? 'raid' : 'dungeon';
  if (task === 'prologue' || task === 'loading' || task === 'act_marker') return 'cinematic';
  if (task === 'cinematic') return 'cinematic';
  return 'field';
}

function activityForEvent(event: GameTransitionEvent | undefined, nextTask: ProgressTask['type']): WorldActivity {
  if (event?.type === 'level_gained' || event?.type === 'stat_gained') return 'advancement';
  if (event?.type === 'quest_started' || event?.type === 'quest_completed') return 'quest';
  if (event?.type === 'item_gained' || event?.type === 'equipment_gained' || event?.type === 'gold_received') return 'loot';
  if (event?.type === 'equipment_purchased') return 'buy';
  if (event?.type === 'inventory_sold') return 'sell';
  if (event?.type === 'act_completed') return 'milestone';
  if (nextTask === 'heading' || nextTask === 'heading_to_market') return 'travel';
  if (nextTask === 'selling') return 'sell';
  if (nextTask === 'buying') return 'buy';
  if (nextTask === 'kill') return 'hunt';
  if (nextTask === 'cinematic' || nextTask === 'act_marker') return 'milestone';
  return 'administration';
}

function locationFor(post: GamePresentationSnapshot, venue: WorldVenue, spoken = false): string {
  if (venue === 'town') return townName(post, spoken);
  if (venue === 'dungeon' || venue === 'raid') return milestoneName(post, venue, spoken);
  if (venue === 'road') {
    return post.nextTask === 'heading_to_market'
      ? `Road to ${townName(post, spoken)}`
      : `Road to ${fieldName(post, post.hero.level, spoken)}`;
  }
  if (venue === 'cinematic') return post.act === 0 ? 'Prologue Transit' : `Act ${spoken ? describeGameNumber(post.act) : formatGameNumber(post.act)} Intermission`;
  return fieldName(post, post.hero.level, spoken);
}

function contextFor(post: GamePresentationSnapshot, event?: GameTransitionEvent): WorldContext {
  const venue = venueForTask(post);
  const quest = event?.type === 'quest_completed' ? post.completedQuest : post.activeQuest;
  const scope = assignmentScope(quest?.kind);
  return {
    venue,
    activity: activityForEvent(event, post.nextTask),
    location: locationFor(post, venue),
    spokenLocation: locationFor(post, venue, true),
    ...(scope ? { assignmentScope: scope } : {}),
    level: post.hero.level,
    act: post.act,
    elapsedSeconds: post.elapsedSeconds,
  };
}

function postFromState(state: GameTransitionState): GamePresentationSnapshot {
  const { character, progression } = state;
  const activeQuest = character.Quest.kind === undefined && character.Quest.target === undefined && character.Quest.targetIndex === undefined
    ? undefined
    : {
        ...(character.Quest.kind === undefined ? {} : { kind: character.Quest.kind }),
        ...(character.Quest.target === undefined ? {} : { target: character.Quest.target }),
        ...(character.Quest.targetIndex === undefined ? {} : { targetIndex: character.Quest.targetIndex }),
      };
  return {
    hero: {
      name: character.Traits.Name,
      race: character.Traits.Race,
      className: character.Traits.Class,
      level: character.Traits.Level,
    },
    act: character.Plot.act,
    completedTask: character.Task.type,
    nextTask: character.Task.type,
    completedTasks: progression.completedTasks,
    elapsedSeconds: progression.elapsedSeconds,
    ...(activeQuest ? { activeQuest } : {}),
  };
}

const bound = (text: string): string => boundCodePoints(text, MAX_TEXT_CODE_POINTS);


function safeFilingName(value: string): string {
  const neutral = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) return ' ';
    if (codePoint === 0x61c || codePoint === 0x200e || codePoint === 0x200f) return '';
    if ((codePoint >= 0x202a && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069)) return '';
    return character;
  }).join('')
    .replace(/\s+/gu, ' ')
    .trim();
  const characters = Array.from(neutral);
  return characters.length <= 72 ? neutral : `${characters.slice(0, 71).join('')}…`;
}

function notice(sourceActivityId: number, ordinal: number, kind: WorldNoticeKind, text: string): WorldNotice {
  return { id: `world:${sourceActivityId}:${ordinal}`, sourceActivityId, kind, text: bound(text) };
}

function equipmentFor(event: GameTransitionEvent): EquipmentClassification | undefined {
  if (event.type !== 'equipment_gained' && event.type !== 'equipment_purchased') return undefined;
  const mechanics = analyzeItemMechanics({ kind: 'equipment', name: event.name, slot: event.slot });
  const qualityParts = mechanics.quality;
  if (!qualityParts) return undefined;
  const quality = qualityParts.total;
  const hasPenalty = (qualityParts.mark?.value ?? 0) < 0
    || qualityParts.modifiers.some(({ value }) => value < 0);
  const label = hasPenalty
    ? 'questionable'
    : qualityParts.modifiers.length >= 2
      ? 'legendary'
      : qualityParts.modifiers.length === 1
        ? 'notable'
        : 'serviceable';
  return { label, quality, combatContribution: mechanics.combatContribution };
}

/**
 * What the archive says about a legendary acquisition, which is the only thing it gets.
 *
 * Ceremony rather than power. Every line describes filing, storage, or the reaction of people who
 * handle paperwork, because equipment carries no combat contribution at any quality and a rare
 * one that read as strong would be the exact claim CONTEXT.md forbids.
 */
const LEGENDARY_REMARKS: readonly string[] = [
  'Two modifiers on one item. The registrar has asked for the form to be re-copied in ink.',
  'Filed under exceptional, a category maintained for completeness and used almost never.',
  'The acquisition was witnessed, which is more than most of them manage.',
  'Provisionally catalogued as remarkable, pending somebody senior confirming what that means.',
  'Entered in the ledger twice, once by a clerk who did not believe the first entry.',
];

const legendaryRemark = (name: string): string =>
  LEGENDARY_REMARKS[stableIndex(`legendary:${name}`, LEGENDARY_REMARKS.length)]!;

function noticesFor(source: IdentifiedGameTransitionRecord, context: WorldContext, equipment: EquipmentClassification | undefined): readonly WorldNotice[] {
  const { activityId, record: { event, post } } = source;
  if (event.type === 'level_gained') {
    const previousLocation = fieldName(post, Math.max(1, event.level - 1));
    const nextLocation = fieldName(post);
    const reward = post.spellRewards?.find(({ source: rewardSource }) => rewardSource === 'level');
    return [
      notice(activityId, 0, 'departure', `Departed ${previousLocation}; promotion jurisdiction expired.`),
      notice(activityId, 1, 'arrival', `Arrived ${nextLocation} on paper. Level ${formatGameNumber(event.level)} paperwork accepted.`),
      ...(reward ? [notice(activityId, 2, 'training', `Certified ${reward.name} rank ${formatGameNumber(reward.level)} from automatic level reward; no combat effect is modeled.`)] : []),
    ];
  }
  if (event.type === 'quest_started') {
    const scope = context.assignmentScope ?? 'local';
    return [notice(activityId, 0, 'assignment', `Assignment classified ${scope}; wording remains in the authoritative quest record.`)];
  }
  if (event.type === 'quest_completed') {
    const reward = post.spellRewards?.find(({ source: rewardSource }) => rewardSource === 'quest');
    return reward
      ? [notice(activityId, 0, 'training', `Certified ${reward.name} rank ${formatGameNumber(reward.level)} from automatic quest reward; no combat effect is modeled.`)]
      : [];
  }
  if (event.type === 'equipment_gained' || event.type === 'equipment_purchased') {
    if (!equipment) return [];
    const filed = notice(activityId, 0, 'loot', `${equipment.label} equipment filed at generation quality ${formatGameNumber(equipment.quality)}; no combat effect is modeled.`);
    // A legendary piece turns up in roughly one acquisition in fifty and used to read exactly
    // like the other forty-nine: the same sentence with a different adjective in the middle of
    // it. The institution now says something, which is the whole of what a rare find gets here -
    // the item is no more use in a fight than any other, and the line above still says so.
    return equipment.label === 'legendary'
      ? [filed, notice(activityId, 1, 'milestone', legendaryRemark(event.name))]
      : [filed];
  }
  if (event.type === 'inventory_sold') {
    return [notice(activityId, 0, 'commerce', post.marketSale
      ? `Sold ${formatGameNumber(post.marketSale.quantity)}× ${safeFilingName(post.marketSale.name)} for ${formatGameNumber(post.marketSale.gold)} gold.`
      : `Vendor disposal completed for ${formatGameNumber(event.gold)} gold; item details were not retained.`)];
  }
  if (event.type === 'act_completed') {
    return [notice(activityId, 0, 'milestone', `Act ${formatGameNumber(event.act)} closed. The next jurisdiction has already denied involvement.`)];
  }
  if (event.type === 'task_started') {
    if (event.task.type === 'heading_to_market') return [notice(activityId, 0, 'departure', `Market route opened toward ${townName(post)}.`)];
    if (event.task.type === 'selling' && post.completedTask === 'heading_to_market') return [notice(activityId, 0, 'arrival', `Arrived at ${townName(post)}. Vendor administration commenced.`)];
    if (event.task.type === 'buying' && post.completedTask === 'selling') return [notice(activityId, 0, 'commerce', `Procurement convened at ${townName(post)}.`)];
    if (event.task.type === 'heading' && (post.completedTask === 'selling' || post.completedTask === 'buying')) return [notice(activityId, 0, 'departure', `Departed town for ${fieldName(post)}.`)];
    if (event.task.type === 'kill' && post.completedTask === 'heading') return [notice(activityId, 0, 'arrival', `Arrived at ${fieldName(post)}. Hunting administration resumed.`)];
    // A pull against several opponents at once. The count is the engine's own - the encounter's
    // duration is derived from it - so the longer processing time is a modelled fact rather than
    // a flourish, and saying so is the joke. Anything below two is an ordinary encounter and
    // needs no permit.
    if (event.task.type === 'kill' && (event.task.opponents ?? 1) > 1) {
      return [notice(activityId, 0, 'assignment', `Group assignment: ${formatGameNumber(event.task.opponents!)} opponents processed together, which the schedule accommodates by taking longer.`)];
    }
    if (event.task.type === 'cinematic' && post.interplotRole === 'nemesis') return [notice(activityId, 0, 'milestone', `${context.venue === 'raid' ? 'Raid-class' : 'Dungeon'} boss framing opened at ${context.location}; no party mechanics were added.`)];
  }
  return [];
}

/**
 * Whether there is a route worth showing.
 *
 * Exported so the `Records` disclosure and this component agree about it. The disclosure is gated on
 * having something to file — an empty heading is a promise of nothing — and if the two decided
 * separately, a hero whose only record was a route would get a triangle that opened onto nothing.
 *
 * One act is the threshold: a hero still in the prologue has been exactly nowhere.
 */
export const hasRoute = (act: number): boolean => Number.isFinite(act) && act >= 1;

/** One act the hero has been through, or the one they have not reached yet. */
export interface RouteStop {
  readonly act: number;
  /** The act's town, or null for an act that has not been reached. */
  readonly town: string | null;
  readonly dungeon: string | null;
  readonly raid: string | null;
  readonly current: boolean;
}

/**
 * Everywhere the paperwork has sent the hero, recomputed rather than remembered.
 *
 * Nothing here is stored, and that is the point. Every place name in this game is already a pure
 * function of the hero's identity and an act — `choose(townNamesAt(act), '<name>:<class>:town:<act>')`
 * and its two siblings — so an act the hero finished names its own town, dungeon and raid on demand,
 * exactly as it did at the time. A route therefore needs no new field on the sheet and no schema
 * change, which matters more than it sounds: every persisted addition is a migration against a
 * directive that reads `player data > correctness`.
 *
 * The names are drawn through the same helpers the world console uses rather than re-derived from
 * the same tables. Two derivations of one name is how they drift apart, and a route that disagreed
 * with the console about where the hero had been would be worse than no route.
 *
 * A *route*, not a map. The engine has no coordinates, no adjacency and no travel between named
 * places beyond `Road to X`, so drawing a map would assert a world that does not exist. An ordered
 * list of postings is what the engine actually models, and reads as a service record rather than a
 * fantasy atlas — which is the right register anyway.
 */
export function projectRoute(hero: GamePresentationSnapshot['hero'], act: number, limit = 12): readonly RouteStop[] {
  if (!Number.isFinite(act) || act < 0) return [];

  const named = (current: number): RouteStop => {
    const post = { hero, act: current } as GamePresentationSnapshot;
    return {
      act: current,
      town: townName(post).split(' // ')[0] ?? null,
      dungeon: milestoneName(post, 'dungeon').split(' // ')[0] ?? null,
      raid: milestoneName(post, 'raid').split(' // ')[0] ?? null,
      current: current === act,
    };
  };

  // The most recent stops, oldest first. A hero deep into the acts has a service record longer than
  // anything else on the page, and the interesting end of it is the recent one.
  const reached = Math.min(act, Number.MAX_SAFE_INTEGER);
  const first = Math.max(0, reached - limit + 1);
  const stops: RouteStop[] = [];
  for (let current = first; current <= reached; current += 1) stops.push(named(current));

  // The act ahead, deliberately unnamed. An institution that has not yet decided where you are going
  // is this game's register, and not naming a place preserves the discovery for free.
  stops.push({ act: reached + 1, town: null, dungeon: null, raid: null, current: false });
  return stops;
}

export function projectWorld(input: WorldProjectionInput): WorldProjection {
  if (input.kind === 'current') {
    return {
      context: contextFor(postFromState(input.state)),
      notices: [],
      loadout: fileLoadout(input.state.character),
    };
  }
  const { event, post } = input.source.record;
  const context = contextFor(post, event);
  const equipment = equipmentFor(event);
  return {
    context,
    notices: noticesFor(input.source, context, equipment),
    ...(equipment ? { equipment } : {}),
  };
}
