# The register is dated by act, and kept global

Status: accepted
Decision date: 2026-08-08

## Context

The backlog's history epic concluded that the missing primitive is a **date**, not a log. Every
existing ledger records *what* and *how many* and none records *when*, and that single gap is what
made a durable event history look necessary — a history that was measured at 95.3 MB per 100 000
tasks and rejected.

Two questions had to be settled before writing anything down.

### What a date is here

There is no wall clock available. The determinism contract asserts every projection byte-stable
under spies that **throw** on `Date.now`, so a real timestamp cannot enter the ledgers at all
without breaking a guarantee the whole test suite rests on. It would also be the wrong unit: a game
whose premise is that nobody is watching has no business recording what o'clock it was.

The act ordinal is already the game's own unit of elapsed narrative. It is on
`GamePresentationSnapshot` as `post.act`, it is monotone, it is small, and it is the only figure the
player already reads as "how far along". It is also *coarse* in the way this register wants to be:
an act is long, so "first recorded in Act 2" cannot be turned into a rate.

### Global or per-character

This was the genuine fork, and the epic flagged it as the owner's call.

The existing ledgers are global on purpose — `commendations.ts` records the reason directly:
*"a new character starting over must not erase the record."* But an act ordinal reads differently
from a count. "Filed seven times" is true of the institution no matter who filed them. "Last
recorded in Act 7" beside a hero who has never left Act 1 is true of the institution and false of
the hero, and the difference is visible in a way a count's is not.

## Decision

**The register is dated by act ordinal, stored beside the existing counts, and kept global.**

Global, for three reasons.

1. **Consistency beats a local fix.** The counts are already global. A per-character date beside a
   global count would produce a row where the two halves are about different subjects, which is
   worse than either alone.
2. **Per-character requires a character identity the ledgers do not have.** Keying by
   `Traits.Name` makes two characters with the same name one character, and there is no id. Adding
   one is a checkpoint schema change, which is precisely the envelope these ledgers were kept out of.
3. **The confusion is the content.** An archive citing an act ordinal that has nothing to do with
   the reader is exactly the institution outliving the hero — the register that this game is about.

That third reason only holds if the phrasing carries it, so it is a constraint rather than a
consolation:

> **No dated line may address the hero, in the second person or otherwise.**
> *"The file last records this in Act 7"*, never *"you last fought this in Act 7"*.

The first is true. The second is a claim about a person who may never have been there. This is
tested, not merely written down.

## Consequences

- `first` and `last` act ordinals are optional and defaulted, so every ledger already on disk keeps
  loading and nothing needs a migration.
- Bounded by the same `MAX_TRACKED_TARGETS` cap the counts already carry, on both the read and the
  merge path. Worst case is around 2 KB against a ~5 MB budget.
- `first` is written once and never moved; `last` moves forward only. Both are therefore monotone,
  which keeps the register a statement about the past rather than a status.
- Nothing feeds back into the simulation, so the RNG continuation and save compatibility are
  untouched, exactly as with the counts.
- The named eras and the service record in the same epic both become possible; they were blocked on
  this and on nothing else.

## Reversal

If the register should be per-character after all, the change is: add a character id to the
checkpoint schema, key the dated maps by it, and drop the no-second-person constraint — at which
point the lines may address the hero, because they would then be true of them. That is a checkpoint
schema change and a migration, which is the cost this decision is declining to pay now rather than
one it forecloses.
