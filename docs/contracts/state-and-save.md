# ProgQuest boundary contracts

These are the deliberately small, executable contracts at module seams. TypeScript remains the contract inside trusted engine code; Zod is reserved for untrusted browser storage and imported save text.

## Engine/UI dependency direction

`src/engine/` is the pure game-rules module. It may depend on typed tables in `src/data/` and sibling engine modules, but never on React, Zustand, UI modules, state/browser adapters, PWA wiring, browser globals, or timers. The transition seam accepts elapsed time and `RandomGenerator` explicitly, then returns state plus events instead of performing browser effects. Standalone name and character helpers retain the documented optional clock defaults for callers that do not request replay.

`src/state/` supplies the browser adapters for the engine/UI seam: the store invokes transitions, persistence validates untrusted bytes, and audio/diagnostics translate returned events. `src/components/` depends inward on that seam and may call pure engine queries; dependency in the opposite direction is forbidden.

Verified by: the engine-specific Oxlint overrides in `.oxlintrc.json` and the ordinary lint gate.

## Persisted character

Owner: `src/state/schemas.ts`

- The unversioned modern character-sheet shape is the **PQW v0** compatibility profile. Every object boundary is strict, so unknown fields and unrecognized version markers fail closed instead of being silently discarded.
- PQW v0 may include an optional, narrow pending Sequence queue so a prologue or cinematic can resume through PQW, roster, and checkpoint boundaries. Absence remains valid and means no pending sequence; the field is omitted when empty.
- Pending entries permit only prologue, cinematic, compact nemesis replay cursors, and final Act-marker tasks. Display tasks have zero elapsed time and no loot; every nonempty queue has exactly one final marker, matches its active Act phase, and contains at most 100 entries.
- Nemesis cursors retain the canonical next-round index, narration state, and replay entropy in constant queue space. The first 95 rounds remain materialized; exceptionally long high-Act struggles then evaluate one canonical round per completed task without truncating mechanics, unbounded synchronous preparation, or saves that grow with Act number.
- This additive reader change is backward-compatible with existing saves but older strict builds cannot read a newer save captured mid-sequence. The unanimous #150 serialization vote accepted that one-way compatibility window to avoid silently discarding continuation state.
- Imported and roster data is parsed as `unknown` and must satisfy `characterSheetSchema` before state mutation.
- Strings, collections, quantities, currency, levels, and progress values have explicit upper bounds.
- Prime stats are positive integers; HP/MP maxima are positive numbers. Quest/plot progress may equal but never exceed its positive maximum, and task elapsed time may equal but never exceed its duration.
- Inventory identities are exact and case-sensitive. One empty identity remains valid for established reward parity, but duplicate identities are rejected without normalization.
- A save import larger than 1 MB is rejected before base64 decoding.
- A roster is rejected and preserved in full if any record is invalid; partial recovery must never make the next write destructive.
- Character names contain 1–120 UTF-16 code units. Exact names are case-sensitive roster identities, and a later explicit save replaces the prior entry with that identity.
- Prototype-like character names remain ordinary own keys. Existing object-shaped roster JSON is rehydrated into a null-prototype record without changing the persisted shape.
- Any further format expansion must use a versioned envelope and retain a PQW v0 reader. Classic tuple-shaped PQW migration remains tracked by #2; it must not be parsed as modern v0.

Verified by: `src/__tests__/state/saveManager.test.ts`.

## Transition closure

Owner: `src/engine/transition.ts`; shared limits: `src/data/limits.ts`

