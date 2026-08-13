import type { EquipSlot, PrimeStat, StatName } from '../engine/types';

export const PRIME_STATS: PrimeStat[] = ['STR', 'CON', 'DEX', 'INT', 'WIS', 'CHA'];

export const ALL_STATS: StatName[] = [...PRIME_STATS, 'HP Max', 'MP Max'];

export const EQUIP_SLOTS: EquipSlot[] = [
  'Weapon',
  'Shield',
  'Helm',
  'Hauberk',
  'Brassairts',
  'Vambraces',
  'Gauntlets',
  'Gambeson',
  'Cuisses',
  'Greaves',
  'Sollerets',
];

/**
 * The spell book, ordered by how often it is drawn rather than by grandeur.
 *
 * `generateSpellReward` takes `min(rng.random(limit), rng.random(limit))`, so this list is a
 * popularity ladder: index 0 wins about 17% of draws at level 1, and the far end is not a rare
 * reward, it is unreachable. Measured over a million draws across levels 1 to 26 — which is past
 * where an ordinary file gets — everything from index 35 up drew under 0.15%, and `Cost Excision`,
 * `Cascade Blame` and `Infinite Deferral` never appeared at all. The funniest names in the book sat
 * at the bottom of it.
 *
 * Ten pairs were swapped: the flattest names inside the reachable band traded places with the
 * strongest names outside it. Nothing was added, removed or reworded, and indices 0 and 1 are
 * untouched because recorded fixtures name them. The three that now never draw are `Expedite`,
 * `Best Practice` and `Change Fatigue`, which is the trade worth making — a corporate-boilerplate
 * name loses nothing by being rare, and `Infinite Deferral` at 7.4% is a joke a watcher will
 * actually meet.
 *
 * The length is 47 and must stay 47: `rng.random(limit)` reads it, so adding or removing an entry
 * remaps every subsequent draw and breaks the recorded fixtures. Reordering is safe only because
 * the fixtures reach indices 0 and 1 alone, which was checked by grepping every name against them
 * rather than assumed.
 */
export const SPELLS: string[] = [
  'Wet Signature',
  'Quick Win',
  'Infinite Deferral',
  'Cascade Blame',
  'Wrenfield\'s Big Day Off',
  'Cost Excision',
  'Red Tape',
  'Holy Rollout',
  'Cone of Reminders',
  'Magnetic Roadmap',
  'Shadow Staffing',
  'Cloud Revolt',
  'Fiscal Humour',
  'Spectral Overhead',
  'Clever Workaround',
  'Gag Order',
  'Bearish Armour',
  'Animate Lanyard',
  'Big Skip-Level',
  'Cone of Boilerplate',
  'Idle Hands',
  'Pemberton\'s Bright Idea',
  'Bypass Procedure',
  'Spectral Deliverable',
  'Braindump',
  'Summon a Stakeholder',
  'Nonconcur',
  'Animate Org Chart',
  'Eye of the Auditor',
  'Name and Shame',
  'Scope Creep',
  'Gallows Humour',
  'Ashgrove\'s Grand Illusion',
  'Requisition',
  'Black Budget',
  'Quarterly Miasma',
  'Finding (Non-Material)',
  'Do-Over Clause',
  'Sanctioned Shortcut',
  'Low Morale',
  'Finding (Material)',
  'Risk Aversion',
  'Retrospective',
  'Onboard',
  'Change Fatigue',
  'Best Practice',
  'Expedite',
];

export const OFFENSE_ATTRIB: [string, number][] = [
  ['Vetted', 1],
  ['Tiered', 1],
  ['Staffed', 1],
  ['Phased', 2],
  ['Signed', 2],
  ['Binding', 3],
  ['Punitive', 4],
  ['Enforced', 4],
  ['Scripted', 5],
  ['Unlogged', 6],
  ['Ratified', 7],
  // Above here the ladder is new, and it exists because the old one stopped at seven while the
  // characters did not. `generateEquipUpgrade` tops every item up to the character's level exactly,
  // so a shortfall the vocabulary cannot absorb becomes the assessor's mark instead — measured mean
  // |mark| was 4.4 at level 25 and 174 at level 200, which is an item that is a large integer with
  // two decorative words attached.
  //
  // Roughly 1.6x a rung, so a tier is always worth reaching and never worth skipping two of. The
  // register escalates from a thing that was done to a thing that cannot be undone, which is the
  // only direction an institution has.
  ['Codified', 8],
  ['Gazetted', 10],
  ['Enshrined', 13],
  ['Upheld', 17],
  // Each rung below carries a second word at the same value, in the register the world acquires as
  // acts accumulate. Same value, so the arithmetic is untouched and only the noun moves.
  ['Entrenched', 21],
  ['Deployed', 21],
  ['Sustained', 27],
  ['Anchored', 27],
  ['Statutory', 34],
  ['Pinned', 34],
  ['Settled', 43],
  ['Committed', 43],
  ['Canonical', 55],
  ['Hardcoded', 55],
  ['Perpetual', 89],
  ['Inviolable', 144],
  ['Immemorial', 233],
];

