# Equipment shortens encounters

Status: accepted
Decision date: 2026-08-08

## Context

Canonical Progress Quest gives equipment no mechanical effect. A kill's duration is
`2 * 3 * opponentLevel * 1000 / characterLevel` — opponent puissance over character level, and
nothing else. Equipment ratings describe the prestige of what was generated, not power.

Two documents state this outright. `CONTEXT.md` records that generation quality "contributes no
attack or mitigation because classic combat has neither calculation", and that equipment, spells,
loot and gold have no effect on encounter time. `src/state/commendations.ts` restates it: equipment
is "prestige, not power".

The owner has decided that equipment should mean something.

## Decision

Equipment shortens encounters, through one multiplier applied after the canonical duration:

```
durationMs = floor(canonicalDuration * 1000 / (1000 + loadoutQuality))
```

`loadoutQuality` sums the eleven equipped slots using the same per-item rating the tooltips already
derive, so the two can never disagree about what an item is worth.

**Quality floors at zero.** A negative loadout is reachable and ordinary — `-3 Burlap` is the
starting hauberk — and letting it lengthen encounters would mean a threadbare hauberk punishing the
player for wearing it. That reads as a defect rather than a mechanic. Negative effects belong to
adversaries, as something done to the hero rather than a property of their own gear, and are not
part of this decision.

The curve is asymptotic rather than linear. `1000 / (1000 + quality)` approaches zero without
reaching it, so an encounter can become very fast and never becomes instant or negative. A linear
reduction would need a clamp, and a clamp is a second rule that has to be kept true.

## Consequences

**Every recorded golden is unchanged, and the reason has now been wrong twice.** The first draft said
the floor kept them intact; removing the floor disproved that. The correction that replaced it said
the goldens never reach the kill-duration path at all. That is also false, and it was checked
carelessly — `one-kill.json` pins a regenerated next task of `kill|Grid Bug|1|trace` at `maxMs: 6000`,
which is this formula's output, and three other fixtures do the same.

The true reason is narrower than the first claim and broader in what it permits. **Every fixture's
input loadout is `Sharp Rock` and `-3 Boilerplate`, and both contribute nothing** — `Sharp Rock`
matches no `WEAPONS` label, and `Boilerplate` at 3 with a `-3` assessor's mark is 0. Measured:
`loadoutQuality` is `0` and `encounterSpeedMultiplier(0)` is exactly `1`, so the multiplication is
the identity and the recorded durations survive it untouched.

That is a general licence and worth writing down as one: **a loadout-derived multiplier is
golden-safe if and only if it is inert at `loadoutQuality === 0`.** It is mechanically checkable
rather than a matter of judgement, and it covers far more future change than "the path is never
reached" would have.

**Corrected by ADR 0010, which is where the current rule lives.** The paragraph above describes the
loadout every fixture *starts* in, and it stops being true partway through: `act-transition.json`
gains a `Lanyard` and the two `purchase-exit-price` fixtures gain a `Framework`, totalling 1 and 5,
so at the widest loadout any fixture reaches this multiplier is 0.994 rather than 1. The recordings
survive because no fixture both gains equipment and prices a kill in the same transition — a
disjointness nobody had noticed and nothing asserted until ADR 0010 pinned it. That is the third
correction to this section, and the first one found by a test rather than by argument.

It also means the goldens *do* guard this formula, at exactly one point — the point where it must do
nothing. They cannot vouch for its behaviour anywhere else, so the unit tests remain the only guard
for the rest. The floor is still justified by its design argument alone: a threadbare hauberk should
not punish the player for wearing it.

**`CONTEXT.md` is now wrong in two places** and is superseded here rather than silently left. The
statements were true of the original and are no longer true of this build, which is what ADR 0003
anticipated when it recorded that this is a spiritual successor free to diverge deliberately.

**The effect arrives late.** A scale of 1000 is far above what a mid-game loadout reaches, so early
play is untouched and the mechanic becomes noticeable as the numbers grow — the same shape the rest
of this game's escalation already has.

**Nothing else in the simulation reads equipment.** This is the only coupling introduced, and it is
one multiplication at one site.

## Not included

The threshold-and-zeros display mechanic the owner described — carrying a mantissa and a decade
count so displayed numbers grow without the engine doing arithmetic on large ones — is independently
useful and independently testable, and lands separately.
