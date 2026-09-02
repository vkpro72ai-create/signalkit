import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

/**
 * Static structural tests over the actual workflow YAML — not a live GitHub
 * Actions run (none has been triggered in this environment; no GitHub App is
 * configured). These prove the secret-isolation properties by parsing the
 * real file, not by re-describing it.
 */

interface Job {
  'runs-on'?: string;
  permissions?: Record<string, string>;
  needs?: string | string[];
  if?: string;
  env?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: Array<{ env?: Record<string, string>; run?: string; with?: Record<string, unknown> }>;
}

interface Workflow {
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  on: { repository_dispatch?: { types: string[] } };
  jobs: Record<string, Job>;
}

const WORKFLOW_PATH = join(__dirname, '../../../../.github/workflows/self-improve-l2-1.yml');

let workflow: Workflow;
let rawText: string;

beforeAll(() => {
  rawText = readFileSync(WORKFLOW_PATH, 'utf8');
  workflow = yaml.load(rawText) as Workflow;
});

/** Every place a value could reference a GitHub secret: job env, step env, step run script. */
function allSecretReferences(job: Job): string[] {
  const refs: string[] = [];
  const scan = (obj: Record<string, string> | undefined) => {
    if (!obj) return;
    for (const value of Object.values(obj)) {
      const matches = value.match(/secrets\.[A-Z0-9_]+/g);
      if (matches) refs.push(...matches);
    }
  };
  scan(job.env);
  for (const step of job.steps ?? []) {
    scan(step.env);
    if (step.run) {
      const matches = step.run.match(/secrets\.[A-Z0-9_]+/g);
      if (matches) refs.push(...matches);
    }
  }
  return refs;
}

