/**
 * Vendor-neutral interface for the self-improvement pipeline's code
 * generation step. The GitHub Actions job (see
 * .github/workflows/self-improve-l2-1.yml) prepares the isolated checkout at
 * `baseSha` — the executor never chooses or prepares its own workspace, and
 * never has repository or GitHub credentials of its own. Its only job is to
 * turn a bounded task into a committed branch.
 *
 * ClaudeCodeExecutor (below) is the first implementation. Swapping in
 * another vendor's coding agent means implementing this interface — nothing
 * in SelfImprovementRun, the pipeline controller, or the workflow YAML's
 * gates depends on which one is used.
 */

export interface BoundedImprovementTask {
  runId: string;
  objective: string;
  constraints: string[];
  acceptanceCriteria: string[];
  baseSha: string;
  /** Absolute path to the already-checked-out, isolated repo working copy. */
  repoPath: string;
}

export interface CodeAgentResult {
  branchName: string;
  commitSha: string;
  diffSummary: string;
  filesChanged: string[];
}

export interface CodeAgentExecutor {
  readonly name: string;
  generate(task: BoundedImprovementTask): Promise<CodeAgentResult>;
}
