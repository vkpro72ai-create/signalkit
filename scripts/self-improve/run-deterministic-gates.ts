/**
 * Gate A (deterministic): install/typecheck/tests/build, plus migration
 * safety classification, run in-process here so exactly one combined result
 * is reported to the API. Uses the SAME classifier the API's own model uses
 * (`@signalkit/shared`) so the two can never drift apart. A non-zero exit
 * from typecheck/test/build fails this script — and, since it fails the
 * GitHub Actions step, the run never reaches `review_pending`.
 *
 * Run via (from repo root): pnpm exec tsx scripts/self-improve/run-deterministic-gates.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { classifyMigrationFiles, type MigrationSafetyClass } from '@signalkit/shared';

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
  const runId = requireEnv('SELF_IMPROVEMENT_RUN_ID');
  const baseSha = requireEnv('SELF_IMPROVEMENT_BASE_SHA');
  const base = requireEnv('SELF_IMPROVEMENT_API_BASE_URL');
  const token = requireEnv('SELF_IMPROVEMENT_CI_TOKEN');

  // `pnpm install` already ran as its own workflow step before this script —
  // the generated commit could only change the lockfile if the code agent
  // touched a package.json, in which case a plain `pnpm install` (not
  // --frozen-lockfile) here picks that up before the gates run.
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

  await fetch(`${base}/self-improve/runs/${runId}/test-result`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ testsPassed, migrationSafety }),
  });

  if (!testsPassed) {
    process.exit(1);
  }
  // destructive_blocked and manual_review_required both stop L2.1 short of
  // review — they're recorded (above) and visible on the run, but this
  // script does not itself decide whether that should hard-fail the job in
  // later phases with auto-merge; for L2.1 the pipeline always stops at an
  // open PR regardless, so no auto-merge decision is made here at all.
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
