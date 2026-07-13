import { describe, it, expect } from 'vitest';
import { buildImplementationManifest, renderManifestFiles, type AiAgentPromptInput } from './implementation-manifest';

function prompt(overrides: Partial<AiAgentPromptInput> = {}): AiAgentPromptInput {
  return {
    title: 'Step',
    targetAgent: 'cursor',
    purpose: 'Do a thing',
    promptBody: 'Context\nTask\nAcceptance\n- works\nDo not\n- cut corners',
    relatedSections: [],
    expectedFiles: [],
    tests: ['pnpm test'],
    finalReportFormat: ['what changed'],
    ...overrides,
  };
}

describe('buildImplementationManifest', () => {
  it('supports MANY prompts in the same workstream (not one-per-workstream)', () => {
    const bundle = [
      prompt({ title: 'Auth screens', relatedSections: ['ui', 'screen'] }),
      prompt({ title: 'Onboarding flow', relatedSections: ['onboarding', 'screen'] }),
      prompt({ title: 'Main app shell', relatedSections: ['navigation', 'layout'] }),
    ];
    const m = buildImplementationManifest(bundle);
    const frontend = m.prompts.filter((p) => p.workstream === 'frontend');
    expect(frontend.length).toBe(3);
    expect(frontend.map((p) => p.sequence)).toEqual([1, 2, 3]);
  });

  it('places many prompts across workstreams into the same sprint', () => {
    const bundle = [
      prompt({ title: 'Auth screens', relatedSections: ['ui', 'screen'] }),
      prompt({ title: 'Auth API endpoints', relatedSections: ['api', 'endpoint', 'controller'] }),
      prompt({ title: 'Core database schema', relatedSections: ['database schema', 'prisma', 'migration'] }),
      prompt({ title: 'Provider router integration', relatedSections: ['llm', 'model router', 'inference'] }),
    ];
    const m = buildImplementationManifest(bundle);
    // Each of those is the FIRST prompt of its workstream, so all land in sprint 1.
    const sprint1 = m.prompts.filter((p) => p.phase === 1);
    expect(sprint1.length).toBe(4);
    expect(new Set(sprint1.map((p) => p.workstream)).size).toBeGreaterThan(1);
  });

  it('imposes no fixed maximum — an arbitrary count of prompts is preserved', () => {
    const bundle = Array.from({ length: 73 }, (_, i) => prompt({ title: `Backend step ${i}`, relatedSections: ['api', 'service'] }));
    const m = buildImplementationManifest(bundle);
    expect(m.totalPrompts).toBe(73);
    expect(m.prompts).toHaveLength(73);
    // 73 backend prompts at 5/sprint => 15 sprints.
    expect(Math.max(...m.sprints)).toBe(15);
  });

  it('persists ordering + dependencies (sequential within a workstream; parallel across workstreams in a sprint)', () => {
    const bundle = [
      prompt({ title: 'Frontend step 1', relatedSections: ['ui'] }),
      prompt({ title: 'Frontend step 2', relatedSections: ['ui'] }),
      prompt({ title: 'Backend step 1', relatedSections: ['api'] }),
    ];
    const m = buildImplementationManifest(bundle);
    const [f1, f2, b1] = m.prompts;
    expect(f2!.dependsOn).toContain(f1!.promptId);
    expect(f1!.blocks).toContain(f2!.promptId);
    expect(f1!.parallelizable).toContain(b1!.promptId); // same sprint, different workstream
  });

  it('carries a grouping-confidence flag and marks ambiguous prompts low', () => {
    const strong = buildImplementationManifest([
      prompt({ title: 'Database schema + prisma migration for entities', relatedSections: ['database schema', 'prisma', 'entity', 'migration'] }),
    ]).prompts[0]!;
    expect(strong.workstream).toBe('data');
    expect(strong.groupingConfidence).toBe('high');

    const ambiguous = buildImplementationManifest([
      prompt({ title: 'Thing', purpose: '', relatedSections: [], expectedFiles: [] }),
    ]).prompts[0]!;
    expect(ambiguous.groupingConfidence).toBe('low');
  });

  it('gives each prompt a bounded scope with acceptance criteria + verification', () => {
    const m = buildImplementationManifest([prompt()]);
    const p = m.prompts[0]!;
    expect(p.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(p.verification).toContain('pnpm test');
    expect(p.forbiddenShortcuts).toContain('cut corners');
    expect(p.instructions).toContain('Task');
  });
});

describe('renderManifestFiles', () => {
  it('emits manifest.md + manifest.json + one file per prompt in sprint/workstream folders', () => {
    const bundle = [
      prompt({ title: 'Auth screens', relatedSections: ['ui', 'screen'] }),
      prompt({ title: 'Auth API', relatedSections: ['api', 'endpoint'] }),
    ];
    const files = renderManifestFiles(buildImplementationManifest(bundle));
    const paths = files.map((f) => f.path);
    expect(paths).toContain('implementation/manifest.json');
    expect(paths).toContain('implementation/manifest.md');
    expect(paths.some((p) => /^implementation\/sprint-01\/frontend\/01-auth-screens\.md$/.test(p))).toBe(true);
    expect(paths.some((p) => /^implementation\/sprint-01\/backend\/01-auth-api\.md$/.test(p))).toBe(true);
    // Each prompt file is self-contained (has an Objective + Task section).
    const authFile = files.find((f) => f.path.endsWith('01-auth-screens.md'))!;
    expect(authFile.content).toContain('## Objective');
    expect(authFile.content).toContain('## Task');
  });
});