export const DEFENSE_ATTRIB: [string, number][] = [
  ['Bonded', 1],
  ['Sealed', 2],
  ['Vested', 2],
  ['Insured', 3],
  ['Notarized', 4],
  ['Endorsed', 1],
  ['Audited', 4],
  ['Certified', 5],
  ['Bespoke', 3],
  // The same ladder as OFFENSE_ATTRIB above and the same reasoning, in this table's own register:
  // the offensive words are things done to a process, these are things done to a document.
  ['Attested', 8],
  ['Registered', 10],
  ['Engrossed', 13],
  ['Enrolled', 17],
  // Each rung below carries a second word at the same value, in the register the world acquires as
  // acts accumulate. Same value, so the arithmetic is untouched and only the noun moves.
  ['Warranted', 21],
  ['Mirrored', 21],
  ['Executed', 27],
  ['Replicated', 27],
  ['Ordained', 34],
  ['Persisted', 34],
  ['Perfected', 43],
  ['Archived', 43],
  ['Hallowed', 55],
  ['Vaulted', 55],
  ['Sacrosanct', 89],
  ['Unabridged', 144],
  ['Definitive', 233],
];

/**
 * Which modifiers belong to the register the world acquires as acts accumulate.
 *
 * `substrateStage(act)` already swaps whole pools of place names and item provenance at acts five
 * and twelve, so the map and the paperwork age together. The modifier vocabulary was the one surface
 * that did not move, and the owner asked that modifiers escalate with level *and* act.
 *
 * Magnitude stays level's job and register becomes act's. Every word here shares a value with a
 * legal-register word already in its table, so `base + modifiers + mark === level` is untouched and
 * pacing cannot move — the arithmetic is identical and only the noun changes.
 *
 * A set rather than a third tuple element: `traitTables.test.ts` asserts every quality entry is a
 * two-element pair, and that assertion is worth more than the convenience of packing a third field.
 *
 * Only the middle rungs. The shift is invisible on a `+8`, and the tallest rungs need a level no
 * save reaches — so this covers 21 through 55, which is the band a long file actually occupies.
 */
export const INDUSTRIAL_MODIFIERS: ReadonlySet<string> = new Set([
  'Deployed', 'Anchored', 'Pinned', 'Committed', 'Hardcoded',
  'Mirrored', 'Replicated', 'Persisted', 'Archived', 'Vaulted',
]);

export const SHIELDS: [string, number][] = [
  ['Placeholder', 0],
  ['Pilot Waiver', 1],
  ['Deprecation Notice', 2],
  ['Backlog Buffer', 3],
  ['Provisional Waiver', 4],
  ['Firewall Rule', 4],
  ['Roundtable', 5],
  ['Change Advisory', 5],
  ['Scope Guard', 6],
  ['Procurement Guard', 6],
  ['Key Control', 7],
  ['Privacy Notice', 8],
  ['Retention Policy', 9],
  ['Regulatory Shield', 11],
  ['Attestation', 12],
  ['Legal Hold', 18],
];

export const ARMORS: [string, number][] = [
  ['Lanyard', 1],
  ['Macro Policy', 2],
  ['Boilerplate', 3],
  ['Charter', 4],
  ['Framework', 5],
  ['Compliance Wrap', 6],
  ['Pilot Program', 7],
  ['Legal Review', 8],
  ['Bare Metal', 9],
  ['Ring Fence', 10],
  ['Scaling Policy', 12],
  ['Chain of Custody', 14],
  ['Split Tunnel', 15],
  ['Platform Mandate', 16],
  ['SLA', 17],
  ['Indemnity', 18],
  ['Tier-1 Support', 19],
  ['Immutable Backup', 20],
  ['Air Gap', 25],
  ['Sovereign Cloud', 30],
];

