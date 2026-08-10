import { SOCIAL_PERSONAS, type SocialPersona, type SocialSeat } from '../data/socialCatalog';
import { GRATS } from '../data/socialGrats';
import { DKP_ALLOCATION, DKP_STANDINGS } from '../data/socialDkp';
import { recurringAssignments } from './questRecurrence';
import { boundCodePoints, boundedLabel, MAX_TEXT_CODE_POINTS, formatGameNumber, stableIndex, stableChoice } from '../engine/text';
import { DOCKET_LINES, ERA_LINES, SPECIMEN_LINES, VENUE_LINES, EXHIBIT_LINES, PREDECESSOR_MISTELLS, SYSTEM_NOTICES, AUCTION_LINES, MISTELLS, UTILITY_BEATS, AMBIENT_LINES, BLAME_BEATS, EXCHANGES, FEUD_BEATS, ITEM_OF_RECORD_LINES, ONBOARDING_LINES, QUESTION_BEATS, REACTION_LINES, REPEATED_MODIFIER_LINES, TRADE_LINES, type AmbientLine } from '../data/socialAmbient';
import type { LoadoutFiling } from '../engine/loadoutFiling';
import { displayTarget, mostLitigated, type Caseload } from './caseload';
import type { Predecessor } from './predecessor';
import { finestExhibit, type Commendations } from './commendations';
import { namedEras } from './namedEras';
import { venueBulletin } from './venueBulletin';
import { itemSpecimens, type SpecimenLog } from './specimenLog';
import { projectWorld, type IdentifiedGameTransitionRecord, type WorldContext } from './worldContext';
import { attendanceLabel, raidMuster } from './raidMuster';

export type SocialChannel = 'guild' | 'world' | 'party' | 'raid' | 'whisper' | 'system' | 'hero';
export type SocialSceneKind = 'level' | 'quest' | 'equipment' | 'loot' | 'market' | 'zone' | 'milestone' | 'catch_up' | 'ambient';

export interface SocialSpeaker {
  readonly id: string;
  readonly kind: 'cast' | 'hero' | 'system';
  readonly displayName: string;
  readonly role: string;
  readonly fictional: true;
  readonly automaticHero: boolean;
}

export interface SocialEntry {
  readonly id: string;
  readonly sceneId: string;
  readonly sceneKind: SocialSceneKind;
  readonly sourceActivityId: number;
  readonly channel: SocialChannel;
  readonly speaker: SocialSpeaker;
  readonly text: string;
}

interface SceneCandidate {
  readonly kind: Exclude<SocialSceneKind, 'catch_up'>;
  readonly priority: number;
  readonly source: IdentifiedGameTransitionRecord;
  /**
   * Set only on a started assignment the institution has issued before, from `Quest.history` on the
   * sheet the store already holds. Absent everywhere else, so every other scene projects the bytes
   * it always did.
   */
  readonly recurring?: boolean;
}

interface SceneLine {
  readonly speaker: SocialSeat | 'hero' | 'system';
  readonly channel: SocialChannel;
  readonly text: string;
}

/**
 * How many scenes of a batch are rendered in full rather than consolidated into one line.
 *
 * Only ever bites during a catch-up drain. Ordinary play completes one task a tick, so a batch is
 * one scene and nothing is consolidated — but tab away for ten minutes and a single batch carries
 * hundreds, which is exactly the moment a player comes back wanting to read what they missed.
 *
 * Eight rather than three. The feed holds `MAX_SOCIAL_ENTRIES` lines and drops whole scenes off the
 * end, so this cannot run away: it decides how much of a return is worth reading, not how much is
 * kept.
 */
const MAX_DETAILED_SCENES = 8;

const HERO_SPEAKER: SocialSpeaker = {
  id: 'hero', kind: 'hero', displayName: 'Hero', role: 'Automatic hero reply', fictional: true, automaticHero: true,
};
const SYSTEM_SPEAKER: SocialSpeaker = {
  id: 'simulated-system', kind: 'system', displayName: 'System', role: 'Fictional system notice', fictional: true, automaticHero: false,
};

const bound = (text: string): string => boundCodePoints(text, MAX_TEXT_CODE_POINTS);

/** The identity the cast is drawn from, so ambient chatter can draw the same troupe as the scenes. */
export interface HeroIdentity {
  readonly name: string;
  readonly race: string;
  readonly className: string;
}

function castForHero(hero: HeroIdentity): Readonly<Record<SocialSeat, SocialPersona>> {
  const heroKey = `${hero.name}:${hero.race}:${hero.className}`;
  const choosePersona = (seat: SocialSeat): SocialPersona => {
    const options = SOCIAL_PERSONAS.filter((persona) => persona.seat === seat);
    // stableChoice rather than stableIndex: with two options per seat the latter decides on the
    // parity of the key's character sum, so all four seats resolved together and every hero drew
    // one of two fixed troupes instead of one of sixteen combinations.
    const persona = options[stableChoice(`${heroKey}:${seat}`, options.length)];
    if (!persona) throw new Error(`Social catalog has no persona for the ${seat} seat`);
    return persona;
  };
  return {
    official: choosePersona('official'),
    logistics: choosePersona('logistics'),
    field: choosePersona('field'),
    support: choosePersona('support'),
  };
}

function castFor(source: IdentifiedGameTransitionRecord): Readonly<Record<SocialSeat, SocialPersona>> {
  return castForHero(source.record.post.hero);
}

function speakerFor(line: SceneLine, cast: Readonly<Record<SocialSeat, SocialPersona>>): SocialSpeaker {
  if (line.speaker === 'hero') return HERO_SPEAKER;
  if (line.speaker === 'system') return SYSTEM_SPEAKER;
  const persona = cast[line.speaker];
  return {
    id: persona.id,
    kind: 'cast',
    displayName: persona.displayName,
    role: persona.role,
    fictional: true,
    automaticHero: false,
  };
}

function candidateFor(source: IdentifiedGameTransitionRecord, recurring: ReadonlySet<number>): SceneCandidate | undefined {
  const { event, post } = source.record;
  // Above a completion, and only when the assignment is a reissue.
  //
  // A completion and the next start are pushed by the same task, so they share an envelope and the
  // completion's 85 has always taken it — which would have made this feature project nothing at all
  // while every test on the bank passed. The ladder is a statement about what is worth reading, and
  // by that standard the reissue outranks: every assignment completes, roughly one in five comes
  // back, and the reissue is about the stretch of play beginning rather than the one just finished.
  if (event.type === 'quest_started' && recurring.has(source.activityId)) {
    return { kind: 'quest', priority: 86, source, recurring: true };
  }
  if (event.type === 'task_started' && event.task.type === 'cinematic' && post.interplotRole === 'nemesis') return { kind: 'milestone', priority: 100, source };
  if (event.type === 'act_completed') return { kind: 'milestone', priority: 95, source };
  if (event.type === 'level_gained') return { kind: 'level', priority: 90, source };
  if (event.type === 'quest_completed' || event.type === 'quest_started') return { kind: 'quest', priority: event.type === 'quest_completed' ? 85 : 80, source };
  if (event.type === 'equipment_purchased' || event.type === 'equipment_gained') return { kind: 'equipment', priority: event.type === 'equipment_purchased' ? 75 : 70, source };
  if (event.type === 'item_gained') return { kind: 'loot', priority: 65, source };
  if (event.type === 'inventory_sold') {
    // A sale of nothing is not news. Every character starts with a `{ name: 'Gold', qty: 0 }`
    // placeholder at the head of the inventory, and the selling task takes the head unconditionally
    // — so the first market trip of every character sold the currency row for nothing and announced
    // it to the guild as "0 units became 0 gold".
    //
    // Suppressed here rather than fixed in the engine on purpose. Changing which item the sell path
    // takes would move the inventory sequence and every figure downstream of it, which is a
    // recorded-session change for a cosmetic complaint. The engine is doing what it has always
    // done; the chat simply has nothing worth saying about it.
    const sale = post.marketSale;
    if (sale && sale.quantity <= 0 && sale.gold <= 0) return undefined;
    return { kind: 'market', priority: 60, source };
  }
  if (event.type === 'task_started') {
    const isBoundary = event.task.type === 'heading_to_market'
      || (event.task.type === 'selling' && post.completedTask === 'heading_to_market')
      || (event.task.type === 'heading' && (post.completedTask === 'selling' || post.completedTask === 'buying'))
      || (event.task.type === 'kill' && post.completedTask === 'heading');
    if (isBoundary) return { kind: 'zone', priority: 50, source };
  }
  return undefined;
}

