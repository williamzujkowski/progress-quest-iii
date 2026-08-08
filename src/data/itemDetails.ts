import { ARMORS, BORING_ITEMS, SPELLS, DEFENSE_ATTRIB, DEFENSE_BAD, ITEM_ATTRIB, ITEM_OFS, MONSTERS, OFFENSE_ATTRIB, OFFENSE_BAD, SHIELDS, SPECIALS, WEAPONS } from './traits';
import { armourTableForSlot } from './armourBySlot';
import { shieldFamily, weaponFamily, type ShieldFamily, type WeaponFamily } from './openingFamilies';
import { analyzeItemMechanics } from '../engine/itemMechanics';
import { storageAllowance } from '../engine/storage';
import { marketFavour } from '../engine/marketFavour';
import { vitalsFlourish } from '../engine/vitalsFlourish';
import { boundedLabel, formatGameNumber, stableIndex } from '../engine/text';
import { substrateStage } from './worldContext';
import type { ArmourSlot, CharacterSheet, EquipSlot } from '../engine/types';

export interface ItemDetails {
  description: string;
  effect: string;
}

const choose = (options: readonly string[], key: string): string => options[stableIndex(key, options.length)] ?? key;
const signedGameNumber = (value: number): string => `${value >= 0 ? '+' : ''}${formatGameNumber(value)}`;

/**
 * Provenance vocabulary, in three eras.
 *
 * The base list is the one the archive was keeping before any of this. The later two are a shade
 * more industrial, and only reach the grid once enough acts have accumulated for the operation to
 * have acquired the vocabulary honestly — an object filed early cannot have been derated by a
 * facility that did not exist yet.
 *
 * Gated on the same schedule as the sited place names, and by the same function, so the map and
 * the objects on it acquire their industrial edge together rather than on two clocks.
 *
 * Nothing here is a measurement. A beat says a thing was handled, never how much of anything it
 * drew, because the engine models none of that.
 */
const DOSSIER_ACTION_ERAS = [
  [
    'approved', 'condemned', 'misfiled', 'insured', 'quarantined',
    'audited', 'reclassified', 'appealed', 'redacted', 'outsourced',
    'backdated', 'witnessed', 'repossessed', 'sanctified', 'returned',
  ],
  ['de-provisioned'],
  ['derated'],
] as const;

const DOSSIER_CONDITION_ERAS = [
  [
    'at intake', 'by candlelight', 'under protest', 'after lunch', 'without jurisdiction',
    'for tax purposes', 'during the evacuation', 'by correspondence', 'pending weather', 'in triplicate',
    'on clerical advice', 'after the witness vanished', 'with ceremonial urgency', 'before testing', 'by the night shift',
  ],
  ['during the brownout'],
  ['while the coolant held', 'pending thermal review'],
] as const;

/** Built once per era rather than per call: an item tooltip is cheap and there are a lot of them. */
function accumulate(eras: readonly (readonly string[])[]): readonly (readonly string[])[] {
  const pools: string[][] = [];
  for (const era of eras) pools.push([...(pools[pools.length - 1] ?? []), ...era]);
  return pools;
}

const DOSSIER_ACTION_POOLS = accumulate(DOSSIER_ACTION_ERAS);
const DOSSIER_CONDITION_POOLS = accumulate(DOSSIER_CONDITION_ERAS);

const actionsAt = (stage: number): readonly string[] =>
  DOSSIER_ACTION_POOLS[Math.max(0, Math.min(stage, DOSSIER_ACTION_POOLS.length - 1))]!;
const conditionsAt = (stage: number): readonly string[] =>
  DOSSIER_CONDITION_POOLS[Math.max(0, Math.min(stage, DOSSIER_CONDITION_POOLS.length - 1))]!;

const dossierBeat = (index: number, fallbackKey: string, salt = 0, stage = 0): string => {
  const actions = actionsAt(stage);
  const conditions = conditionsAt(stage);
  const grid = actions.length * conditions.length;
  const catalogIndex = index >= 0 ? index : stableIndex(fallbackKey, grid);
  const position = (catalogIndex + salt) % grid;
  return `${actions[position % actions.length]} ${conditions[Math.floor(position / actions.length)]}`;
};

/**
 * The opening sentence, chosen by what kind of thing the base noun is.
 *
 * Families come from `openingFamilies.ts`, which lists membership rather than matching it. The
 * previous version tested the name against regular expressions written for the original catalogue,
 * and when the vocabulary was replaced five of the eight families stopped matching anything —
 * measured over all 200 catalogued armour names, `soft` and `mail` matched none, and `advanced`
 * matched exactly one, by accident: `/ABS/i` fires inside "ABSolute Privilege". A legal doctrine was
 * being described as unserviceable technology.
 *
 * Armour needs no list at all, because the slot is already the family. Each of the nine
 * vocabularies is one documented idea, so keying the copy to the slot means it cannot go empty when
 * the nouns change — which is precisely how the previous version rotted.
 */