export const WEAPONS: [string, number][] = [
  ['Sticky Note', 0],
  ['Broken Build', 1],
  ['Shim', 1],
  ['Stub', 1],
  ['Nudge Email', 1],
  ['Action Item', 2],
  ['Box Cutter', 2],
  ['Claw-Back', 2],
  ['Handoff', 2],
  ['Andon Cord', 3],
  ['Hatchet Job', 3],
  ['Reorg Axe', 3],
  ['Hackathon Prize', 3],
  ['Escape Clause', 4],
  ['Mandate', 4],
  ['Battle Rhythm', 4],
  ['Leaf Ruling', 5],
  ['Short Sprint', 5],
  ['Long Pole', 5],
  ['Poach Order', 5],
  ['Baseline', 5],
  ['Wind-Down Order', 6],
  ['Blunder Bus', 6],
  ['Long-Range Plan', 6],
  ['Ratchet Clause', 6],
  ['Blocker', 7],
  ['Broad Writ', 7],
  ['Kanban Pike', 7],
  ['War Room Gavel', 7],
  ['Morning Standup', 8],
  ['Policy Adze', 8],
  ['Spontaneous Reorg', 8],
  ['Bastard Merge', 9],
  ['Performance Arm', 9],
  ['Severance Cannon', 10],
  ['Lateral Move', 10],
  ['Halt Order', 11],
  ['Restructure', 12],
  ['Board Directive', 15],
];

export const SPECIALS: string[] = [
  'Directive', 'Filing', 'Memorandum', 'Placard', 'Tally', 'Schedule', 'Addendum', 'Ledger', 'Letterhead',
  'Handbook', 'Franchise', 'Licence', 'Briefing', 'Gazette', 'Codicil', 'Allocation', 'Bylaw',
  'Budget Line', 'Tariff', 'Grant', 'Amendment', 'Seal', 'Covenant', 'Statute', 'Subpoena', 'Annex',
  'Tribunal', 'Order', 'Gazetteer', 'Ordinance', 'Bulletin', 'Guideline', 'Bequest', 'Stipend',
  'Guarantee', 'Hearing', 'Variance'
];

export const ITEM_ATTRIB: string[] = [
  'Certified', 'Ratified', 'Provisional', 'Archival', 'Commended', 'Confidential', 'Chartered',
  'Dual-Signed', 'Annotated', 'Cross-Filed', 'Unredacted', 'Approved', 'Deferential', 'Unaudited',
  'Escrowed', 'Laminated', 'Executive', 'Privileged', 'Landmark', 'Precedent', 'Itemized', 'Austerity',
  // `Soulbound` replaced `Customary` in place. Bind-on-pickup is the loot rule every MMO player
  // knows and this table of thirty-three paperwork words had no joke about loot rules at all;
  // `Customary` was among its deadest entries. A same-length replacement, so no draw moves.
  //
  // One consequence, as with the pruned modifier rungs: a save written earlier can hold an item
  // named "Customary ...", and `analyzeItemMechanics` will no longer recognise that word, so that
  // item's computed quality changes. The item keeps its name and nothing else about the character
  // moves.
  'Gold-Plated', 'Sole-Source', 'Soulbound', 'Binding', 'Terminal', 'Discretionary', 'Off-Books',
  'Flagship', 'Ironclad', 'Overhead', 'Material'
];

export const ITEM_OFS: string[] = [
  'Foreseeable Risk', 'Forward Guidance', 'Nonconformance', 'Headcount', 'Throughput', 'Downtime',
  'Compliance', 'Silent Failure', 'Invisible Labour', 'Rapid Iteration', 'Procurement', 'Prioritization',
  'Hard Deadlines', 'Jurisdiction', 'Perpetual Beta', 'Integration', 'Change Control', 'Sunk Cost',
  'Escalation', 'Fiscal Year', 'Sustained Effort', 'Single Ownership', 'Punctual Delivery', 'Efficiencies',
  'Contingency', 'Pending Review', 'Internal Audit', 'Indefinite Hold', 'Misalignment', 'Lock-In',
  'Enterprise Value', 'Arbitration', 'Working Capital', 'Force Majeure', 'Assurance', 'Governance',
  'Provisioning', 'Forecast', 'Post-Mortem', 'Market Position', 'Findings', 'Fee Structure',
  'Hiring Freeze', 'Depreciation', 'Cost Recovery', 'Gross Margin', 'Due Diligence', 'Record', 'the Board',
  'Diminishing Returns', 'Escrow', 'Hypercare'
];

