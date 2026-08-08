import { ARMORS } from './traits';
import type { ArmourSlot, EquipSlot } from '../engine/types';

/**
 * What a piece of armour is called, given where it is worn.
 *
 * Nine slots drew from one twenty-entry table, so nothing about a `Lanyard` said head and nothing
 * stopped it turning up on a thigh and both feet at once. Measured across sixty characters after an
 * hour of play each: every one of them wore some base noun in more than one slot, worst case five.
 *
 * This is a renaming, not a re-rolling. `ARMORS` keeps its length, its order and its quality at
 * every index, and remains exactly what `rng.pick` draws from — so the draw, the quality, the plus
 * arithmetic and every figure downstream are untouched. Only the label differs, chosen by slot.
 *
 * That constraint is not fussiness. `rng.pick` consumes one draw and returns an index; picking from
 * a different table would change the value drawn and therefore the whole session, and three
 * recorded sessions pin generated armour names. They cannot be re-recorded — they were captured
 * from the original web port. The pinned cells are `Helm` at 0, `Gauntlets` at 4 and `Hauberk` at 2,
 * and they keep the names they have.
 *
 * Each slot gets a vocabulary belonging to the part of a bureaucracy that sits where the armour
 * sits: identity and visibility at the head, coverage at the chest, escalation at the shoulders,
 * handling at the forearms, access at the hands, contingency in the padding, mobility at the
 * thighs, liability at the shins, and footprint at the feet. The joke is the same joke; it is
 * simply told nine ways instead of once.
 *
 * Modifiers are untouched and stay shared. A `Compliance` anything reads correctly wherever it is
 * worn, and giving each slot its own adjectives would multiply the vocabulary without adding a
 * distinction anybody could notice.
 */

/**
 * One name per `ARMORS` index, per slot, in ascending quality order.
 *
 * Positional: entry `n` here answers for entry `n` there, and shares its rating. A name added or
 * removed rather than substituted would silently shift every tier above it, which
 * `armourBySlot.test.ts` refuses.
 */
