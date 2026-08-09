# Content provenance and license boundaries

Last audited: 2026-08-08. This is a conservative engineering inventory, not legal advice.

## Practical boundary

The root MIT license applies only where William Zujkowski or another contributor has authority to grant it. It does not convert third-party material, inherited Progress Quest expression, fonts, or dependencies to MIT.

Do not import code, prose, data, screenshots, art, or assets from unofficial Progress Quest sequels. High-level ideas may be independently designed, but implementations must be grounded in this repository's specifications and its own recorded behavioural goldens.

## Material inventory

| Material | Location | Origin/evidence | Status |
| --- | --- | --- | --- |
| Modern application implementation | `src/components/`, `src/state/`, modern portions of `src/engine/`, `src/App.*`, `src/index.css`, `src/main.tsx`, `src/pwa.ts`, scripts and configuration | Project commit history; authored for this repository | Root MIT applies only to contributor-owned original expression. |
| Alea deterministic PRNG | `src/engine/prng.ts` | TypeScript adaptation of Johannes Baagøe's Alea/Mash algorithm | MIT, copyright 2010 Johannes Baagøe; notice retained in source and the deployed notices file. |
| Project documentation and tests | `README.md`, `AGENTS.md`, `.agents/`, `docs/`, `e2e/`, `e2e-pwa/`, `src/__tests__/` | Project commit history and cited research sources | Project-owned original expression is MIT; quotations and linked third-party material retain source rights. |
| Simulated social cast and authored chatter | `src/data/socialCatalog.ts`, `src/data/socialAmbient.ts`, `src/data/socialGrats.ts`, `src/data/socialDkp.ts`, `src/state/socialProjection.ts` | Project-owned original names, persona profiles, and deterministic dialogue authored for this repository; external games and comedy research supplied only abstract techniques. Half the cast is deliberately named like software rather than like people; every such handle is invented, and real researchers, labs, and model names are rejected by the catalogue test alongside the researched-source list | Root MIT applies to contributor-owned original expression. Catalog tests reject researched source names, links, markup, bidirectional controls, unbounded copy, and unsupported mechanical claims. |
| Classic game data, vocabulary, and flavour text | Primarily `src/data/traits.ts` | Every vocabulary table has been rewritten as original work — races and classes, the equipment and loot morphemes, the adversaries and their drops, and the spell book. Each rewrite was positional: an entry kept the index and numeric fields of the one it replaced, so the tables' *ordering and numbers* remain derived from Eric Fredricksen's JavaScript web port even though the words are not. The dead `MON_MODS` table was deleted rather than rewritten. | 45 strings still match the legacy tables, and they are functional rather than authored: the eight stat names, the eleven equipment slots (`Hauberk`, `Vambraces`, `Sollerets` — also save-format keys, so they cannot change without breaking every existing character), nine honorifics, and about a dozen names kept deliberately because they already fitted the register. No authored joke of Fredricksen's remains in the data. |
| Engine implementation | `src/engine/` | Reimplemented against `main.js` and `newguy.js`, the two legacy files that carry `Copyright (c)2002-2010 Eric Fredricksen … all rights reserved`. Measured against them at the pinned revision: **1 of 68** function names identical (`toRoman`), 7 matching case-insensitively, and **0 of 52** legacy comments appearing verbatim. Data representation differs structurally — the legacy engine stores a monster as the string `"Grid Bug|1|carapace"` and splits it at each use, we store `{ name, level, item }`; it threads a global mutable `game` object, we pass snapshots and an explicit RNG through pure functions. | The distinction the older wording blurred: **mechanics are reproduced deliberately, expression is independent.** The behaviour must match — the recorded goldens pin an exact RNG call order, so this implementation performs the same operations in the same sequence, and that is the project's purpose rather than an accident. Copyright protects expression rather than mechanics, so those two halves carry very different weight and only one of them describes copied material. This is an engineering measurement, not a legal conclusion. |
| Recorded behavioural goldens | `src/__tests__/fixtures/goldens/` | Captured output of Eric Fredricksen's JavaScript web port, recorded while it was checked out here, one completed task per file | Progress Quest-derived observed behaviour, not copied source. Kept as the regression baseline for `src/engine/`. Same reuse caution as the row above; they cannot be re-recorded here. |
| Legacy web reference (retired) | Formerly the `pq-web-src/` git submodule, pinned at commit `3e9431b38cb54647530197501a29b8cce6c9f4f4` from `https://bitbucket.org/grumdrig/pq-web.git` | Eric Fredricksen's JavaScript web port; `main.js` and `newguy.js` contain all-rights-reserved headers | No longer present. The project is a spiritual successor rather than a port, and neither the test suite nor CI fetches or executes that code any more. Recorded here because the two rows above descend from it and repository-level permission for the web port was never explicit. Do not re-add it or copy its assets into the modern UI. |
| Original Progress Quest license evidence | Official `https://progressquest.com/dl.php` links `https://progressquest.com/license.txt` and says the agreement applies before downloading any version | MIT-style grant, copyright 2002–2004 Eric Fredricksen | Strong evidence of permissive terms for Progress Quest, but the project has not established whether it supersedes the later web-port headers. Owner confirmation or qualified legal review remains required before representing the ambiguity as resolved. |
| Runtime libraries and themes | Direct production dependencies in `package.json`; exact versions/integrity in `package-lock.json` | Upstream packages | MIT, ISC, and package-specific terms; see `public/THIRD_PARTY_NOTICES.txt`. Both iTerm-derived themes are traced to their authoring commit and to the collection's CREDITS.md: Green Phosphor CRT is PoshPalette's (MIT), and Keys Ocean Sunset HC was original work by its own contributor. |
| Bundled webfonts | Production WOFF2 files built from `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` | Fontsource packages 5.3.0; package metadata and license files | SIL Open Font License 1.1. Copyright and license text are retained in `public/THIRD_PARTY_NOTICES.txt`, which ships with the PWA shell. |
| Design tokens | `remarque-tokens` custom properties, imported by `src/index.css` as `remarque-tokens/core` | `remarque-tokens` 0.26.0, MIT, copyright 2026 William Zujkowski; upstream at `williamzujkowski/remarque` | Distributed material, not build-time tooling: the stylesheet's custom properties are emitted into the production CSS bundle. Separately licensed from this repository even though the author is the same person — the root MIT notice here is not the grant that covers it, and its own LICENSE travels with the package. Attribution retained in `public/THIRD_PARTY_NOTICES.txt`, which ships with the PWA shell. |
| Application icons | `public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png` | Original artwork belonging to this project. The SVG is the source; both PNGs are rasterised from it and are regenerated from that one file rather than drawn separately. | No third-party permission is relied upon for the application's own identity. The Vite starter mark these replaced is gone, as are the unreferenced `icons.svg` sprite and `hero.png` that carried social-service marks. |
| Generated production files | `public/sw.js` template and ignored `dist/` outputs | Project-authored service-worker template; `scripts/generate-service-worker.mjs` materializes `dist/sw.js` from the production artifact set | Generated files inherit the applicable terms of their inputs. The tracked `public/sw.js` template is not itself generated or replaced. |
| Developer and test tooling | Direct dev dependencies in `package.json`, workflows, Nexus config, Playwright browsers downloaded outside Git | Upstream packages and project configuration | Not shipped as application runtime code. Direct license identifiers are inventoried below; transitive versions and declared licenses remain locked in `package-lock.json`. |
| Imported agent guidance | Files under `.agents/skills/` | mattpocock/skills (MIT), DietrichGebert/ponytail (MIT), Anthropic frontend-design (Apache-2.0), vercel-labs/web-interface-guidelines (MIT), vercel-labs/agent-skills | Inventoried per skill in [`.agents/skills/PROVENANCE.md`](../.agents/skills/PROVENANCE.md), with the audited upstream revision, retained license text, and whether the local copy still matches. Two entries remain unresolved and are recorded as such there: `react-best-practices`, whose upstream publishes no LICENSE file, and `writing-great-skills`, whose origin is unestablished. |