describe('self-improve-l2-1.yml — structure', () => {
  it('has exactly the 4 required jobs, each on a fresh GitHub-hosted runner', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(
      ['deterministic_gates', 'generate', 'independent_review', 'publish_result_and_pr'].sort(),
    );
    for (const [name, job] of Object.entries(workflow.jobs)) {
      expect(job['runs-on'], `${name}.runs-on`).toBe('ubuntu-latest');
    }
  });

  it('declares an empty/minimal top-level permissions block — no job relies on workflow-level defaults', () => {
    expect(workflow.permissions).toEqual({});
    for (const [name, job] of Object.entries(workflow.jobs)) {
      expect(job.permissions, `${name} must declare its own permissions`).toBeDefined();
      expect(Object.keys(job.permissions ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('has no workflow-level env: block (would leak every job\'s secrets into every other job)', () => {
    expect(workflow.env).toBeUndefined();
  });

  it('job dependency graph: gates and review both need generate; publish needs all three', () => {
    expect(workflow.jobs.deterministic_gates.needs).toBe('generate');
    expect(workflow.jobs.independent_review.needs).toBe('generate');
    expect(workflow.jobs.publish_result_and_pr.needs).toEqual(['generate', 'deterministic_gates', 'independent_review']);
  });
});

describe('self-improve-l2-1.yml — repository_dispatch payload stays minimal', () => {
  it('the trigger event type is self_improve_propose', () => {
    expect(workflow.on.repository_dispatch?.types).toEqual(['self_improve_propose']);
  });

  it('only client_payload.runId and client_payload.baseSha are ever referenced anywhere in the workflow', () => {
    const refs = rawText.match(/client_payload\.[A-Za-z0-9_]+/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    expect(new Set(refs)).toEqual(new Set(['client_payload.runId', 'client_payload.baseSha']));
  });
});

describe('self-improve-l2-1.yml — deterministic_gates: the secret-free, generated-code-execution job', () => {
  it('references no secrets of any kind', () => {
    expect(allSecretReferences(workflow.jobs.deterministic_gates)).toEqual([]);
  });

  it('never receives SELF_IMPROVEMENT_CI_TOKEN specifically', () => {
    expect(JSON.stringify(workflow.jobs.deterministic_gates)).not.toContain('SELF_IMPROVEMENT_CI_TOKEN');
  });

  it('permissions are read-only — no write scope of any kind', () => {
    const perms = workflow.jobs.deterministic_gates.permissions ?? {};
    expect(Object.keys(perms).length).toBeGreaterThan(0);
    for (const value of Object.values(perms)) {
      expect(value).not.toBe('write');
    }
  });

  it('checks out the exact generatedCommitSha from the generate job, not a branch tip', () => {
    const checkout = workflow.jobs.deterministic_gates.steps?.find((s) => s.with && 'ref' in (s.with as object));
    expect((checkout?.with as { ref?: string })?.ref).toBe('${{ needs.generate.outputs.commit_sha }}');
  });

  it('does not persist push credentials on checkout', () => {
    const checkout = workflow.jobs.deterministic_gates.steps?.find((s) => s.with && 'ref' in (s.with as object));
    expect((checkout?.with as { 'persist-credentials'?: boolean })?.['persist-credentials']).toBe(false);
  });
});

describe('self-improve-l2-1.yml — writer/reviewer key isolation', () => {
  it('SELF_IMPROVEMENT_CODE_AGENT_KEY (writer key) appears in generate only', () => {
    const jobsWithIt = Object.entries(workflow.jobs)
      .filter(([, job]) => allSecretReferences(job).includes('secrets.SELF_IMPROVEMENT_CODE_AGENT_KEY'))
      .map(([name]) => name);
    expect(jobsWithIt).toEqual(['generate']);
  });

  it('SELF_IMPROVEMENT_REVIEW_AGENT_KEY appears in independent_review only', () => {
    const jobsWithIt = Object.entries(workflow.jobs)
      .filter(([, job]) => allSecretReferences(job).includes('secrets.SELF_IMPROVEMENT_REVIEW_AGENT_KEY'))
      .map(([name]) => name);
    expect(jobsWithIt).toEqual(['independent_review']);
  });

  it('generate never references the reviewer key, and independent_review never references the writer key', () => {
    expect(allSecretReferences(workflow.jobs.generate)).not.toContain('secrets.SELF_IMPROVEMENT_REVIEW_AGENT_KEY');
    expect(allSecretReferences(workflow.jobs.independent_review)).not.toContain('secrets.SELF_IMPROVEMENT_CODE_AGENT_KEY');
  });

  it('independent_review has no contents:write and does not persist push credentials', () => {
    expect(workflow.jobs.independent_review.permissions?.contents).not.toBe('write');
    const checkout = workflow.jobs.independent_review.steps?.find((s) => s.with && 'ref' in (s.with as object));
    expect((checkout?.with as { 'persist-credentials'?: boolean })?.['persist-credentials']).toBe(false);
  });

  it('independent_review never references SELF_IMPROVEMENT_CI_TOKEN', () => {
    expect(JSON.stringify(workflow.jobs.independent_review)).not.toContain('SELF_IMPROVEMENT_CI_TOKEN');
  });
});

describe('self-improve-l2-1.yml — no deploy/SSH/prod secret exists anywhere', () => {
  it('the only secrets referenced in the whole file are the explicit self-improvement allowlist', () => {
    const allRefs = new Set(rawText.match(/secrets\.[A-Z0-9_]+/g) ?? []);
    const allowlist = new Set([
      'secrets.SELF_IMPROVEMENT_API_BASE_URL',
      'secrets.SELF_IMPROVEMENT_CI_TOKEN',
      'secrets.SELF_IMPROVEMENT_CODE_AGENT_KEY',
      'secrets.SELF_IMPROVEMENT_REVIEW_AGENT_KEY',
    ]);
    for (const ref of allRefs) {
      expect(allowlist.has(ref), `Unexpected secret reference: ${ref}`).toBe(true);
    }
  });

  it('no SSH, deploy, or production-infrastructure secret or script is actually USED (comments explaining their absence don\'t count)', () => {
    // Strip comments and prose so this checks actual YAML directives (uses:/run:/env: values),
    // not the explanatory comments in the file that legitimately mention "no SSH credential" etc.
    const codeOnly = rawText
      .split('\n')
      .map((line) => line.replace(/#.*$/, ''))
      .join('\n');
    expect(codeOnly).not.toMatch(/\bssh\b/i);
    expect(codeOnly).not.toMatch(/deploy\.sh|docker[- ]compose|scripts\/deploy/i);
  });

  it('publish_result_and_pr never checks out or executes generated repository code', () => {
    const publish = workflow.jobs.publish_result_and_pr;
    const hasCheckout = publish.steps?.some((s) => s.with && ('ref' in (s.with as object) || Object.keys(s.with as object).length > 0));
    // No checkout step at all in this job.
    expect(publish.steps?.every((s) => !s.run?.includes('pnpm exec tsx'))).toBe(true);
    expect(hasCheckout).toBeFalsy();
  });
});

describe('self-improve-l2-1.yml — secrets are never passed through job outputs', () => {
  it('no job output value references a secret', () => {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      for (const value of Object.values(job.outputs ?? {})) {
        expect(value, `${name} output`).not.toMatch(/secrets\./);
      }
    }
  });
});

describe('self-improve-l2-1.yml — publish_result_and_pr uses only minimum credentials', () => {
  const publish = () => workflow.jobs.publish_result_and_pr;

  it('has no writer or reviewer provider key', () => {
    expect(allSecretReferences(publish())).not.toContain('secrets.SELF_IMPROVEMENT_CODE_AGENT_KEY');
    expect(allSecretReferences(publish())).not.toContain('secrets.SELF_IMPROVEMENT_REVIEW_AGENT_KEY');
  });

  it('permissions are limited to contents:read and pull-requests:write — nothing else', () => {
    expect(publish().permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
  });

  it('runs regardless of upstream job outcome (if: always()) so it can report a crashed job too', () => {
    expect(publish().if).toBe('always()');
  });
});