- Every schema-accepted session remains schema-valid after an engine transition.
- Increasing numeric values saturate at the existing persistence ceiling. This preserves PQW v0 and checkpoint compatibility without admitting `Infinity`, lowering accepted input limits, or changing ordinary legacy progression.
- Level, stats, spell levels, inventory quantities, completed-task count, and adventure elapsed use the shared finite limit, `MAX_PERSISTED_VALUE` (1e9). Gold does not: it saturates at `MAX_PERSISTED_GOLD` (1e12), a thousand times higher. Anything adding new saturating logic must pick the right one of the two. Quest and plot progress remain capped by their accepted per-track maxima.
- Inventory and spell collections do not append beyond the existing 5,000-row limit. Existing rows may still advance until their value ceiling.
- Saturation consumes the same RNG calls as the corresponding ordinary transition. A gain event or reward effect is emitted only when persisted state actually changes.
- Monster-task perturbation retains the exact roll count the original build made, through the last level with a finite progression interval, then reuses that bounded roll budget for higher accepted levels.
- Every completed Act advances to the next accepted Act, resets duration to `min(1,000,000,000, 3600 * (1 + 5 * nextAct))`, and—after Act I—grants one canonical item roll plus one equipment roll at the hero's current level. At the persistence ceiling the numeric Act remains saturated, but later transitions, rewards, and saves continue.
- Inter-Act nemesis loops consume at most the 95 materialized-round budget synchronously. Longer loops persist a compact replay cursor tied to the current Act and checkpoint RNG state, keeping every later narration step and canonical post-loop continuation while allowing Acts to scale to the persistence ceiling.
- Ordinary legacy-sized cinematics consume RNG in the canonical eager order. The bounded synthetic-high-Act exception changes only *when* entropy after round 95 is consumed: one round is replayed when its narration task begins instead of materializing an enormous queue up front. Mid-fight RNG state therefore intentionally differs from an unbounded legacy queue; exact narration, per-round draws, and post-fight continuation reconverge when the cursor finishes.
- A kill that both drops random loot and crosses the plot threshold resolves its loot *between*
  the cinematic's opening and its remainder. The original ran `InterplotCinematic` whole and
  resolved the loot afterwards. This is a deliberate divergence in draw order, not an oversight:
  the two agree on the observable surface — the same item is awarded and the same narration queue
  is produced — and the golden `random-star-interplot.json`, recorded from that original build,
  is replayed on every `npm test` to keep that true. The clause above about canonical eager order
  does not extend to this interaction.
- Market arrival schedules one ordered inventory stack per one-second selling task. Ordinary stacks pay `quantity * level`; names containing ` of ` apply the two canonical `RandomLow` multipliers. Gold and sale events report only the amount actually credited at the persistence ceiling. Market exit buys for five seconds only when Gold is strictly greater than the level price; equality takes the four-second route back to the killing fields.

Verified by: `src/__tests__/engine/actSoak.test.ts`, `src/__tests__/engine/transition.test.ts`, `src/__tests__/engine/reward.test.ts`, and `src/__tests__/goldens/transitionParity.test.ts`.

## Session entry

Owner: `src/state/gameStore.ts`

`StartSessionRequest` is the single UI-to-state command:

- `creation` supplies name, race, class, an explicit deterministic seed, and optionally an accepted stat roll.
- `import` and `roster` supply a schema-validated character sheet.
- The action replaces character, RNG, activity log, and pause state atomically.
- `restoreSession` is the sole full-session replacement seam for a validated checkpoint and restores exact RNG continuation, progression, pause, and bounded activity state atomically.
- Imported objects are defensively copied.
- Equal creation inputs and seed replay the same character and RNG state.

Verified by: `src/__tests__/state/gameStore.test.ts` and `e2e/app.spec.ts`.

## Active-session checkpoint

Owner: `src/state/sessionCheckpoint.ts`; schema owner: `src/state/schemas.ts`

- The active session uses a strict `{ schemaVersion: 1, session }` envelope under `progquest_active_session_v1`; it never changes the roster or PQW v0 formats.
- The checkpoint contains only the character sheet, exact Alea continuation, progression counters, bounded pending scheduler elapsed time, pause state, the wall-clock instant it was written, and the newest 50 activity strings. Diagnostics, preferences and functions are excluded.
- `savedAtMs` is that wall-clock instant, and it is what makes offline catch-up possible: on load, `creditClosedElapsed` turns `now - savedAtMs` into engine-spendable milliseconds, capped at `MAX_PENDING_ELAPSED_MS`, so a closed tab resumes where the clock would have taken it. Guarded against a missing field, a rolled-back clock, a non-finite clock and a paused session; the double-credit window is closed by re-flushing with a fresh stamp immediately after restore. Verified by: `closedElapsed.test.ts`, `sessionCheckpoint.test.ts`.
  - This bullet said the opposite for some time — that wall-clock timestamps and offline catch-up were *excluded* — while both had been in the envelope and the schema throughout. It is recorded here rather than quietly corrected because the sentence read as a guarantee: someone deciding whether the save carries a timestamp, or whether the game advances while closed, would have come away wrong on both.