const WEAPON_OPENINGS: Readonly<Record<WeaponFamily, readonly string[]>> = {
  trifle: [
    'This BASE was not issued as a weapon, and has not been told.',
    'The guild logged this BASE under stationery and moved on.',
    'This BASE settles disputes by being the nearest thing to hand.',
  ],
  ceremony: [
    'This BASE is a meeting the hero has learned to swing.',
    'The guild scheduled this BASE and someone died of it.',
    'This BASE recurs weekly whether or not anyone attends.',
  ],
  instrument: [
    'This BASE removes what it is pointed at, and files the remainder.',
    'The guild issued this BASE after the softer options were exhausted.',
    'This BASE has an edge, which procurement records as a hazard.',
  ],
  writ: [
    'This BASE compels, which is deadlier than anything with an edge.',
    'The guild serves this BASE and lets the paperwork finish the job.',
    'This BASE has never been resisted successfully, only appealed.',
  ],
};

const SHIELD_OPENINGS: Readonly<Record<ShieldFamily, readonly string[]>> = {
  provisional: [
    'This BASE was meant to hold until something better arrived.',
    'The guild carries this BASE on the understanding it is temporary.',
    'This BASE has protected the hero well past its review date.',
  ],
  standing: [
    'This BASE was certified by the people who wrote the standard.',
    'The guild holds this BASE face-out, where the auditors can see it.',
    'This BASE has stopped more requests than projectiles.',
  ],
};

/** Keyed by slot, because each vocabulary is one idea and cannot go empty. */
const ARMOUR_OPENINGS: Readonly<Record<ArmourSlot, readonly string[]>> = {
  // Identity and visibility. Worn to be seen wearing.
  Helm: [
    'This BASE is worn to be seen being worn.',
    'The guild issues this BASE to whoever must be recognised across a room.',
    'This BASE announces the hero before the hero manages it.',
  ],
  // Coverage. The thing that is meant to stop the thing.
  Hauberk: [
    'This BASE is what is meant to stop the thing.',
    'The guild bought this BASE and a schedule of what it excludes.',
    'This BASE covers the hero, subject to terms nobody has read.',
  ],
  // Escalation. What sits on the shoulders and passes things upward.
  Brassairts: [
    'This BASE passes the problem upward and calls that armour.',
    'The guild fitted this BASE so the blow lands on someone senior.',
    'This BASE escalates, which is the only defence it has ever offered.',
  ],
  // Handling. Between the decision and the doing.
  Vambraces: [
    'This BASE sits between the decision and the doing.',
    'The guild wrapped this BASE around the part that actually touches things.',
    'This BASE governs handling, and has outlived several of the handled.',
  ],
  // Access. What the hands are allowed to touch.
  Gauntlets: [
    'This BASE decides what the hands are allowed to touch.',
    'The guild granted this BASE and has been unable to revoke it since.',
    'This BASE opens more than it protects, which nobody has raised.',
  ],
  // Contingency. The padding nobody sees until it is needed.
  Gambeson: [
    'This BASE is the padding nobody sees until it is needed.',
    'The guild holds this BASE against a day it declines to describe.',
    'This BASE absorbs what the outer layers were too dignified to.',
  ],
  // Mobility. Getting from one part of the organisation to another.
  Cuisses: [
    'This BASE moves the hero from one part of the organisation to another.',
    'The guild issued this BASE to shorten a journey nobody wanted to make.',
    'This BASE grants passage, and asks for the receipts afterwards.',
  ],
  // Liability. What takes the impact when the thing does not work.
  Greaves: [
    'This BASE takes the impact when the thing does not work.',
    'The guild attached this BASE to the leg most likely to be blamed.',
    'This BASE limits liability, which is a kind of protection.',
  ],
  // Footprint. Where the organisation is standing, and how heavily.
  Sollerets: [
    'This BASE is where the hero is standing, and how heavily.',
    'The guild acquired this BASE and the ground that came with it.',
    'This BASE presses down on territory the hero has never visited.',
  ],
};

const withBase = (line: string, base: string): string => line.replaceAll('BASE', base);