const BY_SLOT: Readonly<Record<Exclude<EquipSlot, 'Weapon' | 'Shield'>, readonly string[]>> = {
  // Identity and visibility. Worn to be seen wearing.
  Helm: [
    'Lanyard', 'Visitor Badge', 'Hard Hat', 'Name Plate', 'Photo Pass', 'Clearance Tag',
    'Headset', 'Escalation Crown', 'Signal Boost', 'Perimeter Visor', 'Executive Fascinator',
    'Situational Awareness', 'Line of Sight', 'Corner Office', 'Chair', 'Casting Vote',
    'Final Say', 'Public Record', 'Household Name', 'Legacy',
  ],
  // Coverage. The thing that is meant to stop the thing.
  Hauberk: [
    'Cover Note', 'Standard Terms', 'Boilerplate', 'Master Agreement', 'Blanket Policy',
    'Umbrella Clause', 'Rider', 'Full Coverage', 'Reinsurance', 'Captive Insurer',
    'Actuarial Table', 'Catastrophe Bond', 'Lloyd’s Slip', 'State Aid', 'Backstop',
    'Bailout', 'Too Big To Fail', 'Systemic Importance', 'Central Clearing', 'Lender of Last Resort',
  ],
  // Escalation. What sits on the shoulders and passes things upward.
  Brassairts: [
    'Cc Line', 'Reply All', 'Read Receipt', 'Escalation Path', 'Skip Level',
    'Steering Group', 'Executive Sponsor', 'Chain of Command', 'Standing Item', 'Board Paper',
    'Non-Executive Director', 'Shareholder Letter', 'Proxy Fight', 'Golden Share', 'Veto',
    'Emergency Powers', 'Standing Order', 'Constitutional Convention', 'Act of Parliament', 'Royal Assent',
  ],
  // Handling. Between the decision and the doing.
  Vambraces: [
    'Sticky Label', 'Handling Note', 'Chain of Evidence', 'Two-Person Rule', 'Gloved Procedure',
    'Cold Storage', 'Evidence Pouch', 'Tamper Band', 'Custody Log', 'Air-Gapped Courier',
    'Diplomatic Bag', 'Standing Instruction', 'Sanitised Copy', 'Redaction Standard', 'Need To Know',
    'Compartment', 'Special Access', 'Codeword', 'Eyes Only', 'Burn Bag',
  ],
  // Access. What the hands are allowed to touch.
  Gauntlets: [
    'Guest Wi-Fi', 'Read Access', 'Shared Drive', 'Write Access', 'Framework',
    'Service Account', 'Elevated Rights', 'Break Glass', 'Master Key', 'Skeleton Key',
    'Root', 'Signing Authority', 'Purse Strings', 'Blank Cheque', 'Countersignature',
    'Power of Attorney', 'Fiduciary Duty', 'Trusteeship', 'Guardianship', 'Regency',
  ],
  // Contingency. The padding nobody sees until it is needed.
  Gambeson: [
    'Spare Pen', 'Contingency Line', 'Float', 'Petty Cash', 'Provision',
    'Rainy Day Fund', 'Headroom', 'Buffer Stock', 'Redundancy', 'Warm Spare',
    'Hot Standby', 'Second Site', 'Continuity Plan', 'Disaster Recovery', 'Mutual Aid',
    'Emergency Fund', 'War Chest', 'Sovereign Wealth', 'Strategic Reserve', 'Doomsday Vault',
  ],
  // Mobility. Getting from one part of the organisation to another.
  Cuisses: [
    'Corridor Pass', 'Floor Plan', 'Hot Desk', 'Travel Warrant', 'Secondment',
    'Lateral Move', 'Fast Track', 'Rotation', 'Mobility Clause', 'Garden Leave',
    'Sabbatical', 'Free Movement', 'Right of Way', 'Diplomatic Passport', 'Open Border',
    'Extraterritoriality', 'Flag of Convenience', 'Free Port', 'Special Economic Zone', 'Sovereign Territory',
  ],
  // Liability. What takes the impact when the thing does not work.
  Greaves: [
    'Verbal Warning', 'Note On File', 'Disclaimer', 'Waiver', 'Indemnity Clause',
    'Hold Harmless', 'Limitation of Liability', 'Cap On Damages', 'Exclusion', 'Force Majeure',
    'Act of God', 'Statute of Limitations', 'Sovereign Immunity', 'Diplomatic Immunity', 'Qualified Privilege',
    'Absolute Privilege', 'Crown Immunity', 'Amnesty', 'Pardon', 'Attainder Reversed',
  ],
  // Footprint. Where the organisation is standing, and how heavily.
  Sollerets: [
    'Desk Space', 'Site Licence', 'Leasehold', 'Freehold', 'Ground Lease',
    'Planning Permission', 'Compulsory Purchase', 'Land Bank', 'Estate', 'Campus',
    'Enterprise Zone', 'Company Town', 'Charter City', 'Concession', 'Protectorate',
    'Dominion', 'Commonwealth', 'Continental Shelf', 'Territorial Waters', 'Antipode',
  ],
};

/**
 * The slot-appropriate name for an armour base.
 *
 * Takes `ArmourSlot`, not `EquipSlot`. It used to accept `Weapon` and `Shield` and hand back the
 * shared armour name for them — `armourNameForSlot('Weapon', 3)` answered `Charter` where `WEAPONS`
 * holds `Stub`. Harmless only because both callers branch on those two slots before arriving, and
 * pinned as correct by a test asserting the wrong answer. The type refuses now.
 *
 * An index outside the table falls back rather than throwing: this runs inside the transition, and a
 * name that cannot be found is a worse reason to stop a session than a name that is merely generic.
 */
export function armourNameForSlot(slot: ArmourSlot, index: number): string {
  const shared = ARMORS[index]?.[0];
  if (shared === undefined) return '';
  return BY_SLOT[slot][index] ?? shared;
}

export { BY_SLOT as ARMOUR_BY_SLOT };

/**
 * The base table a slot's names are actually drawn from, paired with the shared quality ratings.
 *
 * `analyzeItemMechanics` finds an item's base by looking its name up in a table, and it drives both
 * the tooltips and `loadoutQuality` — so a slot renamed without this would report no base, no
 * quality, and a loadout worth nothing. Built from the shared ratings by position, which is the same
 * guarantee the naming itself rests on: entry `n` here is entry `n` there, at the same value.
 *
 * Returns `[name, rating]` pairs, matching `ARMORS`. Worth saying out loud: reaching for `.indexOf`
 * on the result to find a name silently returns -1 every time, which is how a whole feature once
 * shipped green while doing nothing at all.
 */
export function armourTableForSlot(slot: ArmourSlot): readonly [string, number][] {
  return BY_SLOT[slot].map((name, index) => [name, ARMORS[index]![1]] as [string, number]);
}