The retired submodule also contained separately attributed jQuery, JSON2, and V8
shell code plus binary art. None of it was ever copied into this repository or
the Pages bundle, and with the submodule removed none of it is fetched at all.

### How the engine measurement was taken

Reproducible, so the claim above is checkable rather than asserted. The legacy files are public at
the revision this project recorded from:

- <https://bitbucket.org/grumdrig/pq-web/src/3e9431b38cb54647530197501a29b8cce6c9f4f4/main.js>
- <https://bitbucket.org/grumdrig/pq-web/src/3e9431b38cb54647530197501a29b8cce6c9f4f4/newguy.js>
- <https://bitbucket.org/grumdrig/pq-web/src/3e9431b38cb54647530197501a29b8cce6c9f4f4/config.js>

Compare declared function names, and search this repository for each legacy comment body. One name
matches; no comment does.

Worth recording alongside it, because it bears on the unresolved question below rather than on this
one: `main.js` and `newguy.js` carry all-rights-reserved headers, and **`config.js` carries no
copyright header at all**. Every data table came from `config.js`. The two engine files are the ones
with restrictive notices, and they are the ones this project reimplemented rather than copied.

## Direct dependency inventory

Production dependencies at the audit commit:

| Package | Version | Declared license |
| --- | ---: | --- |
| `@fontsource-variable/inter` | 5.3.0 | OFL-1.1 |
| `@fontsource-variable/jetbrains-mono` | 5.3.0 | OFL-1.1 |
| `@williamzujkowski/oklch-terminal-themes` | 0.7.0 | MIT |
| `remarque-tokens` | 0.26.0 | MIT |
| `@fontsource-variable/newsreader` | 5.3.0 | SIL Open Font License 1.1; the masthead face, shipped like the other two |
| `lucide-react` | 1.28.0 | ISC, with upstream Feather-derived icons under MIT |
| `react`, `react-dom` (and bundled `scheduler`) | 19.2.8 (scheduler 0.27.0) | MIT |
| `zod` | 4.4.3 | MIT |
| `zustand` | 5.0.14 | MIT |