const equipmentOpening = (base: string, slot: EquipSlot, stage = 0): string => {
  if (slot === 'Weapon') {
    const opening = withBase(choose(WEAPON_OPENINGS[weaponFamily(base)], `${base}:opening`), base);
    const baseIndex = WEAPONS.findIndex(([label]) => label === base);
    return `${opening.slice(0, -1)}; its intake file was ${dossierBeat(baseIndex, base, 0, stage)}.`;
  }

  if (slot === 'Shield') {
    const opening = withBase(choose(SHIELD_OPENINGS[shieldFamily(base)], `${base}:opening`), base);
    const baseIndex = SHIELDS.findIndex(([label]) => label === base);
    return `${opening.slice(0, -1)}; its intake file was ${dossierBeat(baseIndex, base, 41, stage)}.`;
  }

  const opening = withBase(choose(ARMOUR_OPENINGS[slot], `${slot}:${base}:opening`), base);
  // Resolved through the slot's own table, which is the one the analyser reads. Looking the base up
  // in the shared `ARMORS` list returned -1 for 177 of the 180 per-slot names, so the positional
  // dossier scheme it feeds was dead for armour in all but three cells.
  const baseIndex = armourTableForSlot(slot).findIndex(([label]) => label === base);
  return `${opening.slice(0, -1)}; its intake file was ${dossierBeat(baseIndex, base, 82, stage)}.`;
};

const equipmentAssessment = (modifier: string, modifierValue: number, slot: EquipSlot, explicitLabel: string | undefined, stacked: boolean, stage = 0): string => {
  const label = boundedLabel(modifier, 'unnamed modifier');
  const table = slot === 'Weapon' ? [...OFFENSE_ATTRIB, ...OFFENSE_BAD] : [...DEFENSE_ATTRIB, ...DEFENSE_BAD];
  const modifierIndex = table.findIndex(([candidate]) => candidate === modifier);
  const mark = explicitLabel ? `; its ${explicitLabel} assessor’s mark survived` : '';
  const assessments = modifierValue >= 0
    ? [
      `${label} certification outlived its witnesses`,
      `The guild approved ${label} by correspondence`,
      `${label} remains valid where supervision is scarce`,
      `${label} improved morale in other departments`,
      `Procurement defines ${label} as plausibly better`,
      `It is officially ${label} and unofficially evidence`,
    ]
    : [
      `${label} is a repair estimate pretending to be an adjective`,
      `Maintenance accepted ${label} and stopped returning calls`,
      `${label} is less a feature than a signed confession`,
      `The guild kept ${label} because condemned needed two signatures`,
      `Procurement lists ${label} under cosmetic litigation`,
      `${label} survived vigorous polishing of the report`,
    ];
  // Modifier count is the engine's own rarity signal and was read only as a number to add up.
  // Across four simulated hours it falls out at roughly three quarters plain, a quarter single,
  // and a twentieth double, so a second modifier is rare enough to be worth noticing and common
  // enough to be seen. The register escalates and the claim does not: a stacked item is filed
  // with more ceremony and is exactly as useless in a fight, which the effect line still says.
  //
  // Carried inside the existing sentence rather than added after it, because equipment stories
  // are held to two sentences and a length bound, both of which are tested.
  const custody = stacked ? 'its warranties were countersigned and' : 'its warranty was';
  return `${choose(assessments, `${modifier}:assessment`)}; ${custody} ${dossierBeat(modifierIndex, modifier, 123, stage)}${mark}.`;
};

const boundEquipmentStory = (
  story: string,
  base: string,
  modifier: string,
  slot: EquipSlot,
  explicitLabel?: string,
  stage = 0,
): string => {
  if (Array.from(story).length <= 220) return story;
  const baseTable = slot === 'Weapon' ? WEAPONS : slot === 'Shield' ? SHIELDS : ARMORS;
  const modifierTable = slot === 'Weapon' ? [...OFFENSE_ATTRIB, ...OFFENSE_BAD] : [...DEFENSE_ATTRIB, ...DEFENSE_BAD];
  const baseIndex = baseTable.findIndex(([candidate]) => candidate === base);
  const modifierIndex = modifierTable.findIndex(([candidate]) => candidate === modifier);
  const mark = explicitLabel ? `; ${explicitLabel} mark retained` : '';
  return `This ${boundedLabel(base, 'equipment', 42)} ${slot.toLowerCase()} was ${dossierBeat(baseIndex, base, 0, stage)}. Its ${boundedLabel(modifier, 'unmodified', 20)} file was ${dossierBeat(modifierIndex, modifier, 123, stage)}${mark}.`;
};