- Activity rows receive monotonic runtime identities after the pure engine transition. Checkpoint v1 deliberately keeps its compatible `log: string[]`; hydration reconstructs identities before React mounts without consuming gameplay RNG.
- Pending scheduler elapsed time preserves deterministic continuation when a tick reaches the 100-task work budget. New captures always write the finite nonnegative value; legacy v1 checkpoints that omit it normalize to zero. Older strict builds reject newly written checkpoints containing the field, a unanimously accepted one-way compatibility window for #164; portable PQW and roster formats are unchanged.
- Formatted activity strings are truncated to the checkpoint description limit after presentation prefixes are applied; domain descriptions remain unchanged.
- Hydration validates the entire envelope before atomically replacing session state and occurs before React rendering and the game clock.
- Routine mutations coalesce to at most one write per second. A dirty session flushes when the document becomes hidden and on `pagehide`.
- Before replacing a valid primary checkpoint, its exact bytes rotate to `progquest_active_session_lkg_v1`. Invalid or unavailable reads block automatic writes; a validated last-known-good session may restore in memory, but only the explicit repair action may replace unreadable primary bytes.
- A cross-tab primary change blocks this tab's writer. This is conservative loss prevention, not a locking or merge protocol.
- Expected failures expose persistent accessible feedback and redacted diagnostics; raw checkpoint data and character/activity content never enter diagnostics.

Verified by: `src/__tests__/state/sessionCheckpoint.test.ts` and the active-session scenarios in `e2e/app.spec.ts`.

## Save import outcome

Owner: `src/state/saveManager.ts`

`decodePQWSave` returns a discriminated `SaveResult`, with distinct error codes for oversized input, malformed base64, invalid JSON, and invalid schema. Expected user-correctable failures are data, not exceptions. The UI starts a session only from an `ok` result, so a failed import preserves the active session.

## Entropy

Owner: `src/engine/prng.ts`

- `PRNGSeed` is `string | number`; no untyped seed inputs are accepted.
- Existing `RandomGenerator` is the only random abstraction.
- Session creation passes its explicit UI roll seed instead of reading the clock.
- Optional clock defaults remain only for standalone engine helpers whose callers do not request replay.

## Quality gates

After dependencies and the Chromium and WebKit Playwright browsers are installed,
Nexus installation verification is **not** part of it. `npm run agents:verify` runs as its own
step in `ci.yml`, deliberately outside the gate, because `quality` is what the deploy job runs in
the same job that builds and uploads the Pages artifact — and `nexus-agents` is half the lockfile.
`scripts/test-deploy-tooling-boundary.mjs` keeps that separation true. This paragraph claimed the
opposite while `AGENTS.md` stated the decision and a gate enforced it.

`npm run quality` is the canonical local, CI, and deployment gate. It runs
warning-clean modern lint, typecheck, unit and golden-master tests under enforced
coverage floors, dependency
audit at moderate severity plus registry signature verification, Playwright E2E,
and production PWA tests. There is no standalone build step: the production build
runs inside `test:pwa`, which is last, so `test:e2e` exercises the Vite dev server
and only `test:pwa` exercises the shipped bundle.
GitHub Actions workflows additionally pass checksum-pinned actionlint v1.7.12;
its negative contract covers syntax, expressions, local action inputs, and
unsafe untrusted interpolation without optional ShellCheck or Pyflakes. The
launcher requires the standard `tar` executable included on supported developer
systems and GitHub-hosted runners.
The Nexus verifier treats missing hosted-runner CLI authentication as a warning
while still failing hard installation/configuration errors. Nexus's generic
quality tool remains bypassed until upstream issue #4355 stops assuming ESLint
and pnpm instead of repository-declared scripts.

Run the trait-table structure checks and the recorded transition goldens separately with `npm run test:goldens`.

PR handoff gates: independent Claude standards/spec/security review through `.agents/skills/code-review` and `git diff --check`. Adapter-backed Nexus review remains bypassed until upstream issues #4350 and #4351 are fixed and verified locally; `consensus_vote` is exempt while it routes to Claude, per the adapter status note in AGENTS.md.