// 'writ' appears twice, exactly as it did in the original table this mirrors. It is faithful
// rather than careless, and deduplicating it would change the draw weights. Pinned as deliberate
// by `src/__tests__/goldens/traitTables.test.ts`.
export const BORING_ITEMS: string[] = [
  'paperclip', 'lanyard', 'sticky note', 'I.O.U.', 'cookie', 'punch card', 'toner cartridge', 'writ',
  'newsletter', 'letter', 'placeholder', 'hard hat', 'egg timer', 'token', 'name badge', 'bucket',
  'career ladder', 'rubber duck', 'tally sheet', 'dust cap', 'countersign', 'hi-vis vest', 'tech debt',
  'binder clip', 'redacted page', 'punch list', 'carrot', 'compliance binder', 'ink cartridge',
  'hold notice', 'band-aid fix', 'travel voucher', 'time sheet', 'pending tray', 'action register',
  'audit trail', 'transit pass', 'card key', 'notary seal', 'training cert', 'vendor trash', 'writ'
];

export interface MonsterDef {
  name: string;
  level: number;
  item: string;
}

export const MONSTERS: MonsterDef[] = [
  { name: 'Access Review', level: 6, item: 'exception' },
  { name: 'Backlog Item', level: 0, item: 'estimate' },
  { name: 'All-Hands Call', level: 4, item: 'slide' },
  { name: 'Budget Rebaseline', level: 14, item: 'variance' },
  { name: 'Dashboard Owner', level: 10, item: 'drilldown' },
  { name: 'Black-Box Vendor', level: 10, item: 'contract' },
  { name: 'Flaky Test', level: 4, item: 'retry' },
  { name: 'Intern', level: 1, item: 'lanyard' },
  { name: 'Associate', level: 2, item: 'cookie' },
  { name: 'Analyst', level: 3, item: 'certificate' },
  { name: 'Senior Analyst', level: 4, item: 'certificate' },
  { name: 'Known Issue', level: 3, item: 'workaround' },
  { name: 'Wontfix', level: 3, item: 'triage note' },
  { name: 'Heisenbug', level: 3, item: 'core dump' },
  { name: 'Hump-Day Sync', level: 2, item: 'agenda' },
  { name: 'Crawler Job', level: 3, item: 'sitemap' },
  { name: 'Cost Blowout', level: 6, item: 'invoice' },
  { name: 'Contractor', level: 4, item: 'timesheet' },
  { name: 'Checklist', level: 0, item: 'tickbox' },
  { name: 'Compliance Audit', level: 5, item: 'finding' },
  { name: 'Council Seat', level: 9, item: 'proxy' },
  { name: 'Crash Report', level: 0, item: 'stack trace' },
  { name: 'Board Chair', level: 53, item: 'gavel' },
  { name: 'Joint Venture', level: 17, item: 'term sheet' },
  { name: 'Mailing List', level: 1, item: 'opt-out' },
  { name: 'Staff Chief', level: 27, item: 'calendar' },
  { name: 'Recruiter', level: 6, item: 'cold email' },
  { name: 'Growth VP', level: 8, item: 'funnel' },
  { name: 'Ops Lead', level: 9, item: 'runbook' },
  { name: 'General Counsel', level: 10, item: 'redline' },
  { name: 'Chief Auditor', level: 11, item: 'management letter' },
  { name: 'Matrix Manager', level: 7, item: 'org chart' },
  { name: 'Bar Raiser', level: 8, item: 'rubric' },
  { name: 'Activist Investor', level: 25, item: 'letter' },
  { name: 'Regulator', level: 52, item: 'order' },
  { name: 'Bond Trustee', level: 43, item: 'covenant' },
  { name: 'Barbed Clause', level: 8, item: 'penalty' },
  { name: 'Bonus Clawback', level: 9, item: 'schedule' },
  { name: 'Dispute Panel', level: 30, item: 'ruling' },
  { name: 'Escalation Lead', level: 6, item: 'page' },
  { name: 'Guarantor', level: 30, item: 'security' },
  { name: 'Maintenance Fork', level: 5, item: 'patchset' },
  { name: 'Hiring Freeze', level: 11, item: 'req' },
  { name: 'Legacy Blob', level: 3, item: 'sludge' },
  { name: 'Pilot Fiend', level: 13, item: 'waiver' },
  { name: 'Tape Cluster', level: 9, item: 'spool' },
  { name: 'Batch Mainframe', level: 30, item: 'abend' },
  { name: 'Data Warehouse', level: 24, item: 'extract' },
  { name: 'ETL Pipeline', level: 15, item: 'job log' },
  { name: 'Green-Screen App', level: 13, item: 'terminal' },
  { name: 'Intranet Portal', level: 6, item: 'frameset' },
  { name: 'Monolith', level: 12, item: 'module' },
  { name: 'Mono Repo', level: 8, item: 'submodule' },
  { name: 'Punchcard Reader', level: 12, item: 'card' },
  { name: 'Stored Procedure', level: 18, item: 'plan' },
  { name: 'Tape Archive', level: 16, item: 'reel' },
  { name: 'Ticketing System', level: 18, item: 'backlog' },
  { name: 'Genie Account', level: 7, item: 'token' },
  { name: 'Duplicate Record', level: 4, item: 'merge key' },
  { name: 'Basic Support', level: 7, item: '*' },
  { name: 'Plaid Support', level: 7, item: 'tartan' },
  { name: 'Blue-Chip Vendor', level: 9, item: '*' },
  { name: 'Beige Vendor', level: 9, item: '*' },
  { name: 'Brass Tier', level: 7, item: 'nameplate' },
  { name: 'Tin Tier', level: 8, item: '*' },
  { name: 'Bronze Support', level: 9, item: 'medal' },
  { name: 'Enterprise Tier', level: 16, item: 'rider' },
  { name: 'Copper Tier', level: 8, item: 'coupon' },
  { name: 'Gold Support', level: 8, item: 'filling' },
  { name: 'Green Tier', level: 8, item: '*' },
  { name: 'Platinum Support', level: 21, item: '*' },
  { name: 'Red-Flag Vendor', level: 10, item: 'notice' },
  { name: 'Silver Support', level: 10, item: '*' },
  { name: 'White-Label Tier', level: 6, item: 'sticker' },
  { name: 'Vendor Lock-In', level: 13, item: 'shell' },
  { name: 'Dry Run', level: 2, item: 'checklist' },
  { name: 'Draft Policy', level: 1, item: 'markup' },
  { name: 'Escalation', level: 2, item: 'ticket' },
  { name: 'Emergency Fix', level: 10, item: 'cinder' },
  { name: 'Sandbox Elemental', level: 8, item: 'glass' },
  { name: 'Backup Elemental', level: 10, item: 'bit' },
  { name: 'Portal Elemental', level: 12, item: 'iframe' },
  { name: 'Cache Elemental', level: 14, item: 'shard' },
  { name: 'Header Elemental', level: 16, item: 'preflight' },
  { name: 'Swamp Ticket', level: 1, item: 'lilypad' },
  { name: 'Brownfield Elf', level: 1, item: 'permit' },
  { name: 'Seat Licence', level: 1, item: 'jerkin' },
  { name: 'Two-Headed Team', level: 10, item: 'dotted line' },
  { name: 'Form Field', level: 0, item: 'label' },
  { name: 'Vendor Fungus', level: 3, item: 'spore' },
  { name: 'Gatekeeper', level: 4, item: 'kerbstone' },
  { name: 'Gelatinous Sprint', level: 4, item: 'jam' },
  { name: 'Ghost Sprint', level: 4, item: 'burndown' },
  { name: 'Ghost Record', level: 10, item: '*' },
  { name: 'Ghosted Candidate', level: 2, item: 'no-show' },
  { name: 'Headcount Giant', level: 12, item: 'req' },
  { name: 'Backlog Giant', level: 11, item: 'epic' },
  { name: 'Quota Giant', level: 10, item: 'crystal' },
  { name: 'Procurement Giant', level: 9, item: 'fixture' },
  { name: 'Rollout Giant', level: 8, item: 'grain' },
  { name: 'Cloud Giant', level: 12, item: 'egress bill' },
  { name: 'Firedrill Giant', level: 11, item: 'siren' },
  { name: 'Freeze Giant', level: 10, item: 'snowman' },
  { name: 'Hiring Giant', level: 8, item: 'offer letter' },
  { name: 'Standup Giant', level: 9, item: 'blocker' },
  { name: 'Storm Giant', level: 15, item: 'barometer' },
  { name: 'Minor Giant', level: 4, item: 'footnote' },
  { name: 'Nagging Bot', level: 2, item: 'reminder' },
  { name: 'Nitpick', level: 1, item: 'comment' },
  { name: 'Gremlin', level: 1, item: 'flake' },
  { name: 'Grid Bug', level: 1, item: 'trace' },
  { name: 'Job Runner', level: 9, item: 'artifact' },
  { name: 'Build Golem', level: 15, item: 'cache key' },
  { name: 'Ops Golem', level: 17, item: 'playbook' },
  { name: 'Container Golem', level: 14, item: 'layer' },
  { name: 'Stamp Golem', level: 16, item: 'impression' },
  { name: 'Ledger Golem', level: 15, item: 'fob' },
  { name: 'Governance Board', level: 8, item: 'minute' },
  { name: 'Grey Area', level: 3, item: 'roux' },
  { name: 'Greenfield Slime', level: 2, item: 'sample' },
  { name: 'Grievance', level: 7, item: 'filing' },
  { name: 'Alert Storm', level: 7, item: 'pager' },
  { name: 'Harried PM', level: 3, item: 'gantt' },
  { name: 'Helpdesk Hound', level: 5, item: 'transcript' },
  { name: 'Hiring Panel', level: 4, item: 'scorecard' },
  { name: 'Hybrid Sprint', level: 3, item: 'egg' },
  { name: 'Hotfix Goblin', level: 1, item: 'patch' },
  { name: 'Headless Client', level: 2, item: 'cookie' },
  { name: 'Multi-Cloud Hydra', level: 8, item: 'invoice' },
  { name: 'Interim Policy', level: 2, item: 'stub' },
  { name: 'Silent Failure', level: 8, item: '*' },
  { name: 'Ironclad Clause', level: 3, item: 'filler' },
  { name: 'Job Hopper', level: 3, item: 'resume' },
  { name: 'Kickoff Meeting', level: 1, item: 'agenda' },
  { name: 'Line Item', level: 1, item: 'wallet' },
  { name: 'Loophole', level: 6, item: 'hoof' },
  { name: 'Lifer', level: 11, item: 'crown' },
  { name: 'Ledger Clerk', level: 2, item: 'tally' },
  { name: 'Lurker', level: 10, item: 'transcript' },
  { name: 'Metrics Core', level: 6, item: 'spike' },
  { name: 'Mandate Stack', level: 12, item: 'tusk' },
  { name: 'Mediation', level: 6, item: 'settlement' },
  { name: 'Multi-Tenant', level: 2, item: 'dendrite' },
  { name: 'Shadow Stack', level: 1, item: 'spreadsheet' },
  { name: 'Burnout', level: 1, item: 'shirt' },
  { name: 'Cave-Dweller', level: 2, item: 'club' },
  { name: 'Deadline Dervish', level: 1, item: 'robe' },
  { name: 'Middle Manager', level: 1, item: 'skip-level' },
  { name: 'Metrics Maid', level: 1, item: 'dashboard' },
  { name: 'Mimic Process', level: 9, item: 'hinge' },
  { name: 'Mind-Share Lead', level: 8, item: 'tentacle' },
  { name: 'Maze Owner', level: 6, item: 'map' },
  { name: 'Yellow Flag', level: 1, item: 'spore' },
  { name: 'Morale Dip', level: 7, item: 'molar' },
  { name: 'Mummified Doc', level: 6, item: 'gauze' },
  { name: 'Narrative Owner', level: 9, item: 'rattle' },
  { name: 'Nervous Deputy', level: 1, item: 'hedge' },
  { name: 'Neo-Bureaucrat', level: 11, item: 'organ' },
  { name: 'Nitpicker', level: 1, item: 'webbing' },
  { name: 'Nomination', level: 3, item: 'hanky' },
  { name: 'Onboarding Jelly', level: 6, item: 'nucleus' },
  { name: 'Org Chart Octopus', level: 2, item: 'beak' },
  { name: 'Overrun', level: 4, item: 'talon' },
  { name: 'Overrun Mage', level: 5, item: 'apparel' },
  { name: 'Off-Cycle Ask', level: 1, item: 'exception' },
  { name: 'Outage', level: 7, item: 'organ' },
  { name: 'On-Call Bear', level: 5, item: 'pager' },
  { name: 'Paging Rota', level: 4, item: 'aileron' },
  { name: 'Perf Review', level: 4, item: 'calibration' },
  { name: 'Pierced SLA', level: 3, item: 'tip' },
  { name: 'Post-It', level: 1, item: 'dust' },
  { name: 'War Room', level: 3, item: 'tentacle' },
  { name: 'Purple Squirrel', level: 15, item: 'counter-offer' },
  { name: 'Quorum Loss', level: 3, item: 'tail' },
  { name: 'Reorg Shadow', level: 7, item: 'dressing gown' },
  { name: 'Nit', level: 0, item: 'tail' },
  { name: 'Remediation', level: 11, item: 'protrusion' },
  { name: 'Root Cause', level: 18, item: 'wing' },
  { name: 'Roadmap Roper', level: 11, item: 'twine' },
  { name: 'Tech Debt Grub', level: 1, item: 'eggsac' },
  { name: 'Decay Monster', level: 5, item: 'swarf' },
  { name: 'Steering Chair', level: 5, item: 'hoof' },
  { name: 'Service Hag', level: 3, item: 'wart' },
  { name: 'Silo Keeper', level: 3, item: 'fur' },
  { name: 'Shadow Backlog', level: 3, item: 'silhouette' },
  { name: 'Shambling Merge', level: 10, item: 'mulch' },
  { name: 'Bikeshedder', level: 9, item: 'hoof' },
  { name: 'Shrieking Alert', level: 3, item: 'stalk' },
  { name: 'Skeleton Crew', level: 1, item: 'clavicle' },
  { name: 'Spec Ghost', level: 7, item: 'vestige' },
  { name: 'Steering Sphinx', level: 10, item: 'paw' },
  { name: 'Spider Crawl', level: 0, item: 'web' },
  { name: 'Sprint', level: 1, item: 'can' },
  { name: 'Standup', level: 1, item: 'update' },
  { name: 'Status Bear', level: 5, item: 'tooth' },
  { name: 'Status Worm', level: 2, item: 'green square' },
  { name: 'Sub-Monster', level: 5, item: 'tail' },
  { name: 'Syllabus', level: 3, item: 'module' },
  { name: 'Titan Client', level: 20, item: 'sandal' },
  { name: 'Trap Ticket', level: 12, item: 'reopen' },
  { name: 'Decision Tree', level: 10, item: 'acorn' },
  { name: 'Triage Owner', level: 3, item: 'scale' },
  { name: 'Troll Reviewer', level: 2, item: 'tail' },
  { name: 'Thread Troll', level: 6, item: 'hide' },
  { name: 'Umbrella Hulk', level: 8, item: 'claw' },
  { name: 'Rockstar Hire', level: 4, item: 'blood' },
  { name: 'Vendor Vampire', level: 8, item: 'retainer' },
  { name: 'Whiteboard Wight', level: 4, item: 'marker' },
  { name: 'Scope Wisp', level: 9, item: 'creep' },
  { name: 'Wrap-Up Wraith', level: 5, item: 'finger' },
  { name: 'Waiver', level: 7, item: 'wing' },
  { name: 'Cross-Functional', level: 7, item: 'jaw' },
  { name: 'Yearly Review', level: 4, item: 'fur' },
  { name: 'Zombie Process', level: 2, item: 'orphaned PID' },
  { name: 'Nag Email', level: 0, item: 'stinger' },
  { name: 'Nit', level: 1, item: 'tail' },
  { name: 'Bug Report', level: 0, item: 'ear' },
  { name: 'Typo', level: 0, item: 'dust' },
  { name: 'Beta User', level: 0, item: 'collar' },
  { name: 'Minor Defect', level: 0, item: 'corpse' },
  { name: 'Ostrich Manager', level: 1, item: 'beak' },
  { name: 'Billing Goat', level: 1, item: 'beard' },
  { name: 'Batch Job', level: 1, item: 'wing' },
  { name: 'Kanban Koala', level: 2, item: 'heart' },
  { name: 'Workflow', level: 2, item: 'paw' },
  { name: 'Whitepaper', level: 2, item: 'collar' },
  { name: 'Upgrade', level: 2, item: 'boot' },
  { name: 'Payroll Node', level: 4, item: 'garnishment' },
  { name: 'Mockup', level: 8, item: 'redline' },
  { name: 'Flyer', level: 0, item: '*' },
  { name: 'Helpdesk Bird', level: 3, item: 'curl' },
  { name: 'Workaround', level: 4, item: 'lemma' },
];