export function describeEquipment(name: string, slot: EquipSlot, act = 0): ItemDetails {
  const stage = substrateStage(act);
  const mechanics = analyzeItemMechanics({ kind: 'equipment', name, slot });
  if (!mechanics.quality) {
    return { description: 'An empty slot. The void remains undefeated.', effect: 'No combat effect.' };
  }

  const { base: basePart, mark, modifiers, total } = mechanics.quality;
  const base = basePart?.name ?? boundedLabel(name, 'unnamed equipment');
  const modifier = modifiers.map(({ name: modifierName }) => modifierName).join(' and ');
  const modifierTotal = modifiers.reduce((sum, part) => sum + part.value, 0);
  const explicitLabel = mark ? signedGameNumber(mark.value) : undefined;
  const opening = equipmentOpening(base, slot, stage);
  const story = modifier
    ? `${opening} ${equipmentAssessment(modifier, modifierTotal, slot, explicitLabel, modifiers.length >= 2, stage)}`
    : `${opening} It carries ${explicitLabel ? `a ${explicitLabel} assessor’s mark and no` : 'no'} named modifier, which procurement calls restraint.`;
  const description = boundEquipmentStory(story, base, modifier, slot, explicitLabel, stage);
  const qualityParts = [
    basePart ? `${basePart.name} ${formatGameNumber(basePart.value)}` : 'uncatalogued base 0',
    ...modifiers.map((part) => `${part.name} ${signedGameNumber(part.value)}`),
    ...(mark ? [`mark ${signedGameNumber(mark.value)}`] : []),
  ];

  // What the item actually does, which the line here used to deny.
  //
  // It said "classic encounter time ignores equipment", which was true of the original and stopped
  // being true the day ADR 0008 shipped: `sim.ts` multiplies every kill's duration by
  // `encounterSpeedMultiplier(loadoutQuality(character))`. The tooltip went on saying otherwise on
  // the same screen as a world-console filing reporting the reduction, which is the worst possible
  // place for the game to contradict itself.
  //
  // Narrated rather than tabulated. An effects column — "+2 chatter, −1 travel" — is the failure
  // this surface is built to avoid, and the `effect` line is pinned to mechanical truth for exactly
  // that reason.
  //
  // It says what the item does to the total, and never what the total then does for the hero. That
  // distinction is the whole correction. The previous wording — "contributes 1 to the loadout, which
  // shortens encounters" — asserted an outcome this function cannot see: `loadoutQuality` floors the
  // sum at zero, so a positive item inside a net-negative loadout shortens nothing at all. A new
  // character wears a `-3 Burlap`, which means the claim was false for the whole early game, on the
  // same screen as a world console correctly reporting a reduction of zero.
  //
  // The negative arm is a second correction. "Contributes nothing" was said of anything not positive,
  // and a `-30 Cover Note` does not contribute nothing — it takes the rest of the loadout down with
  // it.
  const contribution = total > 0
    ? `Contributes ${formatGameNumber(total)} to the loadout total, which is what shortens encounters`
    : total < 0
      ? `Takes ${formatGameNumber(Math.abs(total))} off the loadout total, which is what shortens encounters`
      : 'Contributes nothing to the loadout total, which is what shortens encounters';

  // The padding slot does a second thing, and it is the only slot that does.
  //
  // Stated only where it is true. A sentence about carrying capacity on a helm would be the effects
  // column this surface refuses to become, and worse, it would be false. The figure is read from the
  // same function the engine adds to capacity, never recomputed, for the reason the whole file is
  // pinned to mechanical truth: a tooltip that flattered the item would be the failure rather than
  // the fix.
  const allowance = slot === 'Gambeson' ? storageAllowance({ Gambeson: name } as CharacterSheet['Equip']) : 0;
  const carrying = allowance > 0
    ? ` Padding the hero out by ${formatGameNumber(allowance)} cubits of carrying capacity.`
    : '';

  // The footprint slot does a third thing, and like the padding slot it is the only one that does.
  // Same discipline: read from the function the engine multiplies by, and say it only where true.
  const favour = slot === 'Sollerets' ? marketFavour({ Sollerets: name } as CharacterSheet['Equip']) : 1;
  const terms = favour > 1
    ? ` Standing here is worth ${formatGameNumber(Math.round((favour - 1) * 100))}% better terms at market.`
    : '';

  // The one effect that has to admit it does nothing.
  //
  // `HP Max` and `MP Max` are grown every level and printed on the banner, and read by nothing at
  // all. Saying so is the joke and it is also the rule this file has been pinned to since the
  // encounter line was corrected: state what the arithmetic does, never what it might be worth.
  const vitals = slot === 'Hauberk' || slot === 'Helm'
    ? vitalsFlourish({ [slot]: name } as CharacterSheet['Equip'])
    : { hp: 0, mp: 0 };
  const decoration = vitals.hp > 0
    ? ` Adds ${formatGameNumber(vitals.hp)} to maximum hit points at each level, which nothing reads.`
    : vitals.mp > 0
      ? ` Adds ${formatGameNumber(vitals.mp)} to maximum magic points at each level, which nothing reads.`
      : '';

  return {
    description,
    effect: `Generation quality: ${formatGameNumber(total)} (${qualityParts.join(' + ')}). ${contribution}; damage is ${mechanics.combatContribution === 'none' ? 'not modeled' : mechanics.combatContribution}.${carrying}${terms}${decoration}`,
  };
}

