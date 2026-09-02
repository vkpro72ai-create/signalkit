import { appendFileSync } from 'node:fs';

/**
 * Writes a step output via the GITHUB_OUTPUT file (the current, non-deprecated
 * mechanism — `::set-output::` is retired). Used only by jobs that must NOT
 * hold the CI callback token (deterministic_gates, independent_review): they
 * report their result as a job output instead of calling the API directly,
 * so `publish_result_and_pr` — the only job with SELF_IMPROVEMENT_CI_TOKEN —
 * can report it on their behalf. Never used to carry a secret.
 */
export function setGithubOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) throw new Error('GITHUB_OUTPUT is not set — not running inside a GitHub Actions step');
  const delimiter = `ghadelim_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}