Direct development dependencies declare MIT except: `@axe-core/playwright` (MPL-2.0), `@playwright/test` (Apache-2.0), `typescript` (Apache-2.0), and the runtime packages listed above when reused by tests. Exact versions and the declarations for every transitive package are recorded in `package-lock.json`; a package declaration is evidence to review, not a substitute for its license text.

The installed terminal-theme package also declares `apca-w3` and `culori` as
runtime dependencies. The audited production bundle contains no APCA or
`colorparsley` identifiers, consistent with tree-shaking from the `COLOR_KEYS`
import, but absence from one minified bundle is not a durable package boundary.
Upstream cleanup is tracked by
`williamzujkowski/oklch-terminal-themes#169`; downstream adoption and bundle
proof are tracked by #178.

The iTerm2-Color-Schemes collection license says each individual theme retains
its author's copyright and license, so the collection's MIT grant does not by
itself cover the two schemes imported here. Both were traced to the commit that
introduced them upstream and to the attribution the collection's own CREDITS.md
records at the pinned revision.

**Green Phosphor CRT** was authored by PoshPalette
(<https://github.com/livlign/posh-palette>, MIT, copyright PoshPalette
contributors) and contributed to the collection by that same party. Author and
contributor being one removes the gap the collection's disclaimer opens: the
party who holds the rights is the party who submitted it.

**Keys Ocean Sunset HC** was created by its own contributor, Jesse Miller, using
an AI palette generator, and submitted as original work rather than adapted from
an existing scheme. There is no third-party rights holder upstream of the
contribution, so there is nobody else from whom permission would be owed.

Neither finding rests on the collection-level license, which is the failure #180
was opened to prevent.

## Known non-import sources

- DragonII's Progress Quest 2 v1.02: no source license or reusable asset grant found. Do not copy its executable, resources, screenshots, prose, or data.
- `nbollom/pq2`: GPL-3.0 repository. No code or assets have been imported; importing covered code would be incompatible with representing the combined application as MIT-only.
- Games, comedy, MMO communities, and other projects cited under `docs/research/`: inspiration and factual research only. Do not copy distinctive prose, character names, lore, assets, layouts, or joke structures.

See `docs/research/progress-quest-2-lineage-features-licenses-2026-08-03.md` for the evidence review.

## Contribution rules

1. Record the origin and license of every new code, data, prose, font, image, audio, model, and generated-content source before merging it.
2. Prefer project-owned original expression and already-approved dependencies. A public URL or “free” download is not a reuse grant.
3. Keep externally derived mechanics at the level of independently implemented ideas; do not translate, paraphrase too closely, trace, or extract protected expression.
4. Preserve required notices and immutable source/version references. If evidence is missing or conflicting, fail closed and open an issue.
5. AI assistance does not establish provenance. Prompts, outputs, and reviews must not request living-creator imitation, protected characters/settings/catchphrases, donor code, or unlicensed assets.
6. Permission or legal-review records should identify the material, rightsholder, scope, date, and durable evidence location without publishing private contact information.

## Unresolved decision

Before #143 can be considered fully complete, obtain written owner confirmation or qualified legal review addressing whether the official Progress Quest license covers the JavaScript web port and the Progress Quest-derived tables, prose, and behavior retained here. Until then, this inventory describes the ambiguity; it does not waive it.
