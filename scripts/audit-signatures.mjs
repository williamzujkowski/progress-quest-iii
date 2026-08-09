#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * `npm audit signatures`, retried, because it is the one gate here that depends on a third party
 * being up at the moment it runs.
 *
 * Registry signature and attestation verification is a live call out to the transparency log. When
 * that call fails, npm does not report an outage — it reports the package:
 *
 *   1 package has an invalid attestation:
 *   remarque-tokens@0.26.0 (https://registry.npmjs.org/)
 *   Someone might have tampered with this package since it was published on the registry!
 *
 * That happened once on `main` and stopped a Pages deploy. It was not tampering, and the evidence
 * was specific: the lockfile's integrity hash matched the registry's `dist.integrity` byte for byte,
 * four consecutive local runs verified every attestation, the package set was identical (102 + 1
 * invalid against 103 verified), and the next deploy of the same lockfile went green. A genuine
 * tampering signal cannot come and go while the pinned hash stays fixed.
 *
 * ## What this does and does not change
 *
 * It does not weaken the check. The command is unchanged, the threshold is unchanged, and a package
 * that genuinely fails verification fails every attempt and therefore fails this. What retrying
 * buys is that an outage costs a few seconds instead of a deploy.
 *
 * It is deliberately *only* this command. `npm audit --audit-level=moderate` stays a single attempt:
 * it reports vulnerabilities from a database rather than performing a cryptographic check, and a
 * gate that retries everything until it passes is not a gate.
 *
 * ## Why a script rather than a shell loop
 *
 * `package.json` scripts run through the platform shell, and a `for` loop there is a Windows
 * portability trap for a contributor who never runs CI. This is also the file where the reasoning
 * above can live, which a one-line script could not carry.
 */

/** Enough attempts to cross a blip, few enough that a real failure is still prompt. */
export const ATTEMPTS = 3;
const BACKOFF_MS = [2_000, 5_000];

const runNpm = () => spawnSync('npm', ['audit', 'signatures'], { stdio: 'inherit', shell: process.platform === 'win32' });

/**
 * The retry itself, separated from the process it runs so it can be tested against a fake.
 *
 * Testing this by invoking npm would be testing npm. What is worth pinning is the policy: that a
 * failure is retried, that a success on any attempt is a success, that the last exit status is the
 * one reported, and that a killed process is not retried at all.
 */
export async function auditWithRetry({ run = runNpm, attempts = ATTEMPTS, wait = (ms) => sleep(ms), log = console.error } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = run();

    // A signal — killed rather than exited — is not a verification result, and retrying it would be
    // guessing about why the process died.
    if (result.error) {
      log(`npm audit signatures could not be started: ${result.error.message}`);
      return 1;
    }
    if (result.signal) {
      log(`npm audit signatures was terminated by ${result.signal}`);
      return 1;
    }
    if (result.status === 0) return 0;

    if (attempt === attempts) {
      log(`\nnpm audit signatures failed ${attempts} times. Treat this as a real finding.`);
      log('A transient transparency-log outage clears within a retry; a package that fails');
      log('every attempt does not. Check the lockfile integrity hash against the registry');
      log('before assuming either — that comparison is what tells the two apart.');
      return result.status ?? 1;
    }

    const pause = BACKOFF_MS[attempt - 1] ?? 5_000;
    log(`\nnpm audit signatures failed (attempt ${attempt} of ${attempts}); retrying in ${pause / 1000}s.`);
    await wait(pause);
  }
  return 1;
}

// Run only when invoked directly, so the test can import the policy without shelling out to npm.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(await auditWithRetry());
}
