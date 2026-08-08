import { SHIELDS, WEAPONS } from './traits';
import type { EquipSlot } from '../engine/types';

/**
 * Which family of opening line a base noun belongs to.
 *
 * Membership is listed, not matched. The previous version tested the name against regular
 * expressions — `/shiv|knife|sword|hatchet/i` for blades, `/ABS|Kevlar|Titanium|Plasma/i` for
 * advanced armour — and those patterns were written against the original catalogue. When the
 * vocabulary was replaced wholesale, five of the eight families stopped matching anything at all,
 * and the one that still fired did so by accident: `/ABS/i` matches inside "**ABS**olute Privilege",
 * so a legal doctrine was being described as unserviceable technology that entered service before
 * discouraging tests.
 *
 * That is the fourth substring collision this repo has been caught by. A list cannot collide, cannot
 * quietly match a word it was never meant to see, and cannot go silently empty — the tests beside
 * this file assert that every catalogued name appears exactly once and that every family is
 * populated, so replacing a table fails loudly instead of hollowing the copy out.
 */

export type WeaponFamily = 'trifle' | 'ceremony' | 'instrument' | 'writ';
export type ShieldFamily = 'provisional' | 'standing';

/** Weapons, by what the hero is actually doing when they swing it. */
export const WEAPON_FAMILIES: Readonly<Record<WeaponFamily, readonly string[]>> = {
  /** Too small to be a weapon, which has never stopped anyone. */
  trifle: ['Sticky Note', 'Broken Build', 'Shim', 'Stub', 'Nudge Email', 'Action Item', 'Handoff', 'Baseline', 'Blocker'],
  /** A meeting, a ritual, or a cadence, deployed as force. */
  ceremony: [
    'Andon Cord', 'Hackathon Prize', 'Battle Rhythm', 'Short Sprint', 'Kanban Pike', 'War Room Gavel',
    'Morning Standup', 'Long Pole', 'Long-Range Plan', 'Lateral Move', 'Performance Arm', 'Bastard Merge',
  ],
  /** Something with an edge on it, literal or otherwise. */
  instrument: [
    'Box Cutter', 'Hatchet Job', 'Reorg Axe', 'Policy Adze', 'Blunder Bus', 'Severance Cannon',
    'Spontaneous Reorg', 'Restructure', 'Wind-Down Order',
  ],
  /** Paper that compels, which is the most dangerous of the four. */
  writ: [
    'Claw-Back', 'Escape Clause', 'Mandate', 'Leaf Ruling', 'Poach Order', 'Ratchet Clause',
    'Broad Writ', 'Halt Order', 'Board Directive',
  ],
};

/** Shields, by whether anyone expects them to still be there next quarter. */
export const SHIELD_FAMILIES: Readonly<Record<ShieldFamily, readonly string[]>> = {
  provisional: ['Placeholder', 'Pilot Waiver', 'Deprecation Notice', 'Backlog Buffer', 'Provisional Waiver', 'Roundtable', 'Change Advisory'],
  standing: [
    'Firewall Rule', 'Scope Guard', 'Procurement Guard', 'Key Control', 'Privacy Notice',
    'Retention Policy', 'Regulatory Shield', 'Attestation', 'Legal Hold',
  ],
};

const lookup = <T extends string>(families: Readonly<Record<T, readonly string[]>>, fallback: T) => {
  const index = new Map<string, T>();
  for (const [family, names] of Object.entries(families) as [T, readonly string[]][]) {
    for (const name of names) index.set(name, family);
  }
  return (base: string): T => index.get(base) ?? fallback;
};

/**
 * Falls back rather than throwing, because an imported save can hold any string at all and a
 * tooltip is not the place to refuse one. The fallback is only ever reached by a name outside the
 * catalogue — every catalogued name is asserted present.
 */
export const weaponFamily = lookup(WEAPON_FAMILIES, 'trifle');
export const shieldFamily = lookup(SHIELD_FAMILIES, 'provisional');

/**
 * Armour needs no list at all: the slot is the family.
 *
 * Each of the nine vocabularies in `armourBySlot.ts` is one idea, documented there — identity,
 * coverage, escalation, handling, access, contingency, mobility, liability, footprint. Keying the
 * copy to the slot rather than to the noun means the families cannot go empty when the nouns change,
 * which is exactly how the previous version rotted.
 */
export type ArmourSlot = Exclude<EquipSlot, 'Weapon' | 'Shield'>;

export const CATALOGUED_WEAPONS: readonly string[] = WEAPONS.map(([name]) => name);
export const CATALOGUED_SHIELDS: readonly string[] = SHIELDS.map(([name]) => name);
