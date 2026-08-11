# Progress Quest III Domain

The canonical language for a deterministic zero-player RPG session and its progression.

## Language

**Session**:
An active character together with progression tracks, counters, pending work, pause state, and deterministic continuation.
_Avoid_: Save, character

**Active-session checkpoint**:
A strict, versioned browser record that resumes one Session before rendering. It is separate from portable PQW character data and the multi-character roster.
_Avoid_: Autosave character, PQW v1

**Last-known-good checkpoint**:
The previously validated primary checkpoint retained for in-memory recovery. Recovery never authorizes automatic replacement of unreadable primary bytes.

**Roster identity**:
A character's exact, case-sensitive name, bounded to 1–120 UTF-16 code units. Saving the same identity replaces its prior roster entry; names that differ by case remain distinct.
_Avoid_: Normalized name, roster index

**PQW v0**:
The exact unversioned modern character-sheet payload. It is distinct from the classic game's tuple-based PQW payload and accepts no unknown fields.
_Avoid_: Legacy PQW, versionless data

**Transition**:
One application of elapsed time and RNG to a session; it may complete zero, one, or several tasks.
_Avoid_: Task completion

**Transition module interface**:
`advanceGame(state, elapsedMs, rng)` returns the next character/progression state, chronological Events, and any elapsed milliseconds left after the bounded 100-task catch-up. It never mutates the supplied state. The injected RNG continuation is the single deliberate mutable input and advances in canonical legacy order. Pause policy, activity presentation, sounds, clocks, storage, and carrying bounded remainder into a later scheduler tick belong to the Zustand adapter.

**Task**:
Timed work whose duration and current position are measured in milliseconds.
_Avoid_: Action, job

**Sequence task**:
A bounded prologue or cinematic Task that advances authored plot presentation without granting ordinary combat or market effects.
_Avoid_: Dialogue line, cutscene state

**Act marker**:
The final Sequence task whose start completes the prior Act and resets the Plot track.
_Avoid_: Plot reward, Act task

**Progress delta**:
A completed task's duration converted to seconds for progression tracks. Adventure elapsed separately records only whole seconds.

**Experience track**:
A bounded number of seconds toward the next character level.
_Avoid_: XP points

**Quest track**:
A bounded number of seconds toward completing the current quest.

**Quest reward**:
At most one spell, equipment, stat, or item effect granted when a nonempty quest completes. It is one in the ordinary case; a reward that would exceed a persistence ceiling, or land in a full inventory, changes nothing and emits nothing, matching the rule that an effect is reported only when persisted state actually moves.
_Avoid_: Kill loot, level-up reward

**Plot track**:
A bounded number of seconds toward the next cinematic or Act.

**Encumbrance**:
Derived carried-item quantity, excluding Gold, measured in cubits.
_Avoid_: Persisted weight

**Item identity**:
The stable kind and canonical name of an item, plus its equipment slot when applicable. Quantity, owner, render order, and time are not identity.

**Micro-story**:
Deterministic flavor derived from an item's identity components. It may be absurd but never asserts an unmodeled mechanic.
_Avoid_: Random description, item effect

**Item effect**:
The mechanically authoritative facts exposed for an item, kept separate from its micro-story.
_Avoid_: Flavor text

**Equipment generation quality**:
The sum of an equipment base, its named quality modifiers, and any residual numeric mark. It governs the prestige of newly awarded equipment near a character's level, and since ADR 0008 it also shortens encounters: `encounterSpeedMultiplier(loadoutQuality(character))` divides every kill's duration. It contributes no attack or mitigation, because classic combat has neither calculation.
_Avoid_: Attack rating, armor rating, damage

**Spell rank**:
The number of times a spell has been learned. It is prestige recorded for legacy brag metadata, not spell damage or combat priority.
_Avoid_: Spell power, caster level

**Combat contribution**:
Whether an item changes encounter time. Spells, loot and Gold have none. **Equipment does**, per ADR 0008 — better equipment shortens encounters without ever making one instant, on an asymptotic curve.

This definition said equipment had none, and ADR 0008 declared it wrong in writing — "`CONTEXT.md` is now wrong in two places and is superseded here rather than silently left" — and then it stayed. Three surfaces each worked around it rather than fixing it: `itemDetails.ts` re-glosses the field as "damage is not modeled", `serviceRecord.ts` says "None contributed attack or mitigation; the schedule benefited regardless", and the world console was corrected the same way. `itemMechanics.ts` still types `EquipmentMechanics.combatContribution` as the literal `'none'`, which is the remaining consequence of the stale definition rather than a separate defect.
_Avoid_: Hidden effect, abstract damage

**Task count**:
The number of completed tasks in a session.

**Adventure elapsed**:
Accumulated whole seconds from completed tasks.
_Avoid_: Wall-clock time

**Quest target**:
The current quest monster's identity and canonical table position.

**Pending queue**:
Ordered Sequence tasks waiting to become active; absence means no pending sequence.

**RNG continuation**:
The exact live Alea state needed to resume deterministic progression.
_Avoid_: Seed

**Save-point RNG**:
The legacy mid-transition Alea snapshot, which may differ from RNG continuation.

**Event**:
An ordered domain fact whose activity text is presentation.
_Avoid_: Log message