function splitTaskEnvelopes(sources: readonly IdentifiedGameTransitionRecord[]): IdentifiedGameTransitionRecord[][] {
  const envelopes: IdentifiedGameTransitionRecord[][] = [];
  let pending: IdentifiedGameTransitionRecord[] = [];
  let completedTasks = sources[0]?.record.post.completedTasks;
  for (const source of sources) {
    if (pending.length > 0 && source.record.post.completedTasks !== completedTasks) {
      envelopes.push(pending);
      pending = [];
    }
    completedTasks = source.record.post.completedTasks;
    pending.push(source);
    if (source.record.event.type === 'task_started') {
      envelopes.push(pending);
      pending = [];
      completedTasks = undefined;
    }
  }
  if (pending.length > 0) envelopes.push(pending);
  return envelopes;
}

function chooseCandidate(envelope: readonly IdentifiedGameTransitionRecord[], recurring: ReadonlySet<number>): SceneCandidate | undefined {
  return envelope.reduce<SceneCandidate | undefined>((selected, source) => {
    const candidate = candidateFor(source, recurring);
    if (!candidate) return selected;
    if (!selected || candidate.priority > selected.priority) return candidate;
    if (candidate.priority === selected.priority && candidate.source.activityId > selected.source.activityId) return candidate;
    return selected;
  }, undefined);
}

function variant(values: readonly [readonly SceneLine[], ...Array<readonly SceneLine[]>], candidate: SceneCandidate): readonly SceneLine[] {
  const { hero, completedTasks } = candidate.source.record.post;
  const selected = values[stableIndex(`${hero.name}:${hero.race}:${hero.className}:${candidate.kind}:${candidate.source.activityId}:${completedTasks}`, values.length)];
  if (selected === undefined) throw new Error('Social scene requires at least one reviewed variant');
  return selected;
}

/**
 * Who answers a promotion, and with what.
 *
 * The middle line of a level scene was a fixed remark from `support`, one per variant, so three
 * sentences covered every promotion a save would ever see — and two of the four seats never spoke at
 * a level at all. This draws the seat and the line together, which is what lets `logistics` and
 * `field` into the room.
 *
 * Drawn from the same key the variant chooser uses, so a promotion reads identically on every replay
 * of the same save. The projection is asserted byte-stable under spies that throw on `Math.random`
 * and `Date.now`, so nothing here may reach for either.
 */
function gratsFor(candidate: SceneCandidate, channel: SocialChannel): SceneLine {
  const { hero, completedTasks } = candidate.source.record.post;
  const key = `grats:${hero.name}:${candidate.source.activityId}:${completedTasks}`;
  const seats: readonly Exclude<SocialSeat, 'official'>[] = ['logistics', 'field', 'support'];
  const seat = seats[stableChoice(key, seats.length)]!;
  return { speaker: seat, channel, text: GRATS[seat][stableChoice(`line:${key}`, GRATS[seat].length)]! };
}

/**
 * The ledger line a boss milestone earns, on the guild channel where a ledger belongs.
 *
 * Two banks rather than one: an opening boss is about attendance and standings, a closing act is
 * about the allocation that followed. Saying the wrong one at the wrong moment would be the joke
 * told backwards.
 *
 * Drawn from the same key the variant chooser uses, so a milestone reads identically on every replay
 * of the same save. The projection is asserted byte-stable under spies that throw on `Math.random`
 * and `Date.now`, so nothing here may reach for either.
 */
function dkpFor(candidate: SceneCandidate, closing: boolean): SceneLine {
  const { hero, completedTasks } = candidate.source.record.post;
  const bank = closing ? DKP_ALLOCATION : DKP_STANDINGS;
  const key = `dkp:${closing ? 'close' : 'open'}:${hero.name}:${candidate.source.activityId}:${completedTasks}`;
  return { speaker: 'logistics', channel: 'guild', text: bank[stableChoice(key, bank.length)]! };
}

