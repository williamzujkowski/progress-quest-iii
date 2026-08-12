# Security Policy

Progress Quest III is an unofficial, non-commercial modernization of a zero-player RPG. It has
no backend, no accounts, and no network calls: everything runs in the browser and every byte it
persists stays in that browser's own storage. That bounds what a vulnerability here can do, but
it does not make the surface empty — imported save data, browser storage, the clipboard, and
the service worker are all real trust boundaries.

## Reporting a vulnerability

Report privately through GitHub's
[private vulnerability reporting](https://github.com/williamzujkowski/progress-quest-iii/security/advisories/new)
rather than opening a public issue.

Please include what you did, what happened, and what you expected — a save payload or a
sequence of steps is worth more than a scanner label. There is no bounty and no service-level
commitment; this is a hobby project maintained in spare time, and a realistic expectation is a
first response within a couple of weeks.

## What is in scope

- Anything that lets imported `.pqw` data or a crafted browser-storage value execute script,
  escape validation, or corrupt an unrelated saved character.
- Service-worker behaviour that could serve stale or poisoned content, or cache data it should
  not (query strings and user-derived values are deliberately excluded from runtime caching).
- Supply-chain problems in shipped dependencies — anything reachable from `src/`.

## What is not

- The original 2000s web client. It used to be checked out here as the `pq-web-src/` submodule and
  executed by a test-time oracle; both are gone, so this repository no longer fetches, ships, or
  runs any of it. Findings in that code belong upstream.
- Vulnerabilities in `devDependencies` that cannot reach the production bundle. These are
  tracked and fixed as hygiene, but they are not a user-facing risk — see the reachability
  analysis convention in issue #132 for how that judgement is recorded.
- Anything requiring an attacker to already control the user's browser or filesystem.

## A boundary this project does not control

The deployment shares an origin with everything else published from
`williamzujkowski.github.io`. GitHub Pages user sites serve every project of an account from one
host, and the browser's isolation is per origin, not per path — so `localStorage`, `CacheStorage`,
and the `'self'` in this project's Content Security Policy all cover the whole account, not
`/progress-quest-iii/`.

Two consequences are worth stating plainly, because the rest of this file reads tighter than they
are:

- **`connect-src 'self'` is broader than it looks.** It permits the origin, not the subpath. The
  claim that nothing is sent anywhere rests on this being a static host with no endpoint to send
  to, rather than on the policy forbidding it.
- **Script execution anywhere on that origin reaches this app's data.** Anything with script on a
  sibling project — or on the blog served from `/` — can read and write every `progquest_*` key
  directly, and can write into the shell cache. Because precached assets are served cache-first, an
  entry poisoned that way is served in preference to the network until a new build id ships and
  `activate` rotates the cache. The cache name is derivable: it is the build id, printed in the
  served `sw.js`.

This is not a defect in the code here and there is no fix inside this repository; a custom domain or
a project-dedicated origin is what removes it. It is recorded because the alternative is a threat
model that quietly assumes an isolation the deployment does not provide. Reports that depend on
already having script on that origin fall under the exclusion above — but the *consequences* of
such a foothold are worse than the usual same-origin case, and that is the part worth knowing.

## Supported versions

Only the currently deployed `main` is supported. There are no released versions to backport to.

## How this project defends itself

Stated so a reporter knows what has already been considered:

- Every external input crosses a Zod schema before it reaches application state, and parse
  failures fail closed — a malformed save never partially applies.
- The static shell ships a strict Content-Security-Policy with no `unsafe-inline` for scripts
  and `object-src 'none'`.
- Third-party GitHub Actions are pinned to full commit SHAs with version comments, and
  Dependabot is configured specifically because a pinned SHA cannot float on its own.
- CI runs CodeQL, dependency review on pull requests, `npm audit` at moderate severity, and
  `npm audit signatures`, alongside the standard quality gate.
- The deployment workflow separates a read-only build job from the write-capable Pages job,
  and publishes an SBOM for the exact artifact that gets deployed.
- The deployed artifact carries a build provenance attestation, produced in a third job so that
  the write scopes attestation requires never reach the job that runs the build and the tests.

## Verifying a deployed artifact

Provenance is only worth having if it can be checked, so the check is written down:

```sh
gh attestation verify artifact.tar --repo williamzujkowski/progress-quest-iii
```

`artifact.tar` is the `github-pages` artifact from the deploy run that published the version you
are checking. The subcommand needs GitHub CLI 2.49 or newer; older builds report it as unknown.

Without a recent CLI, the attestation can be fetched by digest instead:

```sh
gh api repos/williamzujkowski/progress-quest-iii/attestations/sha256:<digest>
```

That returns the in-toto envelope and its Rekor transparency-log entry, but retrieving an
attestation is not the same as verifying one — it confirms the record exists, not that the
signature and identity check out.

A successful verification says the tarball was produced by this repository's workflow at a
particular commit; it is not a statement about the contents being free of defects.

### Rebuilding it yourself

The attestation says which workflow produced an artifact. It does not say what the artifact
contains, and the two questions are worth separating. The build is reproducible, so the second
question can be answered independently:

```sh
git checkout <the deployed commit>
npm ci
GITHUB_SHA=<the deployed commit> npm run build
```

The emitted `dist/assets/index-*.js` is byte-identical to the deployed one. `GITHUB_SHA` matters:
the build stamps it into the bundle as a build identifier, defaulting to `development`, so
omitting it produces a legitimately different file and a different content hash.

Verified against a live deployment rather than asserted — a rebuild of the deployed commit matched
the served bundle byte for byte.

Attestation deliberately does not gate the deploy. It describes an artifact that has already been
built, and blocking on it would turn a signing outage into an outage of the site.