export const OFFENSE_BAD: [string, number][] = [
  ['Untagged', -2],
  ['Flagged', -1],
  ['Stale', -3],
  ['Redlined', -5],
  ['Waived', -4],
  ['Trial', -4],
  ['Unfunded', -6],
  ['Sunset', -7],
  ['Disputed', -2],
  // Nothing deeper, and the reason is measured rather than reasoned.
  //
  // Three rungs were added here on the argument that |plus| is bounded by the tallest base,
  // so anything inside thirty is drawable. The bound is right and the distribution is not: the base
  // is picked best-of-six-closest-to-level, so |plus| is small by construction and never approaches
  // it. Over 194 811 negative draws across levels 1-25, `Quashed`, `Vacated` and `Struck` were drawn
  // exactly zero times each and have been removed.
  //
  // This table is under-drawn for a second, older reason: it is consulted only for the Weapon slot,
  // one of eleven, and WEAPONS ratings top out at 15 against ARMORS' 30 — so weapon shortfalls are
  // smaller again. `Unfunded` was drawn twice and `Redlined` ten times in that same sample. Those
  // predate this and are left alone; the point here is not to prune the table, it is not to have
  // added to it without checking.
];

export const DEFENSE_BAD: [string, number][] = [
  ['Unsigned', -1],
  ['Hotfixed', -1],
  ['Nerfed', -2],
  ['Lapsed', -1],
  ['Damaged', -2],
  ['Voided', -3],
  ['Contested', -3],
  ['Enjoined', -5],
  ['Offshored', -4],
  ['Breached', -4],
  ['Misfiled', -3],
  ['Uninsured', -3],
  // Two rungs, both measured as reachable. The defensive table is consulted for ten slots of eleven
  // and its bases run to thirty, so shortfalls here are the largest the game produces: in the same
  // 194 811-draw sample `Expunged` was drawn 886 times and `Rescinded` 60. `Abrogated` at -21 was
  // drawn none and has been removed.
  ['Expunged', -8],
  ['Rescinded', -13],
];