const SPELL_FLAVOR: Record<string, string> = {
  'Wet Signature': 'The only rite in the book that needs ink, a witness, and somebody willing to be named.',
  'Quick Win': 'A close-quarters memorandum delivered without the customary envelope.',
  Expedite: 'The minutes were approved before the meeting, preserving valuable time and all known errors.',
  'Best Practice': 'Records the caster’s latest decision as sound policy before evidence can arrive.',
  'Low Morale': 'A mandatory reflection on every choice that led to the present corridor.',
  'Change Fatigue': 'Induces the precise weariness of a third reorganisation announced as the first.',
  'Red Tape': 'Binds the target in procedure they may appeal, in writing, through the appropriate channel.',
  Onboard: 'Confers immunity to a hazard the target will never meet, plus a laminated card saying so.',
  'Cone of Reminders': 'A directed volume of follow-ups, none urgent, all copied to somebody senior.',
  'Magnetic Roadmap': 'Attracts every adjacent initiative until the quarter cannot be lifted.',
  'Shadow Staffing': 'Staffs the work with people nobody can name and no ledger records.',
  'Cloud Revolt': 'The infrastructure develops an opinion and expresses it during business hours.',
  'Fiscal Humour': 'Funny only to the finance team, and only in the following year.',
  'Spectral Overhead': 'Costs continue to be incurred by a department that was dissolved.',
  'Clever Workaround': 'Solves the problem in a way nobody is permitted to write down.',
  'Gag Order': 'The target keeps the ability to speak and loses every occasion on which it would help.',
  Retrospective: 'Reviews a disaster at length and concludes that the process was followed.',
  'Risk Aversion': 'Grants total protection from every outcome, including the good ones.',
  'Big Skip-Level': 'Summons attention from two rungs up. It arrives, and it stays.',
  'Cone of Boilerplate': 'A directed volume of language that survived every review by meaning nothing.',
  'Do-Over Clause': 'Permits one repetition of the attempt, subject to the terms governing repetitions.',
  "Pemberton's Bright Idea": 'Named for a caster who proposed it once and has been credited ever since.',
  'Sanctioned Shortcut': 'The forbidden route, now with a sign on it and a form beneath the sign.',
  'Finding (Non-Material)': 'A defect of no consequence, recorded at length in case it acquires one.',
  Braindump: 'Transfers everything the caster knows, in the order they happened to think of it.',
  'Summon a Stakeholder': 'Calls forth an interested party. The interest is not in the work.',
  Nonconcur: 'Registers disagreement in a form that stops nothing and can be cited forever.',
  'Animate Org Chart': 'The reporting lines move under their own power, which explains a great deal.',
  'Eye of the Auditor': 'Sees every transaction and dwells on the one that cannot be explained.',
  'Name and Shame': 'Attaches an outcome to a person permanently, regardless of who chose it.',
  'Scope Creep': 'Enlarges the work by inches, each one agreed to by somebody reasonable.',
  'Gallows Humour': 'The only morale intervention with a proven record, and it is not approved.',
  "Ashgrove's Grand Illusion": 'A demonstration environment that has never failed, because it has never run.',
  Requisition: 'Obtains the object eventually, some time after it stopped being needed.',
  'Black Budget': 'Funds the work from a line item nobody may read aloud.',
  'Quarterly Miasma': 'A fog that descends thirteen weeks at a time and lifts for reporting.',
  'Spectral Deliverable': 'Shipped, signed off, and never found by anyone who went looking.',
  'Idle Hands': 'The caster’s hands are free, which the ledger records as capacity.',
  'Bypass Procedure': 'Routes around the obstruction. The obstruction is the procedure.',
  "Wrenfield's Big Day Off": 'The one absence for which no cover was arranged and nothing went wrong.',
  'Finding (Material)': 'A defect of consequence. The length of the write-up is unchanged.',
  'Animate Lanyard': 'The credential asserts an access level its wearer has never held.',
  'Bearish Armour': 'Protection assembled entirely from pessimism, the only forecast that fits.',
  'Holy Rollout': 'The deployment is blessed, staged, and irreversible, in that order.',
  'Cost Excision': 'Removes the expense and the function it paid for in a single motion.',
  'Cascade Blame': 'Distributes responsibility downward until it reaches somebody who cannot delegate.',
  'Infinite Deferral': 'The decision is scheduled. The schedule is deferred.',
};

const SPELL_CLOSERS = [
  'The licensing board has declined to comment.',
  'Results may vary, especially near furniture.',
  'Approved by three wizards and one extremely nervous accountant.',
  'Side effects include confidence, paperwork, and avoidable eye contact.',
];

/**
 * No act, and no provenance beat. A spell was never an object that arrived somewhere and got an
 * intake file, so it has no custody history to acquire an industrial edge. Giving it one would be
 * the joke asserting something the rest of the model does not agree with.
 */
/**
 * When a spell first becomes reachable, which the curriculum has never told anyone.
 *
 * `generateSpellReward` draws from the first `wisdom + level` entries of an ordered list, so a
 * spell's position in that list is the threshold at which it can be awarded at all. A player could
 * watch for hours without learning that the list is ordered, that it is gated, or that wisdom is
 * what moves the gate — the same shape of hidden mechanic as the sale premium on a named item.
 *
 * Absent for a spell that is not in the curriculum, which an imported save can carry.
 */
