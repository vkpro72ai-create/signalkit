/**
 * Gate B: independent review. A SEPARATE `claude -p` invocation from the one
 * that generated the change — no shared context, no memory of the
 * generation step's reasoning, only the actual git diff and repository. This
 * is what makes it independent: the agent that wrote the code is never the
 * only one that approves it.
 *
 * Any CONFIRMED finding blocks (recordReview() moves the run to `failed`).
 * PLAUSIBLE findings never block in L2.1 (there is no auto-merge to gate)
 * but are always recorded for human audit, including ones flagged
 * `requiresHumanReview` (security/auth/tenant-isolation/migration/deployment)
 * — those must never be silently treated as safe just because they're not
 * CONFIRMED.
 *
 * Run via (from repo root): pnpm exec tsx scripts/self-improve/independent-review.ts
 */
import { execFileSync } from 'node:child_process';
import type { ReviewFinding } from '@signalkit/shared';

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
  const runId = requireEnv('SELF_IMPROVEMENT_RUN_ID');
  const baseSha = requireEnv('SELF_IMPROVEMENT_BASE_SHA');
  const base = requireEnv('SELF_IMPROVEMENT_API_BASE_URL');
  const token = requireEnv('SELF_IMPROVEMENT_CI_TOKEN');

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

  await fetch(`${base}/self-improve/runs/${runId}/review`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ findings }),
  });

  const confirmed = findings.filter((f) => f.verdict === 'CONFIRMED');
  console.log(`Review complete: ${findings.length} finding(s), ${confirmed.length} CONFIRMED`);
  if (confirmed.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