export interface RaceDef {
  name: string;
  stats: StatName[];
}

export const RACES: RaceDef[] = [
  { name: 'Half Daemon', stats: ['HP Max'] },
  { name: 'Demi-Contractor', stats: ['CHA'] },
  { name: 'Rounding Error', stats: ['DEX'] },
  { name: 'Double Tenant', stats: ['STR'] },
  { name: 'Sub-Subprocessor', stats: ['DEX', 'CON'] },
  { name: 'Lesser Kernel', stats: ['CON'] },
  { name: 'Off-Prem Elf', stats: ['WIS'] },
  { name: 'Talking Roadmap', stats: ['MP Max', 'INT'] },
  { name: 'Gyro-Auditor', stats: ['DEX'] },
  { name: 'Warm Failover', stats: ['CON'] },
  { name: 'Third-Party Cousin', stats: ['CHA'] },
  { name: 'Uncommitted Change', stats: ['DEX'] },
  { name: 'Load-Bearing Intern', stats: ['CON', 'STR'] },
  { name: 'Cache Revenant', stats: ['WIS'] },
  { name: 'Enchanted Forklift', stats: ['MP Max'] },
  { name: 'Depreciated Asset', stats: ['WIS'] },
  { name: 'Orphaned Cron', stats: ['DEX', 'INT'] },
  { name: 'Zombie Reaper', stats: ['STR'] },
  { name: 'Sentient Backlog', stats: ['WIS'] },
  { name: 'Provisioned Ghoul', stats: ['CON'] },
  { name: 'Escalated Squid', stats: ['STR', 'HP Max'] },
];