function curriculumThreshold(name: string): number | null {
  const index = SPELLS.indexOf(name);
  return index < 0 ? null : index + 1;
}

export function describeSpell(name: string, level: number): ItemDetails {
  const premise = SPELL_FLAVOR[name]
    ?? `The incantation “${boundedLabel(name, 'unnamed spell')}” arrived without syllabus, sponsor, or declared learning outcome.`;
  const mechanics = analyzeItemMechanics({ kind: 'spell', level });
  const threshold = curriculumThreshold(name);

  // Rank is a count of awards, not of power. `applySpellReward` increments it when the same spell
  // comes up again, so a rank of three means the curriculum has handed the same rite over three
  // times — which is funnier and more useful than the bare number the line used to print.
  //
  // "Encounters are unaffected" is stated rather than inherited. It is true of spells, unlike
  // equipment, where the identical claim was false for as long as ADR 0008 has been shipping; a
  // reader comparing the two tooltips should be able to trust the difference.
  return {
    description: `${premise} ${choose(SPELL_CLOSERS, `${name}:closer`)}`,
    effect: [
      `Spell rank: ${formatGameNumber(mechanics.rank)}, meaning it has been awarded ${mechanics.rank === 1 ? 'once' : `${formatGameNumber(mechanics.rank)} times`}.`,
      threshold === null ? '' : `Enters the curriculum at wisdom plus level ${formatGameNumber(threshold)}.`,
      `Combat contribution: ${mechanics.combatContribution}; encounters are unaffected.`,
    ].filter(Boolean).join(' '),
  };
}

function specialItemParts(name: string): { attribute: string; object: string; concept?: string } | undefined {
  const attribute = ITEM_ATTRIB.find((candidate) => name.startsWith(`${candidate} `));
  if (!attribute) return undefined;
  const remainder = name.slice(attribute.length + 1);
  const object = SPECIALS.find((candidate) => remainder === candidate || remainder.startsWith(`${candidate} of `));
  if (!object) return undefined;
  const concept = ITEM_OFS.find((candidate) => remainder === `${object} of ${candidate}`);
  return { attribute, object, ...(concept ? { concept } : {}) };
}

function monsterLootParts(name: string): { monster: string; drop: string } | undefined {
  const canonical = MONSTERS.find(({ name: monster, item }) =>
    item !== '*' && `${monster} ${item}`.toLowerCase() === name.toLowerCase());
  if (canonical) return { monster: canonical.name, drop: canonical.item };

  const generatedMonster = name.endsWith(' item') ? name.slice(0, -' item'.length) : undefined;
  const generated = MONSTERS.find(({ name: monster }) => monster === generatedMonster);
  return generated ? { monster: generated.name, drop: 'item' } : undefined;
}

const specialConceptStory = (concept: string, stage = 0): string => {
  const conceptIndex = ITEM_OFS.indexOf(concept);
  const family = /Happiness|Pleasure|Joy|Comfort|Patience|Loyalty|Awe|Dignard/i.test(concept)
    ? `The promised ${concept}`
    : /Craft|Practicality|Punctuality|Efficiency|Sisu|Perspicacity|Guile/i.test(concept)
      ? `Its claim to ${concept}`
      : /Internment|Incarceration|Solitude|Silence|Invisibility/i.test(concept)
        ? `The ${concept} order`
        : /Danger|Hurting|Suffering|Acrimony|Worry|Fear|Despair|Cruelty|Petulance|Frenzy/i.test(concept)
          ? `The included ${concept}`
          : `Its connection to ${concept}`;
  return `${family} was ${dossierBeat(conceptIndex, concept, 74, stage)}.`;
};

const specialObjectClause = (object: string, stage = 0): string => {
  const objectIndex = SPECIALS.indexOf(object);
  const subject = /Diadem|Tiara|Laurel|Hood/i.test(object)
    ? `${object} fitting`
    : /Gemstone|Garnet|Amethyst|Bijou|Brooch/i.test(object)
      ? `${object} appraisal`
      : /Phial|Lamp|Brazier|Candelabra|Orb|Sphere/i.test(object)
        ? `${object} contents`
        : /Hymnal|Tome/i.test(object)
          ? `${object} index`
          : /Fleece|Corset|Brocade|Galoon|Festoon|Bandolier/i.test(object)
            ? `${object} tailoring`
            : /Scabbard|Arrow|Gimlet/i.test(object)
              ? `${object} custody`
              : /Sceptre|Ankh|Talisman/i.test(object)
                ? `${object} authority`
                : `${object} purpose`;
  return `the ${subject} was ${dossierBeat(objectIndex, object, 37, stage)}`;
};

