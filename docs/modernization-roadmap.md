# ProgQuest modernization roadmap

Status: accepted direction, incremental delivery  
Decision date: 2026-08-02  
Tracking epic: [#37](https://github.com/williamzujkowski/progress-quest-iii/issues/37)

## Outcome

Modernize ProgQuest without modernizing away Progress Quest. The shipped app must
reproduce the authoritative legacy mechanics, survive browser and storage failure,
fit desktop and mobile viewports, work offline, and remain understandable as a
small TypeScript application.

The detailed standards research and source links are in
[modern-web-standards-2026.md](research/modern-web-standards-2026.md).

## Product story

As a player, I can leave ProgQuest running in one desktop dashboard or on a small
phone, see the newest activity without the page growing, inspect long inventory
and loot lists in bounded panels, pause updates, safely resume after a reload, and
recover or export a privacy-safe diagnostic if something fails.

As a maintainer, I can replay a fixed seed against legacy-approved behavior,
inspect typed transition events, reproduce the exact deployed build, and run the
same named quality gates locally and in CI.

## Governing contracts

### Accuracy

- The recorded goldens in `src/__tests__/fixtures/goldens/` are the behavioural baseline. They were captured from the original web build while it was checked out here; that copy is gone and they cannot be re-recorded, so they are edited only as a deliberate decision about how the game behaves.
- A fixed seed and explicit input must produce the ordered trace those goldens record.
- RNG continuation, task order, progression, loot, currency, and activity text are
  observable behavior.
- Serialization changes require the repository's unanimous compatibility gate.

### Engine boundary

After trace coverage exists, the engine exposes one deep operation:

```ts
advanceGame(state, elapsedMs, rng) -> {
  state,
  records,          // Array<{ event, post }>
  remainingElapsedMs,
}
```

The operation is pure, owns transition ordering, never imports browser or React
code, does not mutate the input snapshot, and returns typed domain events. Zustand
only schedules elapsed time, stores the returned snapshot, and translates events
to presentation effects such as sound.

`records` rather than a bare `events`, and the difference is load-bearing rather
than cosmetic. Each record pairs an event with the presentation snapshot taken
immediately after it, because several things a reader needs are on the snapshot and
not on the event: `quest_completed` carries a description while its classification
lives on `post.completedQuest`, and the caseload tally exists only because that pair
survives together. A consumer handed events alone would have to reconstruct state it
was never given, which is the coupling this seam is drawn to prevent.

### Failure and diagnostics

- Expected storage, clipboard, audio, import, and service-worker failures return a
  typed result and truthful accessible feedback.
- Unexpected render and promise failures enter one themed recovery surface.
- Diagnostics are bounded in memory, redacted, local by default, and exported only
  by explicit user action. Game flavor activity is not an operational log.
- Invalid external data fails closed and never partially mutates an active session.

### Viewport and interaction

- Desktop uses a bounded dashboard whose independently growing regions scroll.
- The activity feed follows the newest event unless the player intentionally
  scrolls back; new events do not steal their reading position.
- Mobile reflows into a readable document with bounded panels instead of a scaled
  desktop canvas.
- Keyboard, reduced-motion, forced-colors, 320 px reflow, pause behavior, focus
  lifecycle, and target size meet the WCAG 2.2 AA contract.

### Delivery

- Local and CI gates have explicit commands for lint, types, unit tests, build,
  browser tests, accessibility, and dependency/security checks.
- The installed/offline `/progress-quest-iii/` build updates safely and has a tested
  rollback/unregister path.
- Deployment inputs are reproducible and the deployed artifact is attributable to
  its source commit and workflow.

## Domain vocabulary

| Term | Meaning |
| --- | --- |
| Session | The active character plus deterministic simulation continuation state. |
| Task | One timed unit of simulation work. Quest, plot, travel, and market work are task kinds. |
| Transition | One pure application of elapsed time and RNG to a session snapshot. |
| Event | An ordered domain fact emitted by a transition; presentation consumes but does not reinterpret it. |
| Checkpoint | A validated, versioned persistence snapshot sufficient to resume deterministically. |
| Activity | Player-facing flavor text derived from events; not a diagnostic record. |
| Diagnostic | A bounded, sanitized operational record describing an expected or unexpected failure. |

## Delivery sequence

### Phase 0 — make correctness observable

1. ~~Make the legacy baseline reproducible in fresh clones ([#38](https://github.com/williamzujkowski/progress-quest-iii/issues/38)).~~ Superseded: the baseline was retired in #381 and its behaviour now lives in self-owned goldens, so there is no longer a submodule for a fresh clone to reproduce.
2. Add deterministic legacy trace and invariant contracts ([#39](https://github.com/williamzujkowski/progress-quest-iii/issues/39)).
3. Fix the confirmed post-transition gold and immutable-inventory defects
   ([#40](https://github.com/williamzujkowski/progress-quest-iii/issues/40),
   [#41](https://github.com/williamzujkowski/progress-quest-iii/issues/41)).
4. Extract the approved pure transition seam ([#42](https://github.com/williamzujkowski/progress-quest-iii/issues/42)).
5. Restore legacy mechanics and save/RNG compatibility
   ([#15](https://github.com/williamzujkowski/progress-quest-iii/issues/15),
   [#2](https://github.com/williamzujkowski/progress-quest-iii/issues/2)).

### Phase 1 — preserve and explain a running session

1. Preserve elapsed time across throttling and multi-transition steps
   ([#44](https://github.com/williamzujkowski/progress-quest-iii/issues/44)).
2. Checkpoint and restore the active session safely
   ([#43](https://github.com/williamzujkowski/progress-quest-iii/issues/43)).
3. Add recovery and privacy-safe diagnostic export
   ([#45](https://github.com/williamzujkowski/progress-quest-iii/issues/45)).
4. Complete recoverable storage, clipboard, and audio paths
   ([#28](https://github.com/williamzujkowski/progress-quest-iii/issues/28),
   [#21](https://github.com/williamzujkowski/progress-quest-iii/issues/21)).

### Phase 2 — complete the modern web contract

1. Ship and test installable/offline PWA behavior
   ([#4](https://github.com/williamzujkowski/progress-quest-iii/issues/4)).
2. Complete WCAG 2.2 AA behavior and stable activity announcements
   ([#25](https://github.com/williamzujkowski/progress-quest-iii/issues/25),
   [#48](https://github.com/williamzujkowski/progress-quest-iii/issues/48)).
3. Expand actionable browser coverage
   ([#26](https://github.com/williamzujkowski/progress-quest-iii/issues/26)).
4. Harden supply chain and deployment provenance
   ([#46](https://github.com/williamzujkowski/progress-quest-iii/issues/46)).
5. Make the quality contract explicit and Nexus-compatible
   ([#47](https://github.com/williamzujkowski/progress-quest-iii/issues/47)).

### Phase 3 — measured cleanup

- Add performance budgets from a production-preview baseline before optimizing.
- Tighten indexed and optional TypeScript checks incrementally.
- Remove confirmed vestigial assets and consolidate static styles while completing
  PWA/CSP work, rather than through an unrelated rewrite.

## Architecture decision record

Nexus Agents quick consensus evaluated the phase order and exact engine seam with a
supermajority threshold on 2026-08-02. The software-architecture and security
voters both approved at 94% confidence; the scope-steward adapter exhausted three
60-second MCP timeouts. Nexus reported the proposal **approved** with two approvals,
no rejections, and the failed voter recorded as an abstention. The degraded voter
is retained here rather than presented as unanimous consensus.

Approved proposal: establish a legacy trace first, then add the single pure
`advanceGame` boundary; follow with diagnostics, PWA, WCAG, and supply-chain work;
reject speculative telemetry, event buses, workers, package splits, and framework
churn.

## Definition of done

- A fixed seed reproduces a legacy-approved multi-step trace.
- Corrupt saves and unavailable browser capabilities cannot silently destroy the
  active session.
- Reload resumes deterministic progress; throttling does not discard elapsed time.
- Unexpected failures yield an accessible recovery screen and a bounded, redacted
  user-exportable diagnostic report.
- The deployed app installs, starts offline after one visit, and updates safely.
- Desktop and mobile layouts keep growing content bounded and usable.
- WCAG 2.2 AA, supported-browser, security, golden, and artifact gates pass.
