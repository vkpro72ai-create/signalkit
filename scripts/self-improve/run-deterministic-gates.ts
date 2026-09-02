/**
 * deterministic_gates job ONLY. This is the one job that actually executes
 * the generated repository's own code (pnpm install/typecheck/test/build) —
 * the critical rule is that generated code executes ONLY here, in a job with
 * NO secrets at all: no SELF_IMPROVEMENT_CODE_AGENT_KEY, no
 * SELF_IMPROVEMENT_REVIEW_AGENT_KEY, no SELF_IMPROVEMENT_CI_TOKEN, no
 * deploy/SSH/prod credential of any kind. This script must never read a
 * `secrets.*`-sourced env var, and never calls the SignalKit API — it only
 * writes its result to the GitHub Actions job output (via GITHUB_OUTPUT),
 * which `publish_result_and_pr` (the only job with the CI token) reports on
 * its behalf.
 *
 * Uses the SAME migration classifier the API's own model uses
 * (`@signalkit/shared`) so the two can never drift apart.
 *
 * Run via (from repo root): pnpm exec tsx scripts/self-improve/run-deterministic-gates.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { classifyMigrationFiles, type MigrationSafetyClass } from '@signalkit/shared';
import { setGithubOutput } from './github-actions-output.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function run(command: string, args: string[]): void {
  console.log(`==> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit' });
}

function classifyChangedMigrations(baseSha: string): MigrationSafetyClass {
  const changedFiles = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', baseSha, 'HEAD'])
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .filter((path) => /prisma[\\/]migrations[\\/].*\.sql$/i.test(path));

  const files = changedFiles.map((path) => ({ path, content: readFileSync(path, 'utf8') }));
  return classifyMigrationFiles(files);
}

async function main(): Promise<void> {
  // Only non-secret inputs: a public base-commit SHA. No API base URL, no
  // token of any kind is read anywhere in this script.
  const baseSha = requireEnv('SELF_IMPROVEMENT_BASE_SHA');

  let testsPassed = true;
  try {
    run('pnpm', ['install']);
    run('pnpm', ['exec', 'tsc', '-b']);
    run('pnpm', ['test']);
    run('pnpm', ['build']);
  } catch {
    testsPassed = false;
  }

  const migrationSafety = classifyChangedMigrations(baseSha);
  console.log(`testsPassed=${testsPassed} migrationSafety=${migrationSafety}`);

  setGithubOutput('tests_passed', String(testsPassed));
  setGithubOutput('migration_safety', migrationSafety);
  // Deliberately exits 0 either way: `testsPassed=false` is a DATA result for
  // publish_result_and_pr to act on (it reports the run as failed via the
  // API), not a crash of this job. Only an actual script error below (e.g. a
  // missing env var) is a real job failure.
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