const specialAttributeStory = (attribute: string, object: string, stage = 0): string => {
  const attributeIndex = ITEM_ATTRIB.indexOf(attribute);
  const subject = /Golden|Gilded|Crystalline|Iron|Ormolu/i.test(attribute)
    ? `${attribute} finish`
    : /Garlanded|Filigreed|Gleaming|Grandiose|Ostentatious|Magnificent/i.test(attribute)
      ? `${attribute} decoration`
      : /Spectral|Astral|Arcane|Enchanted|Unearthly|Puissant/i.test(attribute)
        ? `${attribute} aura`
        : /Blessed|Reverential|Sacred|One True|Benevolent/i.test(attribute)
          ? `${attribute} status`
          : /Cruciate|Fearsome|Deadly/i.test(attribute)
            ? `${attribute} warning`
            : `${attribute} provenance`;
  return `The ${subject} was ${dossierBeat(attributeIndex, attribute, 0, stage)}; ${specialObjectClause(object, stage)}.`;
};

/**
 * Three drop shapes, matched against the vocabulary the monster table actually carries.
 *
 * These lists are the one place in this file that names item vocabulary rather than resolving it
 * by index, so they are the one place a table rewrite can silently defeat. A table rewrite replaced the
 * adversaries and their drops; every word below was re-derived from the new table rather than
 * translated from the old one, and traitTables.test.ts now asserts that each list still matches
 * something so a future rewrite fails loudly instead of falling through to the generic ending.
 */
const monsterLootStory = ({ monster, drop }: { monster: string; drop: string }, stage = 0): string => {
  const finding = drop === 'item'
    ? `Whatever ${monster} dropped was logged as “item” after anatomy declined jurisdiction.`
    : /^(?:apparel|boot|collar|jerkin|lanyard|medal|nameplate|pajamas|robe|sandal|shirt|sticker|tartan|crown|fob)$/i.test(drop)
      ? `The ${drop} from ${monster} went from evidence to wardrobe without laundering the custody chain.`
      : /^(?:antler|beak|beard|belly|blood|clavicle|claw|corpse|dendrite|ear|eye|feather|finger|forehead|frenum|fur|gills?|heart|hide|hoof|jaw|lung|nucleus|organ|pancreas|paw|proboscis|protrusion|snout|spike|stinger|tail|talon|teeth|tentacle|thigh|tooth|tusk|wart|web|webbing|wing)$/i.test(drop)
        ? `The ${drop} recovered from ${monster} was filed as anatomy after the jar objected.`
        : /^(?:blob|chaff|cinder|dung|dust|gauze|grain|gravel|gravy|jam|mulch|sample|shard|shavings|spore|trace|wisp|glass|shag)$/i.test(drop)
          ? `The ${drop} left by ${monster} is stored as a liquid, a solid, and a labor grievance.`
          : /^(?:agenda|artifact|backlog|blocker|burndown|calendar|card|certificate|checklist|comment|contract|core dump|coupon|covenant|drilldown|egress bill|epic|estimate|exception|extract|filing|finding|footnote|frameset|funnel|gantt|gavel|iframe|invoice|job log|label|layer|lemma|letter|map|markup|merge key|minute|module|no-show|node|notice|opt-out|order|org chart|page|pager|patch|patchset|permit|plan|playbook|preflight|proxy|redline|reminder|req|resume|rider|rubric|ruling|runbook|schedule|scorecard|security|siren|sitemap|slide|stack trace|stamp|stub|submodule|tally|tape|term sheet|terminal|tickbox|ticket|timesheet|token|transcript|triage note|variance|waiver|wallet|workaround|penalty|flake|retry|reel|bit|booty)$/i.test(drop)
            ? `The ${drop} obtained from ${monster} was filed, indexed, and never read again.`
            : `The guild logged ${monster}’s ${drop} as field salvage and immediately lost the field.`;
  const monsterIndex = MONSTERS.findIndex(({ name }) => name === monster);
  const consequence = choose([
    'The donor remains unavailable for a satisfaction survey.',
    'Its chain of custody is mostly decorative.',
    'The market has standards, but none relevant here.',
    'A second sample was requested by nobody sober enough to sign.',
    'The evidence bag has begun negotiating overtime.',
  ], `${monster}:${drop}:aftermath`);
  return `${finding.slice(0, -1)}; evidence was ${dossierBeat(monsterIndex, monster, 0, stage)}. ${consequence}`;
};

