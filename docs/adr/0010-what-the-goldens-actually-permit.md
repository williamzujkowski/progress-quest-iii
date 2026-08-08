# What the goldens actually permit

Status: accepted
Decision date: 2026-08-08

## Context

ADR 0008 introduced the first engine effect derived from equipment and, having got the reason wrong
twice, ended by writing down a rule: *a loadout-derived multiplier is golden-safe if and only if it
is inert at `loadoutQuality === 0`.*

That rule is correct and it is also narrower than the situation warrants. It was written for one
multiplier over the whole loadout, and it was read afterwards as the boundary of what the recordings
permit. Six further effects were then proposed, and the question of whether each was admissible was
being answered by argument rather than by measurement — which is how ADR 0008 got it wrong twice.

So the recordings were measured directly rather than reasoned about. `src/__tests__/fixtures/goldens/`
holds fifteen files; both `input.sheet.Equips` and the post-transition `expected.equipment` pairs
were scanned in full.

**Four distinct equipment strings exist across all fifteen fixtures.**

| Slot | input | expected (post-transition) |
|---|---|---|
| Weapon | `Sharp Rock` | `Sharp Rock` |
| Hauberk | `-3 Boilerplate` | `-3 Boilerplate` |
| Helm | *(empty)* | *(empty)*, `Lanyard` |
| Gauntlets | *(empty)* | *(empty)*, `Framework` |
| Shield, Brassairts, Vambraces, Gambeson, Cuisses, Greaves, Sollerets | *(empty)* | *(empty)* |

Three further facts, all measured:

- **Every stat in every fixture is exactly `10`.**
- **The only spells that ever appear are `Wet Signature` and `Quick Win`, both at rank 1.** They
  arrive mid-transition, in `xp-level-up.json` and `quest-completion.json` respectively.
- **`RandomGenerator.random(n)` is `floor(uint32() % n)` — exactly one state advance regardless of
  `n`.** Changing a bound never changes the draw count. Only adding or skipping a `random()` call
  does.

## Decision

An item-, stat- or spell-derived engine effect is golden-safe **if and only if it is inert at the
fixture state**, where the fixture state is the loadout above, all stats at `10`, and the spell sets
`{}`, `{Wet Signature: 1}` and `{Quick Win: 1}`.

Inertness has two strengths and the difference matters:

**Arithmetic inertness.** The effect is the identity at the fixture value as a property of the
arithmetic — `Math.max(0, stat - 10)` is `0` at ten, whatever else the sheet holds. This holds
however the recordings are read and is the form to prefer.

**Structural inertness.** The effect is unreachable because the fixtures never enter the state that
triggers it — seven slots are never equipped at any point, so an effect keyed to a base noun in those
vocabularies cannot fire. This is weaker: it is a fact about these fifteen recordings, which cannot be
re-recorded, rather than a theorem. It is sound, and it is what most of the slot-keyed effects rely
on, but it must be **pinned by its own test** so that a violation fails there, with an explanation,
rather than surfacing as an unexplained golden diff.

### The correction ADR 0008 needs

ADR 0008's rule is *"inert at `loadoutQuality === 0`"*, and that is true of the loadout every fixture
**starts** in. It stops being true partway through. `Lanyard` totals 1 and `Framework` totals 5, so
at the widest loadout any fixture reaches the multiplier is **0.994, not 1**.

The recordings survive anyway, and the reason is a property nobody had written down: **the two sets
are disjoint.** Every fixture that gains equipment ends its transition on a cinematic, a market walk
or a purchase — `act-transition.json` on a 1000 ms marker, both `purchase-exit-price` fixtures on
`heading` and `buying`. Every fixture that pins a kill duration (`one-kill`, `quest-completion`,
`random-star-special`, `xp-level-up`) is still in the starting loadout when it does.

This is the third time the reason for ADR 0008's safety has had to be corrected, and the first two
were corrected by argument. This one was found by asserting it: the guard test below was written to
claim the multiplier was the identity at the widest loadout, and it failed. The disjointness is now
pinned directly, because nothing else asserts it and a fixture that both gained an item and priced a
kill would invalidate the licence without any test noticing.

Every effect added since is inert at the **widest** loadout, not merely the starting one — none of
them reads Helm or Gauntlets — so none of them depends on the disjointness. Only ADR 0008's original
multiplier does. Prefer that stronger position for anything new.

**An effect that adds or skips a `random()` call needs the stronger reading of either form.** It is
not enough for the outcome to match at the fixture state; no draw may be spent. The guard must
short-circuit before the call. `clawback.ts` is the worked example — `clawback > 0 && rng.random(...)`,
never the other order.

### What this permits, concretely

- **Seven slots are unconditionally free**: Shield, Brassairts, Vambraces, Gambeson, Cuisses,
  Greaves, Sollerets. Never equipped in any fixture at any point, so an effect keyed to their base
  nouns cannot fire whatever it does — including changing draw counts.
- **Weapon is free too.** `Sharp Rock` matches no `WEAPONS` label, so no base resolves.
- **Helm is free except index 0** (`Lanyard`), **Gauntlets except index 4** (`Framework`),
  **Hauberk except index 2** (`Boilerplate`).
- **Named modifiers are unconditionally free.** No fixture equipment carries one; `-3 Boilerplate`
  has only an assessor's mark.
- **Stat-derived effects are free above 10.**
- **Spell-derived effects are free for the other 45 names, and for any spell at rank 2 or above.**
  A *count* or *sum-of-ranks* multiplier is **not** safe: two fixtures gain a spell mid-transition,
  so "inert at zero spells" stops holding partway through. This was spiked and confirmed before
  ADR 0008's rule was generalised.

## Consequences

**The rule is a test, not a judgement.** `src/__tests__/goldens/effectInertness.test.ts` asserts that
every engine effect derived from a loadout, a stat or a spell returns its identity at the fixture
state. A new effect that forgets fails there, naming itself, instead of failing as a diff in a
recording nobody can regenerate.

That test has to be maintained by hand — nothing can enumerate "every effect" automatically — so it
carries a list, and the list is the thing to add to. A guard that silently covers less than it claims
is the failure mode this whole ADR exists to avoid, so the test also asserts the fixture state it
checks against still matches the fixtures on disk.

**The recordings guard these effects at exactly one point: the point where they must do nothing.**
They cannot vouch for behaviour anywhere else. Unit tests remain the only guard for the rest, which
is unchanged from ADR 0008 and worth repeating because the wider licence makes it easier to forget.

**Structural inertness will get weaker, not stronger.** Every slot-keyed effect relying on "that slot
is never equipped" is relying on a property of a frozen artefact. That is stable — the fixtures
cannot change — but it means the licence cannot be extended by adding recordings, only reasoned about
against the fifteen that exist. Where an arithmetic identity is available, take it.

**ADR 0008's rule is superseded and, in one clause, corrected.** *"Inert at `loadoutQuality === 0`"*
describes the loadout every fixture starts in, and reading it as a statement about the whole
recording is what this ADR had to fix. It was also being read as the boundary of what the recordings
permit, which was costing real design options.

## Not included

Whether any given effect is a *good idea* is untouched here. This ADR says only what the recordings
permit. The separate question — whether an effect can be perceived and attributed by a player who
never acts — is the one ADR 0008's own consequences section raised and is still the harder bar.
