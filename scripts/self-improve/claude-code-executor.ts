import { execFileSync } from 'node:child_process';
import type { BoundedImprovementTask, CodeAgentExecutor, CodeAgentResult } from './code-agent-executor.js';

/**
 * First CodeAgentExecutor implementation — invokes the `claude` CLI in
 * headless/print mode inside the `generate` job's isolated workspace. Used
 * ONLY by that job: the workflow maps `ANTHROPIC_API_KEY` from
 * `secrets.SELF_IMPROVEMENT_CODE_AGENT_KEY` there and nowhere else — the
 * separate `independent_review` job runs this same CLI with a DIFFERENT key
 * (`SELF_IMPROVEMENT_REVIEW_AGENT_KEY`, see independent-review.ts) so the
 * agent that writes the code is never the one that approves it. Never a
 * workspace's UserLLMConnection or any per-user credential; see
 * .github/workflows/self-improve-l2-1.yml for the per-job secret scoping.
 *
 * NOTE: not exercised end-to-end in this environment — no live GitHub
 * Actions run has been triggered. The exact `claude` CLI flags below may
 * need adjustment for whichever CLI version the workflow pins.
 */
export class ClaudeCodeExecutor implements CodeAgentExecutor {
  readonly name = 'claude-code';

  async generate(task: BoundedImprovementTask): Promise<CodeAgentResult> {
    const branchName = `self-improve/${task.runId}`;
    execFileSync('git', ['checkout', '-b', branchName], { cwd: task.repoPath, stdio: 'inherit' });

    const prompt = this.buildPrompt(task);
    execFileSync(
      'claude',
      ['-p', prompt, '--permission-mode', 'acceptEdits', '--output-format', 'json'],
      { cwd: task.repoPath, stdio: 'inherit', env: process.env },
    );

    const filesChanged = execFileSync('git', ['diff', '--name-only', task.baseSha], { cwd: task.repoPath })
      .toString('utf8')
      .split('\n')
      .filter(Boolean);

    if (filesChanged.length === 0) {
      throw new Error('Code agent produced no changes');
    }

    execFileSync('git', ['add', '-A'], { cwd: task.repoPath });
    execFileSync(
      'git',
      ['commit', '-m', `Self-improvement: ${task.objective.slice(0, 72)}`, '--author', 'SignalKit Self-Improve <self-improve@signalkit.local>'],
      { cwd: task.repoPath, stdio: 'inherit' },
    );
    const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: task.repoPath }).toString('utf8').trim();
    const diffSummary = execFileSync('git', ['diff', '--stat', task.baseSha, commitSha], { cwd: task.repoPath }).toString('utf8');

    return { branchName, commitSha, diffSummary, filesChanged };
  }

  private buildPrompt(task: BoundedImprovementTask): string {
    return [
      `Objective: ${task.objective}`,
      task.constraints.length > 0 ? `Constraints (must respect all of these):\n${task.constraints.map((c) => `- ${c}`).join('\n')}` : '',
      task.acceptanceCriteria.length > 0
        ? `Acceptance criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`
        : '',
      'Make the minimal, focused change that satisfies the objective. Follow this repository\'s existing conventions. Do not touch unrelated files.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