const mundaneLootStory = (name: string, stage = 0): string => {
  const history = /I\.O\.U\.|writ|newspaper|letter/i.test(name)
    ? `The ${name} began as paperwork and became treasure when everybody stopped reading it.`
    : /cookie|pint|egg|chicken|carrot/i.test(name)
      ? `The ${name} was promoted from provisions to treasure shortly after its safe date.`
      : /sock|hat|vest|bandage|towel|counterpane/i.test(name)
        ? `The ${name} left textile service and entered treasure before laundering could establish facts.`
        : /nail|toothpick|needle|plank|twig|rock|pole|hoe|trowel|anvil|axle/i.test(name)
          ? `The ${name} completed a modest career in hardware before promotion to treasure.`
          : /lunchpail|bucket|canoe|inkwell|planter box|casket|credenza/i.test(name)
            ? `The ${name} once held something useful; as treasure it contains only appraised potential.`
            : `The ${name} was reassigned as treasure after its original department denied ownership.`;
  return `${history} Its promotion was ${dossierBeat(BORING_ITEMS.indexOf(name), name, 100, stage)}.`;
};

/**
 * What the market will give for a stack, which the player had no way to find out.
 *
 * `transition.ts` prices a sale at quantity times character level, and the figure only ever goes up
 * from there — a named item is multiplied by two rolled factors, and the whole sale is multiplied by
 * the footprint slot and the hero's charisma. So the base is a floor, and it is reported as one.
 *
 * Three things this line used to get wrong, all in the direction of promising more than the
 * arithmetic keeps:
 *
 * The premium was stated as certain. Both rolled factors are `1 + min(r, r)` and both minima can be
 * zero, so a named item can fetch exactly what a plain one would. That is not a rarity at the level
 * a player starts at — the smaller the level, the likelier the second factor rolls its floor, and it
 * is roughly one named sale in five at level one. "Usually" is the honest word.
 *
 * The base was capped at `MAX_PERSISTED_GOLD`. The engine has no such rule: `transition.ts` computes
 * `qty * level` uncapped and `gold.ts` sheds decades rather than saturating, reporting the full
 * figure earned. The clamp described a cap that exists nowhere, and understated by orders of
 * magnitude for the imported save that could reach it.
 *
 * And the plain case said "sells for", flat, which stopped being true the day the market margins
 * landed — a hero standing on an `Antipode` is paid more than the level alone suggests.
 *
 * Still a floor rather than a figure, because the multipliers are rolled at the moment of sale and
 * naming an exact number would be inventing state, which is the one thing this line may never do.
 *
 * Silent at level zero, which is only reachable from a caller that has no character to price
 * against. A confident "0 gold" would be worse than saying nothing.
 */
function saleValue(name: string, quantity: number, level: number): string {
  if (!Number.isFinite(level) || level <= 0) return '';
  const base = quantity * level;
  return name.includes(' of ')
    ? `Sells for at least ${formatGameNumber(base)} gold; a named thing usually fetches more.`
    : `Sells for at least ${formatGameNumber(base)} gold at your level.`;
}

export function describeInventoryItem(name: string, quantity: number, act = 0, level = 0): ItemDetails {
  const stage = substrateStage(act);
  const mechanics = analyzeItemMechanics({ kind: 'inventory', name, quantity });
  const special = specialItemParts(name);
  const monsterLoot = monsterLootParts(name);
  const label = boundedLabel(name, 'unnamed object');
  const closer = [
    'It is not edible, unless the situation has become unusually philosophical.',
    'It will become someone else’s problem at the next market visit.',
    'It occupies space with the quiet confidence of a tax audit.',
  ];
  const description = name === 'Gold'
    ? 'Gold is weightless in the pack and ruinously heavy in the quarterly ledger. Every coin has been counted twice and trusted once.'
    : special
    ? `${specialAttributeStory(special.attribute, special.object, stage)} ${special.concept
      ? specialConceptStory(special.concept, stage)
      : choose([
        'It has failed every practical-use hearing with distinction.',
        'Its former ceremonial purpose remains sealed pending a less embarrassing century.',
        'The market accepts it under a policy nobody admits to writing.',
      ], `${name}:warning`)}`
    : monsterLoot
      ? monsterLootStory(monsterLoot, stage)
    : BORING_ITEMS.includes(name)
      ? mundaneLootStory(name, stage)
    : `The label “${label}” is all that survived the encounter and subsequent filing error. ${choose(closer, `${name}:closer`)}`;

  return {
    description,
    effect: name === 'Gold'
      ? `Quantity: ${formatGameNumber(mechanics.quantity)}. Encumbrance: +${formatGameNumber(mechanics.encumbranceCubits)} cubits. Funds equipment purchases; combat contribution: ${mechanics.combatContribution}.`
      : [
        `Quantity: ${formatGameNumber(mechanics.quantity)}.`,
        `Encumbrance: +${formatGameNumber(mechanics.encumbranceCubits)} cubits.`,
        // Empty when no level was supplied, so the sentences join without leaving a gap where a
        // price would have been.
        saleValue(name, mechanics.quantity, level),
        `Combat contribution: ${mechanics.combatContribution}.`,
      ].filter(Boolean).join(' '),
  };
}
