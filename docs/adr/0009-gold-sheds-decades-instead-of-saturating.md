# Gold sheds decades instead of saturating

Status: accepted
Decision date: 2026-08-08

## Context

Gold was capped: `Math.min(MAX_PERSISTED_GOLD, gold + earned)`. At a trillion the figure stopped
moving, and a player who reached it went on selling loot forever while being told, every time, that
they had earned nothing.

That is a cap behaving as an ending. The game does not end there — nothing else does — so the
number simply stopped being part of it.

The owner asked for escalation handled by appending zeros past thresholds rather than by computing
on ever-larger values, and chose gold as the first quantity to adopt it.

## Decision

Gold carries an exact figure plus a count of decades it has shed. When the figure reaches the cap
it is divided by ten and the count goes up, so:

- the stored value stays under the cap, exact, and safe to add to
- the balance keeps growing, without the engine ever adding to a number it cannot represent

`GoldDecades` is optional in the schema and absent from every save written before this, so those
read back as the numbers they always were. Nothing is migrated.

The arithmetic lives in `src/engine/gold.ts` rather than in a general mantissa-and-decade carrier of
the kind ADR 0008 deferred under **Not included**, because gold has a constraint such a carrier does
not: the figure must stay a whole number of coins. A carrier that normalised its mantissa to
`[1, 10)` would turn a balance into a decimal. No such carrier exists yet, so this records why gold
would not have used one rather than a comparison against shipped code.

**Spending cannot shed decades back.** A purchase is priced in ordinary coins, so a player whose
balance has shed decades can always afford one, and the count never falls. This is deliberate: no
mechanic here should be able to take back an order of magnitude a player has reached, and a spend
path that could would make shopping a way to lose progress.

## Consequences

**Earnings are reported from what was asked for, not from the change in the balance.** Once a decade
is shed the stored figure falls even though the player gained, so subtracting balances reports a
loss at exactly the moment the player crosses a threshold. `goldEarnedBetween` exists for that one
reason and is worth keeping when this code is next touched.

**One existing test asserted the old contract and was deliberately changed.** It required that a
sale at the cap pay nothing and leave the figure at `MAX_PERSISTED_GOLD`. That is precisely the
behaviour being removed, so the test now asserts the replacement — the figure falls below the cap,
some decades are shed, and the sale still pays. Both halves are asserted, because either alone
passes on a bug: a figure under the cap could mean gold was lost, and a decade could be shed without
the sale paying anything.

**The recorded goldens are untouched.** None of them sells at the cap, so none reaches this path.
That is worth stating rather than presenting 95 passing assertions as evidence about a change they
never execute.

**Only gold adopts this.** Experience, stats and encumbrance keep their existing limits. Whether
they should follow is a separate decision, deliberately not taken here.
