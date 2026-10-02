/**
 * independent_review job ONLY. A SEPARATE `claude -p` invocation from the one
 * that generated the change (different job, different runner, no shared
 * context) — no memory of the generation step's reasoning, only the actual
 * git diff. This is what makes it independent: the agent that wrote the code
 * is never the only one that approves it.
 *
 * Holds ONLY SELF_IMPROVEMENT_REVIEW_AGENT_KEY (mapped to ANTHROPIC_API_KEY
 * by the workflow) — no writer key, no branch-push token, no CI callback
 * token, no deploy credential. It cannot report to the API itself; it writes
 * findings to the job output for publish_result_and_pr to report.
 *
 * Any CONFIRMED finding is reported and blocks progression (handled by
 * publish_result_and_pr, not here). PLAUSIBLE findings — including ones
 * flagged `requiresHumanReview` for security/auth/tenant-isolation/
 * migration/deployment — are always included in the output for human audit,
 * never silently dropped.
 *
 * Run via (from repo root): pnpm exec tsx scripts/self-improve/independent-review.ts
 */
import { execFileSync } from 'node:child_process';
import type { ReviewFinding } from '@signalkit/shared';
import { setGithubOutput } from './github-actions-output.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

const REVIEW_PROMPT = `Review the following git diff for correctness bugs, security issues (especially
auth/tenant-isolation regressions), and migration/deployment risk. Output ONLY a JSON array of
findings, each shaped exactly as:
{"file": string, "line": number | null, "summary": string, "category": string,
 "verdict": "CONFIRMED" | "PLAUSIBLE", "requiresHumanReview": boolean}
Set requiresHumanReview: true for any security/auth/tenant-isolation/migration/deployment finding,
even at PLAUSIBLE confidence — those must never be treated as safe by default. Output [] if there
are no findings. Output nothing else — no prose, no markdown fences.`;

async function main(): Promise<void> {
  const baseSha = requireEnv('SELF_IMPROVEMENT_BASE_SHA');

  const diff = execFileSync('git', ['diff', baseSha, 'HEAD']).toString('utf8');
  const prompt = `${REVIEW_PROMPT}\n\n--- DIFF ---\n${diff}`;

  const raw = execFileSync('claude', ['-p', prompt, '--output-format', 'text'], {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  }).toString('utf8');

  let findings: ReviewFinding[];
  try {
    findings = JSON.parse(raw.trim()) as ReviewFinding[];
  } catch {
    // A review step that can't even produce parseable output is itself a
    // signal something is wrong — treat it as a human-review-required
    // finding rather than silently passing.
    findings = [
      {
        file: '(review step)',
        summary: 'Independent review output was not valid JSON — could not be evaluated automatically.',
        category: 'review-infrastructure',
        verdict: 'PLAUSIBLE',
        requiresHumanReview: true,
      },
    ];
  }

  setGithubOutput('findings', JSON.stringify(findings));
  const confirmed = findings.filter((f) => f.verdict === 'CONFIRMED');
  console.log(`Review complete: ${findings.length} finding(s), ${confirmed.length} CONFIRMED`);
  // Deliberately exits 0 regardless of verdict: CONFIRMED findings are a DATA
  // result for publish_result_and_pr to act on, not a crash of this job.
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