function linesFor(candidate: SceneCandidate): readonly SceneLine[] {
  const { event, post } = candidate.source.record;
  const world = projectWorld({ kind: 'transition', source: candidate.source });
  if (candidate.kind === 'level' && event.type === 'level_gained') {
    // A promotion that came with a qualification, said where qualifications are said.
    //
    // `post.spellRewards` is read in `worldContext` and nowhere else, so `Cone of Boilerplate` and
    // `Summon a Stakeholder` — some of the best strings in the project — surfaced only inside a dry
    // world notice and never in the channel that reacts to things. The level scene fires at exactly
    // the moment the certificate is issued, and it was ignoring the certificate.
    //
    // A separate branch rather than a fourth variant, following the recurring-quest precedent
    // below: a variant list whose members are not all reachable is a list that lies about its own
    // odds. A spell is not awarded at every level — `generateSpellReward` can decline — so the
    // ordinary three stay the ordinary three.
    const certified = post.spellRewards?.find(({ source: rewardSource }) => rewardSource === 'level');
    if (certified) {
      return variant([
        [
          { speaker: 'official', channel: 'guild', text: `Promotion to level ${formatGameNumber(event.level)} carried a certification in ${certified.name}. The certification was automatic and so was the ceremony.` },
          gratsFor(candidate, 'guild'),
          { speaker: 'hero', channel: 'hero', text: 'Another qualification nobody will ask me to produce.' },
        ],
        [
          { speaker: 'official', channel: 'guild', text: `Level ${formatGameNumber(event.level)} is official. ${certified.name} has been added to the list of things the hero is now permitted to attempt.` },
          gratsFor(candidate, 'guild'),
          { speaker: 'hero', channel: 'hero', text: 'Permitted, unsupervised, and unexamined. The usual arrangement.' },
        ],
        [
          { speaker: 'official', channel: 'world', text: `The hero is now level ${formatGameNumber(event.level)} and holds ${certified.name} at the accredited grade. Nobody has been told what the grade means.` },
          gratsFor(candidate, 'world'),
          { speaker: 'hero', channel: 'hero', text: 'I will keep the certificate somewhere the audit can find it.' },
        ],
      ] as const, candidate);
    }
    return variant([
      [
        { speaker: 'official', channel: 'guild', text: `Promotion to level ${formatGameNumber(event.level)} has entered the ledger. Congratulations are now procedurally valid.` },
        gratsFor(candidate, 'guild'),
        { speaker: 'hero', channel: 'hero', text: 'I accept the increased responsibility in its most decorative sense.' },
      ],
      [
        { speaker: 'official', channel: 'guild', text: `Level ${formatGameNumber(event.level)} is official, subject to the usual absence of witnesses.` },
        gratsFor(candidate, 'guild'),
        { speaker: 'hero', channel: 'hero', text: 'Please forward my authority to someone less available.' },
      ],
      [
        { speaker: 'official', channel: 'world', text: `The hero is now level ${formatGameNumber(event.level)}. Seniority has outpaced supervision again.` },
        gratsFor(candidate, 'world'),
        { speaker: 'hero', channel: 'hero', text: 'At last, a larger number with the same management structure.' },
      ],
    ] as const, candidate);
  }
  if (candidate.kind === 'quest' && event.type === 'quest_started' && candidate.recurring === true) {
    // The one thing the game could always have said and never did.
    //
    // A quest bank of finite size reissues; the sheet has recorded every reissue for as long as
    // there has been a sheet, and nothing read it. The joke is not that the work repeats — it is
    // that the institution has the paperwork proving it repeats and files the assignment anyway.
    //
    // Nothing here says *when*. The ring remembers a hundred assignments and no more, so a line
    // claiming an interval would be claiming a memory the game does not have.
    const scope = world.context.assignmentScope ?? 'local';
    return variant([
      [
        { speaker: 'official', channel: 'guild', text: `This ${scope} assignment has been issued before. The file was never closed, so it has been opened again beside itself.` },
        { speaker: 'logistics', channel: 'guild', text: 'Archive confirms a prior copy. Archive declines to say what became of it.' },
        { speaker: 'hero', channel: 'hero', text: 'Then I have already done this, and it did not take.' },
      ],
      [
        { speaker: 'official', channel: 'whisper', text: `The ${scope} brief is a reissue. Precedent exists and has been ruled inadmissible by the department that set it.` },
        { speaker: 'field', channel: 'party', text: 'I recognise the route. The route has aged better than the reason for it.' },
        { speaker: 'hero', channel: 'hero', text: 'Familiar work. Nobody has explained why it came back.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `A duplicate ${scope} assignment has cleared review, review being the step that produced the duplicate.` },
        { speaker: 'support', channel: 'guild', text: 'Filed under outstanding, which is where the first one is.' },
        { speaker: 'hero', channel: 'hero', text: 'Understood. I will complete it to the same effect as last time.' },
      ],
    ] as const, candidate);
  }
  if (candidate.kind === 'quest' && event.type === 'quest_completed') {
    const scope = world.context.assignmentScope ?? 'local';

    // A completion, said as one.
    //
    // This branch used to share the bank below with `quest_started`, and the only thing that
    // differed was a participle — `approved` against `completed`. Everything after the first clause
    // was written for a departure and spoken at a return: "Route confidence is high" about a route
    // already walked, "I have marked every uncertain direction as scenic" at the point there is
    // nothing left to mark, and a hero replying "Proceed until the objective becomes retrospectively
    // obvious" to an objective that has stopped.
    //
    // Worse than bland, and worse than it looks: `SCENE_LENGTHS` renders a quest scene as one line
    // five times in nine, so the opening carries the scene — and the opening was the clause that
    // differed by that single word.
    //
    // The certification branch first, mirroring the level scene. `spellRewards` carries quest awards
    // as well as promotion ones, and the quest half reached a dry world notice and nothing else.
    const certified = post.spellRewards?.find(({ source: rewardSource }) => rewardSource === 'quest');
    if (certified) {
      return variant([
        [
          { speaker: 'official', channel: 'guild', text: `The ${scope} assignment closed with a certification in ${certified.name}. Nobody has said what it was for.` },
          { speaker: 'support', channel: 'guild', text: 'Logged against a record nobody audits. Congratulations remain pre-approved.' },
          { speaker: 'hero', channel: 'hero', text: 'A second qualification. The first has not been requested either.' },
        ],
        [
          { speaker: 'official', channel: 'guild', text: `Assignment closed. ${certified.name} was conferred on the way out, which is when these are conferred.` },
          gratsFor(candidate, 'guild'),
          { speaker: 'hero', channel: 'hero', text: 'Received on departure. I will file it beside the others.' },
        ],
        [
          { speaker: 'official', channel: 'whisper', text: `The ${scope} brief is closed and ${certified.name} is attached to it. The attachment was not requested.` },
          { speaker: 'support', channel: 'guild', text: 'Certification noted. The file is now longer and no clearer.' },
          { speaker: 'hero', channel: 'hero', text: 'Closed, certified, and unexamined. The usual three.' },
        ],
      ] as const, candidate);
    }

    return variant([
      [
        { speaker: 'official', channel: 'guild', text: `A ${scope} assignment has been completed. The objectives were met in the order they were guessed.` },
        { speaker: 'field', channel: 'party', text: 'The route is closed behind us. Nothing out there has been told the assignment ended.' },
        { speaker: 'hero', channel: 'hero', text: 'Closed. I will wait here until the next one is handed down.' },
      ],
      [
        { speaker: 'official', channel: 'guild', text: `Quest paperwork says ${scope} and completed. Nobody has verified the objective, and the objective is not disputing it.` },
        { speaker: 'support', channel: 'guild', text: 'Completion recorded. Morale forms will follow at the usual interval.' },
        { speaker: 'hero', channel: 'hero', text: 'Filed as complete. No further instruction has been received.' },
      ],
      [
        { speaker: 'official', channel: 'whisper', text: `The ${scope} brief is completed. The wording that made it hard has been retained for reuse.` },
        { speaker: 'field', channel: 'party', text: 'I have walked this back to the office. The office was not expecting me.' },
        { speaker: 'hero', channel: 'hero', text: 'Returned. The assignment is closed and the walk is not reimbursable.' },
      ],
    ] as const, candidate);
  }
  if (candidate.kind === 'quest' && event.type === 'quest_started') {
    const scope = world.context.assignmentScope ?? 'local';
    const status = 'approved';
    return variant([
      [
        { speaker: 'official', channel: 'whisper', text: `A ${scope} assignment has been ${status}. Its objectives remain somebody else’s handwriting.` },
        { speaker: 'field', channel: 'party', text: 'Route confidence is high because the route has declined to comment.' },
        { speaker: 'hero', channel: 'hero', text: 'Acknowledged by the only participant contractually available.' },
      ],
      [
        { speaker: 'official', channel: 'guild', text: `Quest paperwork says ${scope} and ${status}. Adventure has been notified.` },
        { speaker: 'field', channel: 'party', text: 'I have marked every uncertain direction as scenic.' },
        { speaker: 'hero', channel: 'hero', text: 'Proceed until the objective becomes retrospectively obvious.' },
      ],
      [
        { speaker: 'official', channel: 'whisper', text: `The ${scope} brief is ${status}; interpretation remains an unpaid specialization.` },
        { speaker: 'field', channel: 'party', text: 'The map agrees in principle and objects to specifics.' },
        { speaker: 'hero', channel: 'hero', text: 'Excellent. Ambiguity is lighter than provisions.' },
      ],
    ] as const, candidate);
  }
  if (candidate.kind === 'equipment' && (event.type === 'equipment_gained' || event.type === 'equipment_purchased')) {
    const filing = world.equipment?.label ?? 'serviceable';
    const source = event.type === 'equipment_purchased' ? 'purchase' : 'receipt';
    return variant([
      [
        { speaker: 'logistics', channel: 'guild', text: `${filing} equipment ${source} confirmed. Provenance is now somebody else’s problem.` },
        { speaker: 'support', channel: 'guild', text: 'Combat contribution remains none; confidence contribution has been overfunded.' },
        { speaker: 'hero', channel: 'hero', text: 'I accept it in my capacity as everyone present.' },
      ],
      [
        { speaker: 'logistics', channel: 'party', text: `${filing} equipment entered by ${source}. Eligibility was unanimous among the absent.` },
        { speaker: 'support', channel: 'party', text: 'No combat effect is modeled, which greatly simplifies the warranty.' },
        { speaker: 'hero', channel: 'hero', text: 'Equip the paperwork somewhere load-bearing.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${source} filed as ${filing}. The item has declined further examination.` },
        { speaker: 'support', channel: 'guild', text: 'Its tactical effect is none, presented with unusual confidence.' },
        { speaker: 'hero', channel: 'hero', text: 'Then it perfectly matches our strategic doctrine.' },
      ],
    ] as const, candidate);
  }
  if (candidate.kind === 'loot' && event.type === 'item_gained') {
    /*
     * Some of these name the thing and some deliberately refuse to.
     *
     * Loot is the most repetitive scene in the game by a wide margin — measured over 636 lines, it
     * reused 26 distinct sentences 113 times, a 4.3× reuse against the market scene's 1.4×. The
     * difference is not bank size: the market has a comparable number of variants and stays fresh
     * because it interpolates the item's name and the gold, so its variety comes from the data.
     * Loot said "1 inventory unit" 113 times and had nothing to vary on.
     *
     * But the fix is not to name the thing everywhere. Half of these lines are jokes *about* not
     * naming it — "Source remains professionally unspecified", "Provenance has taken personal
     * leave" — and quoting the item into those would explain away the gag. So the naming variants
     * are additions rather than replacements: the bureaucratic refusals stay exactly as they were,
     * and the drops that do name it get their variety from the item tables, which are the funniest
     * strings in the project.
     *
     * Bounded for the same reason the sale is: an imported save can carry a name of any length, and
     * this text is spoken by the screen-reader path.
     */
    const found = boundedLabel(event.name, 'an unlabelled find', 48);
    const some = event.quantity === 1 ? found : `${formatGameNumber(event.quantity)} × ${found}`;
    return variant([
      [
        { speaker: 'logistics', channel: 'guild', text: `${some} recovered. The name was on it; nobody has verified that it is the name of this.` },
        { speaker: 'support', channel: 'guild', text: 'Filed as described by itself.' },
        { speaker: 'hero', channel: 'hero', text: 'Every object here is on its own word.' },
      ],
      [
        { speaker: 'logistics', channel: 'party', text: `${some} entered the manifest. The manifest has spelled it differently.` },
        { speaker: 'support', channel: 'party', text: 'Both spellings have been retained.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${some} acquired, which the catalogue lists under a heading that predates it.` },
        { speaker: 'official', channel: 'guild', text: 'The heading will not be revised. The heading has seniority.' },
        { speaker: 'hero', channel: 'hero', text: 'Then it is older than the thing it describes, like most of this.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${formatGameNumber(event.quantity)} inventory unit${event.quantity === 1 ? '' : 's'} received. Source remains professionally unspecified.` },
        { speaker: 'support', channel: 'guild', text: 'No rarity, competition, or combat value has been inferred from the receipt.' },
        { speaker: 'hero', channel: 'hero', text: 'File it under possessions acquired without conversational consent.' },
      ],
      [
        { speaker: 'logistics', channel: 'party', text: `Receipt confirmed for ${formatGameNumber(event.quantity)} inventory unit${event.quantity === 1 ? '' : 's'}. Provenance has taken personal leave.` },
        { speaker: 'support', channel: 'party', text: 'The carrying burden is real; all heroic interpretation remains optional.' },
        { speaker: 'hero', channel: 'hero', text: 'Retain first. Develop standards during the next fiscal dungeon.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${formatGameNumber(event.quantity)} inventory unit${event.quantity === 1 ? '' : 's'} entered the manifest without making eye contact.` },
        { speaker: 'support', channel: 'guild', text: 'Acquisition is confirmed. Glory has not submitted supporting evidence.' },
        { speaker: 'hero', channel: 'hero', text: 'Then the paperwork and I are equally equipped.' },
      ],
      [
        { speaker: 'logistics', channel: 'party', text: `Intake of ${formatGameNumber(event.quantity)} unit${event.quantity === 1 ? '' : 's'} logged. The previous owner has not been located and is not being sought.` },
        { speaker: 'support', channel: 'party', text: 'Sentimental value has been assessed at the usual figure.' },
        { speaker: 'hero', channel: 'hero', text: 'Record it as found, which is nearly true.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${formatGameNumber(event.quantity)} unit${event.quantity === 1 ? '' : 's'} recovered. The previous holder is not available for comment.` },
        { speaker: 'field', channel: 'party', text: 'Recovery was uncontested at the point of recovery.' },
      ],
      [
        { speaker: 'logistics', channel: 'party', text: `Intake of ${formatGameNumber(event.quantity)}. Filed under things that were already there.` },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${formatGameNumber(event.quantity)} unit${event.quantity === 1 ? '' : 's'} logged against a category invented this morning.` },
        { speaker: 'official', channel: 'guild', text: 'The category has since been ratified retroactively.' },
        { speaker: 'hero', channel: 'hero', text: 'I invent categories the way other people trip.' },
      ],
      [
        { speaker: 'logistics', channel: 'party', text: `Acquisition of ${formatGameNumber(event.quantity)} confirmed. Nobody has claimed it and nobody has ruled that out.` },
        { speaker: 'support', channel: 'party', text: 'Received.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `Manifest amended by ${formatGameNumber(event.quantity)}. The amendment is longer than the item.` },
        { speaker: 'support', channel: 'guild', text: 'Storage has been notified and has responded with a form.' },
        { speaker: 'hero', channel: 'hero', text: 'I shall carry it until carrying it becomes the story.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${formatGameNumber(event.quantity)} unit${event.quantity === 1 ? '' : 's'} accessioned. The catalogue has been asked to make room and has declined.` },
        { speaker: 'support', channel: 'guild', text: 'No ceremony is scheduled. None was requested.' },
        { speaker: 'hero', channel: 'hero', text: 'Good. Ceremony weighs the same as everything else.' },
      ],
    ] as const, candidate);
  }
  if (candidate.kind === 'market' && event.type === 'inventory_sold') {
    const sale = post.marketSale;
    // The quartermaster names the thing.
    //
    // `marketSale` has carried the item's name all along and the scene threw it away, so the busiest
    // line in the game reported "1 unit became 1 gold" — which is true, tells the player nothing,
    // and wastes the funniest string available. The names are the joke; a sale is the one moment
    // they are worth quoting, because it is the last time that item is ever mentioned.
    //
    // Bounded, because an imported save can carry a name of any length and this text is spoken by
    // the screen-reader path. Pluralised the way the loot scene has always done it: hard-coding
    // "units" made the single-item sale, which is most of them, read "1 units", 165 times in a
    // measured half hour.
    const soldLabel = sale ? boundedLabel(sale.name, 'an unnamed lot', 48) : '';
    const facts = sale
      ? sale.quantity === 1
        ? `${soldLabel} became ${formatGameNumber(sale.gold)} gold`
        : `${formatGameNumber(sale.quantity)} × ${soldLabel} became ${formatGameNumber(sale.gold)} gold`
      : `${formatGameNumber(event.gold)} gold was received`;
    return variant([
      [
        { speaker: 'logistics', channel: 'world', text: `${facts}. The market has declined to explain itself.` },
        { speaker: 'support', channel: 'world', text: 'The disposal receipt is emotionally complete and legally decorative.' },
        { speaker: 'hero', channel: 'hero', text: 'Classify the empty carrying capacity as a strategic gain.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${facts}; valuation was performed by a hat near the counter.` },
        { speaker: 'support', channel: 'guild', text: 'I find the transaction fiscally plausible and spiritually damp.' },
        { speaker: 'hero', channel: 'hero', text: 'Record my bargaining posture as stationary.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${facts}. The counter has been asked to confirm and has nodded.` },
        { speaker: 'support', channel: 'guild', text: 'Noted.' },
        { speaker: 'hero', channel: 'hero', text: 'A nod is a receipt in the jurisdictions that matter.' },
      ],
      [
        { speaker: 'logistics', channel: 'world', text: `${facts}, before adjustments nobody has proposed.` },
        { speaker: 'support', channel: 'world', text: 'The adjustment window opened and closed while we were carrying things.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${facts}. The stall is unattended and the price is firm.` },
        { speaker: 'hero', channel: 'hero', text: 'I negotiated with the absence and it held.' },
      ],
      [
        { speaker: 'logistics', channel: 'world', text: `${facts}. The transaction has been backdated to before it was doubted.` },
        { speaker: 'support', channel: 'world', text: 'Doubt is retained separately for audit.' },
        { speaker: 'hero', channel: 'hero', text: 'Then the audit and I are in agreement about something.' },
      ],
      [
        { speaker: 'logistics', channel: 'guild', text: `${facts}, which the ledger accepted without reading.` },
      ],
      [
        { speaker: 'logistics', channel: 'world', text: `${facts}. Commerce continues despite the evidence.` },
        { speaker: 'support', channel: 'world', text: 'Vendor confidence rose sharply after we stopped asking questions.' },
        { speaker: 'hero', channel: 'hero', text: 'A triumph for inventory reduction and selective arithmetic.' },
      ],
    ] as const, candidate);
  }
  if (candidate.kind === 'zone' && event.type === 'task_started') {
    // The shelving sent the hero to market, and until now nothing in the channel said so.
    //
    // `task_started` carries `reason.{carriedCubits, capacityCubits}` — the two figures the engine
    // actually compared when it decided to break off and sell. The activity log captions them; no
    // chat line has ever read them, on what is the most frequent boundary in the game.
    //
    // The joke is the attribution rather than the arithmetic: the hero is not going to town because
    // anybody decided to, they are going because a shelf filled up. Both figures are the engine's
    // own, interpolated rather than recomputed.
    if (event.reason !== undefined && event.task.type === 'heading_to_market') {
      const { carriedCubits, capacityCubits } = event.reason;
      const carried = formatGameNumber(carriedCubits);
      const capacity = formatGameNumber(capacityCubits);
      return variant([
        [
          { speaker: 'logistics', channel: 'guild', text: `Capacity reached at ${carried} of ${capacity} cubits. The hero is being routed to market by the shelving rather than by a decision.` },
          { speaker: 'official', channel: 'guild', text: 'A request to raise the limit has been received and filed adjacent to the limit.' },
          { speaker: 'hero', channel: 'hero', text: 'I go where the arithmetic points.' },
        ],
        [
          { speaker: 'logistics', channel: 'guild', text: `The load stands at ${carried} against ${capacity}. Procurement has declared the difference to be zero and the matter closed.` },
          { speaker: 'support', channel: 'guild', text: 'The load was within tolerance for the whole of the memo describing it.' },
          { speaker: 'hero', channel: 'hero', text: 'Nothing is heavy. There is simply a great deal of it.' },
        ],
        [
          { speaker: 'logistics', channel: 'party', text: `Carrying ${carried} of ${capacity}. Further acquisition has been deferred to the return leg.` },
          { speaker: 'official', channel: 'party', text: 'The shelf has been thanked for its service and asked to continue.' },
          { speaker: 'hero', channel: 'hero', text: 'Market, then. On the recommendation of a shelf.' },
        ],
      ] as const, candidate);
    }
    if (world.context.venue === 'road') {
      return variant([
        [
          { speaker: 'field', channel: 'party', text: `Route opened through ${world.context.spokenLocation}. Direction is now officially forward.` },
          { speaker: 'logistics', channel: 'party', text: 'The travel manifest has recognized motion and withdrawn its objection.' },
          { speaker: 'hero', channel: 'hero', text: 'Proceed until the road becomes somebody else’s jurisdiction.' },
        ],
        [
          { speaker: 'field', channel: 'party', text: `Travel now proceeds along ${world.context.spokenLocation}, with confidence traveling separately.` },
          { speaker: 'logistics', channel: 'party', text: 'Departure was approved shortly after it became irreversible.' },
          { speaker: 'hero', channel: 'hero', text: 'Keep the horizon occupied while I supervise the distance.' },
        ],
        [
          { speaker: 'field', channel: 'guild', text: `Road assignment confirmed: ${world.context.spokenLocation}. The map appears cautiously involved.` },
          { speaker: 'logistics', channel: 'guild', text: 'Travel expenses remain zero and therefore beyond audit.' },
          { speaker: 'hero', channel: 'hero', text: 'Declare the detour intentional and resume competence.' },
        ],
        [
          { speaker: 'field', channel: 'party', text: `${world.context.spokenLocation} has been entered on the strength of a previous assurance.` },
          { speaker: 'logistics', channel: 'party', text: 'The assurance was verbal and is no longer available for comment.' },
          { speaker: 'hero', channel: 'hero', text: 'Then we are making excellent unverified progress.' },
        ],
        [
          { speaker: 'field', channel: 'guild', text: `Passage through ${world.context.spokenLocation} is under way and has not been contested.` },
          { speaker: 'logistics', channel: 'guild', text: 'Nobody is positioned to contest it, which the file records as agreement.' },
          { speaker: 'hero', channel: 'hero', text: 'Unanimity is easier with a smaller quorum.' },
        ],
      ] as const, candidate);
    }
    return variant([
      [
        { speaker: 'field', channel: 'party', text: `Scouting confirms ${world.context.spokenLocation} is where we have just arrived.` },
        { speaker: 'logistics', channel: 'party', text: 'The route manifest predicted this after being corrected.' },
        { speaker: 'hero', channel: 'hero', text: 'Continue discovering it immediately behind me.' },
      ],
      [
        { speaker: 'field', channel: 'party', text: `We have reached ${world.context.spokenLocation}, according to the sign facing the other way.` },
        { speaker: 'logistics', channel: 'party', text: 'Travel expenses remain zero and therefore beyond audit.' },
        { speaker: 'hero', channel: 'hero', text: 'Declare the detour intentional and resume competence.' },
      ],
      [
        { speaker: 'field', channel: 'guild', text: `${world.context.spokenLocation} located. It was under Location in the index.` },
        { speaker: 'logistics', channel: 'guild', text: 'Arrival has been backdated to the moment it became undeniable.' },
        { speaker: 'hero', channel: 'hero', text: 'Splendid. Begin being expected here.' },
      ],
    ] as const, candidate);
  }
  const raid = post.interplotRole === 'nemesis' && post.act >= 10;
  const milestone = event.type === 'act_completed'
    ? `Act ${formatGameNumber(event.act)} has closed`
    : `${raid ? 'A raid-class' : 'A dungeon'} boss milestone has opened`;
  // The sheet, at the one moment a raid would read one out.
  //
  // `raidMuster` has produced this since it was written and it reaches a list in the world console.
  // Meanwhile the raid milestone — the loudest scene the game has — opened on a remark about quorum
  // and never said who was or was not there. The muster is the funnier artifact and it was sitting
  // one function away.
  //
  // Gated on the muster rather than on the `raid` flag above, which is the honest condition: the
  // flag is a fact about the framing, the muster is a fact about the venue, and only the second
  // guarantees there is a sheet. An act closing is not a raid and takes no attendance.
  //
  // ## Why the exceptions and not the roll
  //
  // The first draft read all four names with their labels and ran to twenty words against the field
  // seat's cap of nineteen. That cap is the voice rather than an obstacle — the raid coordinator's
  // register is a "compressed readiness order" and their declared preoccupation is quorum — so the
  // line compresses instead of the cap moving.
  //
  // Compressing to the exceptions is also the better joke. Who turned up is a list; who did not is a
  // sheet that never closed a record, which is the thing worth reading. Names and labels stay
  // verbatim, so the muster's inability to tell somebody missing from somebody long departed
  // survives — tidying that into a count is exactly what would kill it.
  //
  // Two at most, and the wording never claims to be the whole roll. "The sheet notes" is true of a
  // partial reading; "roll call" would not be.
  //
  // ## The event has to be excluded explicitly
  //
  // The venue is not enough on its own, which is what the first version of this got wrong. An
  // `act_completed` snapshot can carry a nemesis cinematic as its *next* task, and `venueForTask`
  // reads `nextTask` — so the venue is `raid` at an act closing and `raidMuster` duly returns a
  // sheet. The paragraph above said "an act closing is not a raid and takes no attendance" while
  // the gate said only "is there a sheet", and the two disagreed for a year of act ordinals:
  //
  //   [raid] Act 14 has closed. Every name on the sheet is attending.
  //   [hero] Mark me present, and the rest as read.
  //
  // The test I wrote alongside it covered the opposite direction — framing without a venue — which
  // is the case that motivated the design rather than the case that breaks it.
  const muster = event.type === 'act_completed' ? null : raidMuster(world.context);
  if (muster !== null && muster.length > 0) {
    const exceptions = muster.filter(({ attendance }) => attendance !== 'present').slice(0, 2);
    const sheet = exceptions.length === 0
      ? 'Every name on the sheet is attending'
      : `The sheet notes ${exceptions.map(({ name, attendance }) => `${name} ${attendanceLabel(attendance)}`).join('; ')}`;
    return variant([
      [
        { speaker: 'field', channel: 'raid', text: `${milestone}. ${sheet}.` },
        dkpFor(candidate, event.type === 'act_completed'),
        { speaker: 'hero', channel: 'hero', text: 'Mark me present, and the rest as read.' },
      ],
      [
        { speaker: 'field', channel: 'raid', text: `${milestone}. ${sheet}, unamended.` },
        dkpFor(candidate, event.type === 'act_completed'),
        { speaker: 'hero', channel: 'hero', text: 'A full complement, by the standards of the sheet.' },
      ],
      [
        { speaker: 'field', channel: 'raid', text: `${milestone}. ${sheet}, as at the last revision.` },
        dkpFor(candidate, event.type === 'act_completed'),
        { speaker: 'hero', channel: 'hero', text: 'I will hold the line and the clipboard.' },
      ],
    ] as const, candidate);
  }

  return variant([
    [
      { speaker: 'field', channel: raid ? 'raid' : 'party', text: `${milestone}. Quorum is zero external attendees.` },
      dkpFor(candidate, event.type === 'act_completed'),
      { speaker: 'hero', channel: 'hero', text: 'I volunteer to be both ready check and exception.' },
    ],
    [
      { speaker: 'field', channel: raid ? 'raid' : 'world', text: `${milestone}; attendance remains impressively theoretical.` },
      dkpFor(candidate, event.type === 'act_completed'),
      { speaker: 'hero', channel: 'hero', text: 'Commence the ceremony of appearing prepared.' },
    ],
    [
      { speaker: 'field', channel: raid ? 'raid' : 'party', text: `${milestone}. Formation is one person wide and indefinitely deep.` },
      dkpFor(candidate, event.type === 'act_completed'),
      { speaker: 'hero', channel: 'hero', text: 'Mark me present, inevitable, and poorly supervised.' },
    ],
  ] as const, candidate);
}

/**
 * How many of a scene's written lines are actually spoken.
 *
 * Every scene used to be three: logistics speaks, support agrees, the hero replies — 435 times out
 * of 435, always in that order. Nobody's chat looks like a call-and-response liturgy, and a fixed
 * three-beat shape reads as generated no matter how good the individual lines are. It is the shape
 * of a written joke rather than of a conversation.
 *
 * Weighted toward one, which is what most utterances in a real channel are. The three-line case
 * survives because some exchanges earn it, not because every one does.
 */
const SCENE_LENGTHS = [1, 1, 1, 1, 1, 2, 2, 2, 3] as const;

/**
 * Trims a scene to the lines it actually says.
 *
 * A prefix, deliberately, after trying it the other way. Choosing *which* line survives spreads the
 * speaking seats more evenly, which is a real goal — but the opening line is the one carrying the
 * interpolated facts, the quantity sold or the location reached, while the lines after it are
 * colour. Dropping it left scenes that told the player nothing about what had happened, and five
 * existing tests caught exactly that by asserting a typed fact appears.
 *
 * So the facts always survive and the commentary is what gives way. Seat imbalance is a real
 * problem and this is the wrong lever for it: the answer is more kinds of message — ambient lines,
 * two personas talking to each other — not mangling the scenes that already work.
 */
function spokenLines(candidate: SceneCandidate, lines: readonly SceneLine[]): readonly SceneLine[] {
  // A promotion and a boss milestone are heard whole. Nothing else is.
  //
  // Truncation exists because every scene used to be the same three beats in the same order, and a
  // fixed shape reads as generated however good the lines are. That argument is about the *ordinary*
  // scene — a kill, a sale, a zone, of which there are thousands. A level is not ordinary: it is
  // rare, it is the one moment a room reacts to rather than narrates, and drawing its length like
  // any other left most promotions rendering as a single announcement with nobody answering.
  //
  // The rule this follows is one the cadence layer already applies: `ALWAYS_HEARD` lists exactly
  // `milestone`, `level` and `catch_up`, and refuses to suppress them. A scene the channel may never
  // silence is a scene worth hearing out, so the two that are also *written* as scenes get their
  // written length. Still three lines, so the bound every other scene is held to is not widened.
  // `catch_up` is one line by construction and needs no exemption.
  if (candidate.kind === 'level' || candidate.kind === 'milestone') return lines;

  const { hero, completedTasks } = candidate.source.record.post;
  const key = `len:${hero.name}:${candidate.kind}:${candidate.source.activityId}:${completedTasks}`;
  return lines.slice(0, SCENE_LENGTHS[stableChoice(key, SCENE_LENGTHS.length)]!);
}

function projectScene(candidate: SceneCandidate): readonly SocialEntry[] {
  const cast = castFor(candidate.source);
  const sceneId = `social:${candidate.source.activityId}:${candidate.kind}`;
  return spokenLines(candidate, linesFor(candidate)).map((line, index) => ({
    id: `${sceneId}:${index}`,
    sceneId,
    sceneKind: candidate.kind,
    sourceActivityId: candidate.source.activityId,
    channel: line.channel,
    speaker: speakerFor(line, cast),
    text: bound(line.text),
  }));
}

export function projectSocialBatch(
  sources: readonly IdentifiedGameTransitionRecord[],
  // The assignment ring off the sheet the store already holds. Optional because every other caller
  // of this function — tests, the activity log's own projection — has no sheet to offer, and a
  // batch without one simply says nothing about recurrence rather than guessing.
  questHistory?: readonly string[] | undefined,
): readonly SocialEntry[] {
  const recurring = recurringAssignments(sources, questHistory);
  const scenes = splitTaskEnvelopes(sources)
    .map((envelope) => chooseCandidate(envelope, recurring))
    .filter((candidate): candidate is SceneCandidate => candidate !== undefined);
  // The most interesting scenes, not the last ones.
  //
  // This used to take `slice(-MAX_DETAILED_SCENES)`, which during ordinary play is the same thing —
  // there is only one. During a drain it is not: a player returning after ten minutes was shown
  // whichever three scenes happened to fall at the end of the batch, so a level-up and an act
  // closing could be consolidated away while three sales survived because they came last.
  //
  // `chooseCandidate` already ranks these. Milestones are 100 and 95, a level 90, quests 85 and 80,
  // equipment 75 and 70, loot 65, a sale 60 — that ladder is a statement about what is worth
  // reading, and nothing was using it for this. Selection is by priority; the survivors are then put
  // back in the order they happened, because a feed that reordered itself by importance would stop
  // being a transcript.
  const ranked = [...scenes.entries()]
    .sort(([leftIndex, left], [rightIndex, right]) => right.priority - left.priority || rightIndex - leftIndex)
    .slice(0, MAX_DETAILED_SCENES)
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex);
  const retained = ranked.map(([, candidate]) => candidate);
  const detailed = retained.flatMap(projectScene);
  const suppressed = scenes.length - retained.length;
  if (suppressed === 0 || retained.length === 0) return detailed;
  const first = retained[0] as SceneCandidate;
  const sceneId = `social:${first.source.activityId}:catch-up`;
  return [{
    id: `${sceneId}:0`,
    sceneId,
    sceneKind: 'catch_up',
    sourceActivityId: first.source.activityId,
    channel: 'system',
    speaker: SYSTEM_SPEAKER,
    // The institution's words, not the engine's.
    //
    // This is the first line a returning watcher reads, and it used to say "consolidated during
    // accelerated progress" — "routine social scene" and "accelerated progress" are both terms from
    // the transition layer, and neither is something an organisation would write. Minuting rather
    // than transcribing is exactly what consolidation *is*, said by a body that takes minutes.
    //
    // The figure stays. It is the one thing this line must not lose: it is the only place the
    // watcher learns how much they missed.
    text: `The channel continued in the interval. ${suppressed} routine scene${suppressed === 1 ? ' was' : 's were'} minuted rather than transcribed.`,
  }, ...detailed];
}

/**
 * How the ambient lanes are weighted against each other.
 *
 * Ambient carries the most because it is the lane that establishes the channel exists without the
 * hero. Reactions are next because they are what fixes the word-length distribution. The two
 * running bits are rare on purpose: a feud that surfaced often would stop being a slow burn, and a
 * question re-asked every minute is nagging rather than forlorn.
 */
const AMBIENT_LANES = [
  'ambient', 'ambient', 'ambient',
  'reaction', 'reaction', 'reaction',
  'trade',
  'feud',
  'question',
  // The seat everybody needs and nobody thanks. One lane's worth, like the other running bits: it
  // rewards watching across an hour and would stop being a slow burn if it came round often.
  'utility',
  // The auction. One lane's worth: the register is loud and the forms are short, so it reads as a
  // channel doing its job rather than as the feed shouting.
  'auction',
  // The building talking to nobody. One lane's worth and no more: a notice is only funny when it is
  // rare enough to read as scheduled rather than as chatter.
  'notice',
  // Two lanes about what the hero is wearing. Kept scarce on purpose: the loadout changes rarely, so
  // a lane that fired often would say the same thing about the same item all afternoon.
  'item',
  'blame',
  // One thing out of everything the archive holds. Ranked last of the seven and kept to one lane's
  // worth for the reason it was ranked there: it is the quietest of them, and a room that asked
  // after a different mislaid object every minute would be a room with a storage problem.
  'specimen',
  // Local business, for as long as the hero is standing somewhere that has any. One lane's worth,
  // and the only lane whose availability changes during a session rather than across one — a road
  // and a cinematic have no catalogue, so the channel loses its local colour and later gets it back.
  'venue',
  // A period the file named after the fact. One lane's worth: the bore is funny at the rate a bore
  // is actually encountered, and a clerk who raises the same decade every minute is a different and
  // worse joke.
  'era',
  // A benchmark from a ledger that outlives everyone citing it. One lane's worth, and separate from
  // the item lane on purpose: that one is about what is worn, this one is about what the file
  // remembers.
  'exhibit',
  // Somebody still posting to whoever held this file three characters ago. One lane's worth, and
  // reachable only once the roster holds two characters — which makes it the rarest thing the
  // channel does and the one most worth stumbling on.
  'predecessor',
  // The name the hero keeps filing against, said out loud by somebody who has stopped pretending it
  // is a stranger. One lane's worth: the joke is that the quartermaster has quietly reclassified an
  // adversary as a colleague, and a reclassification announced every minute is a running gag rather
  // than a drift.
  'docket',
  // The same adjective in three slots at once, which the filing has always found and nobody has
  // ever said. One lane's worth and gated: measured over three 4 000-tick runs it is available for
  // 0%, 15% and 15% of a session, and when it is available it is the same modifier the whole time,
  // because equipment changes fourteen times in two thousand ticks. Any louder and the channel
  // would spend an afternoon on one adjective.
  'modifier',
  // Two lanes' worth, because an exchange is the form that most changes how the channel reads and
  // it is the only one that speaks more than once.
  'exchange', 'exchange',
  // A mistell is an exchange that disagrees with itself about where it was going. One lane's worth:
  // it is the most conspicuous thing the channel does, and a room where somebody posts to the wrong
  // window every minute is a room with a problem rather than a joke.
  'mistell',
  // Only reachable while the loadout is entry-tier, which is a state a character leaves within
  // minutes and never returns to. Weighted as though it were an ordinary lane so it is loud while
  // it lasts rather than rare during the one window it can occur in.
  'onboarding',
] as const;

/**
 * How many completed tasks a running bit spends on one beat.
 *
 * Long, because these are the lines that reward watching rather than the lines that fill a gap.
 */
const AMBIENT_BEAT_TASKS = 40;

/**
 * The standing at or below which the hall is still explaining itself.
 *
 * Two, which covers the first two rungs of every slot's vocabulary — a `Lanyard`, a `Visitor Badge`,
 * a `Cover Note`. Generated equipment reaches past that within the first few upgrades, so this is a
 * window rather than a mode.
 */
const ONBOARDING_STANDING = 2;

/**
 * What the institution remembers, offered to the channel.
 *
 * This was one optional `LoadoutFiling`, and the narrowness was the problem. `projectAmbient` is the
 * only funnel into the guild's non-event chatter, and the store calling it is holding `caseload`,
 * `commendations`, `specimens` and a live `roster` on the same line — every one of them a globally
 * scoped institutional memory that outlives the hero, and none of them reaching a word of chat. The
 * building has a filing cabinet and has never once mentioned it.
 *
 * A bag rather than a growing parameter list, because the alternative is a seventh positional
 * argument nobody can read at a call site. Every field is optional and every lane that reads one
 * falls back when it is missing, so a caller that knows less produces a quieter channel rather than
 * a broken one — which is what the tests do, and what an older save does.
 *
 * Nothing here is engine state and nothing here is new state. All of it is already computed, already
 * persisted, and already on screen somewhere nobody watches.
 */
export interface InstitutionalMemory {
  /** What the hero is wearing, as the world console files it. */
  readonly loadout?: LoadoutFiling | undefined;
  /** Who the hero keeps filing against, across every character the roster has held. */
  readonly caseload?: Caseload | undefined;
  /**
   * Who held this file before, by seniority rather than recency.
   *
   * Already computed rather than derived here, because `predecessorFor` needs the current name as
   * well as the roster and only the caller has both. Null is the ordinary state of a fresh save.
   */
  readonly predecessor?: Predecessor | null | undefined;
  /**
   * Personal bests, of which the chatter reads only the exhibit.
   *
   * The whole ledger rather than the one derived answer, unlike `predecessor` above: `finestExhibit`
   * needs nothing the caller has and the store already holds this object, so deriving it here keeps
   * one definition of "finest" rather than two places that could disagree about ties.
   */
  readonly commendations?: Commendations | undefined;
  /**
   * Where the hero is standing, in the three fields the bulletin reads.
   *
   * Narrowed to those three rather than the whole `WorldContext`, so a caller only has to know what
   * is actually consumed — and so this cannot quietly start depending on the rest of the projection.
   */
  readonly venue?: Pick<WorldContext, 'venue' | 'location' | 'act'> | undefined;
  /** Everything the hero has ever held, once each, across every character the roster has held. */
  readonly specimens?: SpecimenLog | undefined;
}

/**
 * A line the guild says when the hero has done nothing worth mentioning.
 *
 * Deterministic from the hero and the task count, the same way everything else here is, so the same
 * save always produces the same channel. Returns exactly one entry: this is the lane that models
 * somebody saying a thing and the channel moving on, and a burst of ambient would be a caption
 * track with a different subject.
 */
export function projectAmbient(
  hero: HeroIdentity,
  completedTasks: number,
  memory: InstitutionalMemory = {},
): readonly SocialEntry[] {
  const { loadout, caseload, predecessor, commendations, venue, specimens } = memory;
  if (!Number.isFinite(completedTasks) || completedTasks < 0) return [];
  const cast = castForHero(hero);
  const key = `ambient:${hero.name}:${hero.race}:${hero.className}:${completedTasks}`;
  let lane = AMBIENT_LANES[stableChoice(`lane:${key}`, AMBIENT_LANES.length)]!;
  // Nothing worth citing means nothing to say about it. Falls back rather than falling silent,
  // because a lane that produced no line would quietly lower the rate the cadence was tuned to.
  if ((lane === 'item' || lane === 'blame') && !loadout?.itemOfRecord) lane = 'ambient';
  // Same reasoning, different fact: three slots sharing a modifier is a coincidence rather than a
  // guarantee, and most loadouts do not have one.
  if (lane === 'modifier' && !loadout?.repeatedModifier) lane = 'ambient';
  // A caseload the store has not passed, or one nothing has been filed into yet. Both are ordinary:
  // the roster starts empty and the tests pass no memory at all.
  const docket = caseload ? mostLitigated(caseload) : null;
  if (lane === 'docket' && docket === null) lane = 'ambient';
  // A roster holding one character, which is every save until somebody makes a second one.
  if (lane === 'predecessor' && !predecessor) lane = 'ambient';
  // Empty until something has been equipped, and empty again for any ledger whose entries the
  // analyser cannot resolve a bare noun from.
  const exhibit = commendations ? finestExhibit(commendations) : null;
  if (lane === 'exhibit' && exhibit === null) lane = 'ambient';
  // The longest period the file can name, which needs a matter recurring across more than one act.
  // Empty for every caseload until then, and for every caller that passes no memory.
  const era = caseload ? namedEras(caseload)[0] ?? null : null;
  if (lane === 'era' && era === null) lane = 'ambient';
  // Null on a road and in a cinematic, which is `venueBulletin`'s own decision rather than one
  // repeated here: a road is passed through rather than administered, and a cinematic is not a
  // place at all.
  const bulletin = venue ? venueBulletin(venue) : null;
  if (lane === 'venue' && (bulletin === null || bulletin.length === 0)) lane = 'ambient';
  // Empty until the hero has picked something up, and empty for a log holding only equipment —
  // not a state a save reaches, but one a caller can hand over.
  const curios = specimens ? itemSpecimens(specimens) : [];
  if (lane === 'specimen' && curios.length === 0) lane = 'ambient';
  // The best thing the hero owns is still entry-tier, so the hall explains itself to them. Anything
  // better equipped ends it, which is why it needs no timer and cannot outstay its welcome.
  if (lane === 'onboarding' && (loadout?.itemOfRecord?.standing ?? 0) > ONBOARDING_STANDING) lane = 'ambient';

  // The two running bits step with the task counter and wrap, so a feud restarts rather than
  // resolving.
  //
  // Computed here, and only here. `chatterSchedule` used to carry a `beatIndex` with the same
  // arithmetic and a second copy of the forty, plus a `clampBeatAdvance` meant to keep a bit at
  // conversation speed through a catch-up drain. Neither was ever called, and the clamp's docstring
  // asserted a fix that therefore never ran. The drain does jump the beat — but this projection is
  // pure and recomputed from the counter on every tick, the intervening lines were never displayed
  // because the player was away, and the one discontinuity is already the thing a `catch_up` scene
  // exists to explain. Clamping would have meant threading a remembered beat through a function
  // whose determinism contract is that it remembers nothing.
  const beat = (beats: readonly AmbientLine[]) =>
    beats[Math.floor(completedTasks / AMBIENT_BEAT_TASKS) % beats.length]!;

  // Deferred rather than computed, because the exchange lane discards it. Drawing a line and
  // throwing it away is harmless — every draw here is a pure hash — but it reads as if the value
  // matters to a lane it never reaches.
  const line = (): AmbientLine => lane === 'onboarding'
    ? ONBOARDING_LINES[stableChoice(`onboard:${key}`, ONBOARDING_LINES.length)]!
    : lane === 'item'
    ? ITEM_OF_RECORD_LINES[stableChoice(`item:${key}`, ITEM_OF_RECORD_LINES.length)]!
    : lane === 'modifier'
      ? REPEATED_MODIFIER_LINES[stableChoice(`modifier:${key}`, REPEATED_MODIFIER_LINES.length)]!
    : lane === 'docket'
      ? DOCKET_LINES[stableChoice(`docket:${key}`, DOCKET_LINES.length)]!
    : lane === 'exhibit'
      ? EXHIBIT_LINES[stableChoice(`exhibit:${key}`, EXHIBIT_LINES.length)]!
    : lane === 'era'
      ? ERA_LINES[stableChoice(`era:${key}`, ERA_LINES.length)]!
    : lane === 'venue'
      ? VENUE_LINES[stableChoice(`venue:${key}`, VENUE_LINES.length)]!
    : lane === 'specimen'
      ? SPECIMEN_LINES[stableChoice(`specimen:${key}`, SPECIMEN_LINES.length)]!
    : lane === 'blame'
      ? beat(BLAME_BEATS)
      : lane === 'feud'
    ? beat(FEUD_BEATS)
    : lane === 'utility'
      ? beat(UTILITY_BEATS)
    : lane === 'auction'
      ? AUCTION_LINES[stableChoice(`bid:${key}`, AUCTION_LINES.length)]!
    : lane === 'notice'
      ? SYSTEM_NOTICES[stableChoice(`notice:${key}`, SYSTEM_NOTICES.length)]!
    : lane === 'question'
      ? beat(QUESTION_BEATS)
      : lane === 'trade'
        // Drawn on the hero alone, not the task count, so the same advertisement repeats verbatim
        // for a whole character. That repetition is the joke rather than the failure.
        ? TRADE_LINES[stableChoice(`trade:${hero.name}`, TRADE_LINES.length)]!
        : lane === 'reaction'
          ? REACTION_LINES[stableChoice(`react:${key}`, REACTION_LINES.length)]!
          : AMBIENT_LINES[stableChoice(`say:${key}`, AMBIENT_LINES.length)]!;

  // Every lane says one thing and the channel moves on, except an exchange, which is a unit: half of
  // "Is it shorter?" / "It is a shortcut." is not a shorter joke, it is a different and worse one.
  // The scheduler gates whole scenes anyway, so an exchange arrives entire or not at all.
  const lines: readonly AmbientLine[] = lane === 'exchange'
    ? EXCHANGES[stableChoice(`swap:${key}`, EXCHANGES.length)]!
    : lane === 'mistell'
      ? MISTELLS[stableChoice(`slip:${key}`, MISTELLS.length)]!
      : lane === 'predecessor'
        ? PREDECESSOR_MISTELLS[stableChoice(`held:${key}`, PREDECESSOR_MISTELLS.length)]!
        : [line()];

  const sceneId = `ambient:${completedTasks}:${lane}`;
  return lines.map((spoken, index) => ({
    id: `${sceneId}:${index}`,
    sceneId,
    sceneKind: 'ambient' as const,
    sourceActivityId: -1,
    channel: spoken.channel,
    speaker: {
      id: cast[spoken.seat].id,
      kind: 'cast' as const,
      displayName: cast[spoken.seat].displayName,
      role: cast[spoken.seat].role,
      fictional: true as const,
      automaticHero: false,
    },
    // Interpolated after selection so every lane shares one substitution, and only the bare noun is
    // quoted — a full generated name carries an assessor's mark, and a figure here would assert
    // state nothing computed.
    text: bound(spoken.text
      .replaceAll('{item}', loadout?.itemOfRecord?.base ?? 'equipment')
      .replaceAll('{slot}', loadout?.itemOfRecord?.slot ?? 'loadout')
      // Lower-cased, because these are adjectives mid-sentence and the filing holds them
      // capitalised the way the item names carry them — "Everything the hero owns is Bonded" is a
      // proper noun the world does not have.
      .replaceAll('{modifier}', loadout?.repeatedModifier?.name.toLowerCase() ?? 'unmarked')
      // The name only, never the count. `mostLitigated` returns both, and the count is the one thing
      // that would turn a colleague back into a tally — "filed against forty times" is a statistic,
      // "still no reply" is a person. The bank is asserted to quote no figures either way.
      //
      // Through `displayTarget`, because the caseload keys on a composite the reader never sees.
      .replaceAll('{docket}', docket ? displayTarget(docket.target) : 'the file')
      // The name and nothing else. `predecessorFor` also returns a finished sentence and the service
      // record renders it — but that sentence says "last recorded at level 9", which is the file
      // being careful. The joke here is a room that is not being careful at all.
      .replaceAll('{predecessor}', predecessor?.name ?? 'the previous holder')
      // The bare noun again, for the reason the item lane gives: a generated name carries an
      // assessor's mark, and no line in this bank may quote a figure.
      .replaceAll('{exhibit}', exhibit?.base ?? 'record')
      .replaceAll('{exhibitSlot}', exhibit?.slot ?? 'slot')
      // The name alone. `namedEras` also returns the dated phrase and the service record prints it
      // properly; assembling those ordinals a second time here is how two surfaces start disagreeing
      // about the same period, and this bank states no figures.
      .replaceAll('{era}', era?.name ?? 'intervening')
      // One office off the board of three, drawn from the same key so a scene keeps its office.
      // Quoted whole, because the status after the comma is the joke.
      //
      // Length-guarded rather than optional-chained. `?.[]` skips the whole member access when the
      // base is nullish — which covers a road and a cinematic — but an *empty* array is not nullish,
      // and `stableChoice` throws on a length of zero rather than returning anything. No catalogue
      // is empty today, so this is a hazard rather than a bug here; it was a live crash one line
      // below, where the specimen collection legitimately starts empty.
      .replaceAll('{office}', bulletin && bulletin.length > 0 ? bulletin[stableChoice(`office:${key}`, bulletin.length)]! : 'the office')
      .replaceAll('{venue}', venue?.location ?? 'the district')
      // One out of the whole collection, drawn from the same key so a scene asks after one thing.
      // Guarded before the draw, not after: `?? 'article'` would never have been reached, because
      // `stableChoice` throws on a length of zero instead of returning an index nothing indexes.
      .replaceAll('{specimen}', curios.length > 0 ? curios[stableChoice(`curio:${key}`, curios.length)]! : 'article')),
  }));
}

