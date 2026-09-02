/**
 * generate job only. Fetches the bounded task from the SignalKit API by
 * `runId` (never from the repository_dispatch payload, which carries only
 * {runId, baseSha}), runs the configured CodeAgentExecutor, pushes the
 * resulting branch, and reports {branchName, commitSha} back — both as a job
 * output (for deterministic_gates/independent_review to check out the exact
 * generatedCommitSha, since neither of those jobs holds a CI token to ask the
 * API) and to the API itself (this job is the one place SELF_IMPROVEMENT_CI_
 * TOKEN and SELF_IMPROVEMENT_CODE_AGENT_KEY are both present — deliberately;
 * no other job has both, or either, of these).
 *
 * Run via (from repo root): pnpm exec tsx scripts/self-improve/run-code-agent.ts
 */
import { execFileSync } from 'node:child_process';
import { ClaudeCodeExecutor } from './claude-code-executor.js';
import type { CodeAgentExecutor } from './code-agent-executor.js';
import { setGithubOutput } from './github-actions-output.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = requireEnv('SELF_IMPROVEMENT_API_BASE_URL');
  const token = requireEnv('SELF_IMPROVEMENT_CI_TOKEN');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`SignalKit API call failed: ${init?.method ?? 'GET'} ${path} -> ${res.status}`);
  }
  return res;
}

async function main(): Promise<void> {
  const runId = requireEnv('SELF_IMPROVEMENT_RUN_ID');
  const repoPath = process.cwd();

  const task = (await (await apiFetch(`/self-improve/runs/${runId}/task`)).json()) as {
    objective: string;
    constraints: string[];
    acceptanceCriteria: string[];
    baseSha: string;
  };

  const executor: CodeAgentExecutor = new ClaudeCodeExecutor();
  const result = await executor.generate({
    runId,
    objective: task.objective,
    constraints: task.constraints,
    acceptanceCriteria: task.acceptanceCriteria,
    baseSha: task.baseSha,
    repoPath,
  });

  execFileSync('git', ['push', 'origin', result.branchName], { cwd: repoPath, stdio: 'inherit' });

  await apiFetch(`/self-improve/runs/${runId}/generated`, {
    method: 'PATCH',
    body: JSON.stringify({ branchName: result.branchName, commitSha: result.commitSha }),
  });

  setGithubOutput('branch_name', result.branchName);
  setGithubOutput('commit_sha', result.commitSha);

  console.log(`Generated ${result.branchName} @ ${result.commitSha} (${result.filesChanged.length} files changed)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