export interface KlassDef {
  name: string;
  stats: StatName[];
}

export const KLASSES: KlassDef[] = [
  { name: 'Incident Paladin', stats: ['WIS', 'CON'] },
  { name: 'Voodoo Stakeholder', stats: ['INT', 'CHA'] },
  { name: 'Robot Monk', stats: ['STR'] },
  { name: 'Mu-Fu Auditor', stats: ['DEX'] },
  { name: 'Illusioner of Record', stats: ['INT', 'MP Max'] },
  { name: 'Shiv-Certified', stats: ['DEX'] },
  { name: 'Inner Contractor', stats: ['CON'] },
  { name: 'Fighter/Ombudsman', stats: ['CHA', 'STR'] },
  { name: 'Puma Consultant', stats: ['DEX'] },
  { name: 'Runbook Loremaster', stats: ['WIS'] },
  { name: 'Retention Strangler', stats: ['DEX', 'INT'] },
  { name: 'Battle-Felon', stats: ['STR'] },
  // The bard seat. `Cadence` is a musical term and an agile one, which is the whole joke: the
  // class that keeps everybody else in time and is never once credited for it. Renamed rather than
  // added, because `KLASSES` is drawn with `rng.pick` for passing NPCs and two recordings pin one —
  // the length may not move. The stat spread is left exactly as it was for the same reason the test
  // beside it gives: names are free, balance is not.
  { name: 'Cadence Owner', stats: ['WIS', 'INT'] },
  { name: 'Slow Deprecator', stats: ['CON'] },
  { name: 'Interim Lunatic', stats: ['CON'] },
  { name: 'Direct Report', stats: ['WIS'] },
  { name: 'Pigeonholder', stats: ['WIS'] },
  { name: 'Vermineer', stats: ['INT'] },
];

export const TITLES: string[] = [
  'Mr.', 'Mrs.', 'Sir', 'Sgt.', 'Ms.', 'Captain', 'Chief', 'Admiral', 'Saint',
];

export const IMPRESSIVE_TITLES: string[] = [
  'Chair', 'Principal', 'Director', 'Controller', 'Deputy', 'Administrator', 'Heir Apparent',
  'Successor', 'Chief', 'Boss', 'Ombudsman', 'Chancellor', 'Trustee', 'Auditor General',
];
