# No local language model for the chatter

Status: accepted
Decision date: 2026-08-09

## Context

The backlog carried a research spike: an optional tiny language model running entirely in the
browser, to give the guild and world channels more variation without a server, an account, or a
dependency on AI availability. The spike set its own bar, and it is the right one:

> Consider a hybrid authored generator before an LLM… **The spike must demonstrate that an LLM
> materially improves perceived variety and character consistency over that baseline.**

That baseline has since been built. This is the report, and the answer is no.

## The baseline, measured

Six heroes, 4 000 ticks each, driven through the real store:

| | |
|---|---|
| lines observed | 2 408 |
| **distinct lines** | **770** |
| distinct sentence shapes (figures and names masked) | **640** |
| distinct speakers | 9 |

Distinct lines by scene kind: market 384, ambient 183, loot 117, zone 29, quest 20, level 20,
equipment 10, milestone 9.

The whole authored corpus behind that is **145 ambient lines across 13 banks in 28 KB**, plus the
scene banks inside a 48 KB projection. Variety comes from composition rather than volume: per-hero
persona draws, `stableIndex` variant selection, running bits that advance across a session, and
interpolation of item names, gold, act ordinals and quest targets from the engine.

## What a model would cost

Researched against primary sources — model card blob sizes, runtime package metadata, MDN
browser-compat data, and vendor documentation.

**Download.** The smallest figure with shipped-product evidence is **369 MB**: Mozilla ships
wllama + SmolLM2-360M-Instruct Q8_0 for Firefox Link Preview, and reports the first key point in
about four seconds. The smallest with any primary evidence is **~203 MB** of weights for the same
model built for WebLLM/WebGPU, plus a 5.7 MB model library. Nothing below that has a source
measuring output quality, and Google's own note on the 270M class is that it "is not designed for
complex conversational use cases."

**Against a 1.1 MB application.** The model is between **185× and 335× the entire game**, main
bundle, fonts, icons and service worker included.

Three further constraints, each independently blocking:

- **The CSP would have to be widened.** Every browser runtime is WebAssembly-based, including the
  WebGPU paths, and WebAssembly is blocked unless `script-src` names `'wasm-unsafe-eval'`. This
  application's policy is `default-src 'none'; script-src 'self'` and has never granted it.
- **Self-hosting is required and is near the platform ceiling.** `connect-src 'self'` means the
  weights must be same-origin, so they ship from GitHub Pages: published sites may be no larger
  than 1 GB with a soft 100 GB/month bandwidth limit, which at ~200 MB per cold download is roughly
  **480 first visits a month** before the limit bites. Apache-2.0 models permit the redistribution;
  Gemma and Llama attach pass-through obligations that would have to be carried in the notices.
- **iOS is unresolved.** WebGPU ships in Safari 26 across iOS, but the failure reports are specific
  and open: a 3B model downloads fully and then the tab dies with no console output; an
  initialisation failure on `maxStorageBuffersPerShaderStage` requesting 10 against the spec default
  of 8; a transformers.js crash open since March 2025. No Apple-published per-tab ceiling exists, so
  any figure quoted for iOS is unverified.

## The decision, and the reason that is not about cost

**No local language model. The authored generator stays the only source of chatter.**

The download, the CSP and the platform ceilings are all real, and none of them is the reason.

**Every guard this project has over its own text depends on the text being finite and
enumerable.** The forbidden-names scan reads the shipped tables. The ambient banks are asserted to
state no figures. The dated register is asserted to address nobody. The service record is asserted
not to claim an effect the engine does not apply. Those tests work because a person can hold the
whole corpus and a test can iterate it.

That is not a theoretical benefit. In one session of review, five accuracy defects were found in
**authored** text, each written by someone who believed it was true when they wrote it:

- the service record denied an equipment effect ADR 0008 had added, while the world console
  displayed that effect on the same screen
- a citation asserted an item had been "superseded", which the exhibit ledger cannot record
- another asserted specimens were "held exactly once", which the specimen log explicitly does not
  count
- the record wrote "filed against 1 times"
- it claimed "one name recurs above the others" when there was one name and no others

Each was found by reading a sentence against the code behind it, and each was fixed once, in a bank
of 145 lines, with a test that will not let it return. A generator writes new sentences about game
state on every draw. It would reproduce this class of error continuously, at a rate no reviewer can
sample, and **not one of the existing guards could be pointed at it** — there is nothing to
enumerate.

Constrained decoding narrows the shape of the output, not its claims. A model can be forced to emit
a sentence; it cannot be forced to emit a *true* one about a mechanic this engine models and the
model does not.

The determinism contract makes the same point structurally. Every projection here is asserted
byte-stable under spies that **throw** on `Math.random` and `Date.now`. The chatter is a pure
function of game state, which is why a recorded session replays identically and why the goldens can
police the engine at all. A generator cannot live inside that contract, and moving the chatter
outside it would give up a property the whole test suite rests on to buy variation the measurements
above say is not scarce.

## Consequences

- The spike is closed as **no-ship**. It was the right question and the answer is durable — the
  numbers would have to move by two orders of magnitude to change it.
- **Where the variety budget should go instead**: deepening the authored banks costs kilobytes and
  keeps every guard. The last such change added four loot-drama exchanges to an existing bank and
  moved ambient reuse from 2.5× to 2.3× without touching a lane weight.
- Nothing here forecloses reconsidering if a model were ever to become part of the browser rather
  than part of the payload — a platform-provided API removes the download, the CSP change and the
  self-hosting entirely. It would not remove the accuracy argument, which is the one that decided
  this.

## What would reopen it

A change in the argument above, not in the market. Concretely: a browser-native generation API with
no download, **plus** a way to hold generated text to the same enumerable guards the authored banks
answer to. The second is the hard one and no vendor is working on it.
