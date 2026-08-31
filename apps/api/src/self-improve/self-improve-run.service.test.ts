import { describe, it, expect, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { SelfImproveRunService } from './self-improve-run.service';

type Row = Record<string, unknown>;

function makeService(opts: { recentStatuses?: string[]; row?: Row } = {}) {
  const created: Row[] = [];
  const updated: Row[] = [];
  const row: Row = opts.row ?? { id: 'run1', status: 'proposed' };

  const prisma = {
    selfImprovementRun: {
      findMany: vi.fn().mockResolvedValue((opts.recentStatuses ?? []).map((status) => ({ status }))),
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        const r = { id: 'run1', ...data };
        created.push(r);
        return Promise.resolve(r);
      }),
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        const r = { ...row, ...data };
        updated.push(r);
        return Promise.resolve(r);
      }),
    },
  } as unknown as PrismaService;

  const svc = new SelfImproveRunService(prisma);
  return { svc, prisma, created, updated };
}

describe('SelfImproveRunService — circuit breaker', () => {
  it('is not broken with fewer than 3 recorded runs', async () => {
    const { svc } = makeService({ recentStatuses: ['rolled_back', 'rolled_back'] });
    expect(await svc.isCircuitBroken()).toBe(false);
  });

  it('is not broken when the 3 most recent are not ALL rolled_back', async () => {
    const { svc } = makeService({ recentStatuses: ['rolled_back', 'human_review_pending', 'rolled_back'] });
    expect(await svc.isCircuitBroken()).toBe(false);
  });

  it('is broken when the 3 most recent runs are all rolled_back', async () => {
    const { svc } = makeService({ recentStatuses: ['rolled_back', 'rolled_back', 'rolled_back'] });
    expect(await svc.isCircuitBroken()).toBe(true);
  });

  it('propose() creates a circuit_broken run (not proposed) when the breaker is tripped, and never proceeds as normal', async () => {
    const { svc, created } = makeService({ recentStatuses: ['rolled_back', 'rolled_back', 'rolled_back'] });
    const run = await svc.propose({ actorUserId: 'u1', summary: 's', objective: 'o' });
    expect(run.status).toBe('circuit_broken');
    expect(created[0].status).toBe('circuit_broken');
  });

  it('propose() creates a normal proposed run when the breaker is not tripped', async () => {
    const { svc } = makeService({ recentStatuses: [] });
    const run = await svc.propose({ actorUserId: 'u1', actorWorkspaceId: 'ws1', mcpClientSessionId: 's1', summary: 's', objective: 'o' });
    expect(run.status).toBe('proposed');
    expect(run.actorUserId).toBe('u1');
    expect(run.actorWorkspaceId).toBe('ws1');
    expect(run.mcpClientSessionId).toBe('s1');
  });
});

describe('SelfImproveRunService — state transitions', () => {
  it('markDispatched only succeeds from proposed', async () => {
    const { svc } = makeService({ row: { id: 'run1', status: 'testing' } });
    await expect(svc.markDispatched('run1', 'sha1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('markDispatched proposed -> generating records baseSha', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'proposed' } });
    await svc.markDispatched('run1', 'sha1');
    expect(updated[0]).toMatchObject({ status: 'generating', baseSha: 'sha1' });
  });

  it('recordGenerated only succeeds from generating', async () => {
    const { svc } = makeService({ row: { id: 'run1', status: 'proposed' } });
    await expect(svc.recordGenerated('run1', { branchName: 'b', commitSha: 'c' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('recordGenerated generating -> testing', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'generating' } });
    await svc.recordGenerated('run1', { branchName: 'self-improve/run1', commitSha: 'c1' });
    expect(updated[0]).toMatchObject({ status: 'testing', generatedBranchName: 'self-improve/run1', generatedCommitSha: 'c1' });
  });

  it('recordTestResult(testsPassed: false) moves to failed with failureStage="testing", regardless of migrationSafety', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'testing' } });
    await svc.recordTestResult('run1', { testsPassed: false, migrationSafety: 'safe_additive_candidate' });
    expect(updated[0]).toMatchObject({ status: 'failed', failureStage: 'testing' });
  });

  it('recordTestResult(testsPassed: true) testing -> review_pending, records migrationSafety', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'testing' } });
    await svc.recordTestResult('run1', { testsPassed: true, migrationSafety: 'manual_review_required' });
    expect(updated[0]).toMatchObject({ status: 'review_pending', testsPassed: true, migrationSafety: 'manual_review_required' });
  });

  it('recordTestResult only succeeds from testing', async () => {
    const { svc } = makeService({ row: { id: 'run1', status: 'proposed' } });
    await expect(svc.recordTestResult('run1', { testsPassed: true, migrationSafety: 'none' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('a CONFIRMED review finding fails the run, even alongside PLAUSIBLE findings', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'review_pending' } });
    const findings = [
      { file: 'a.ts', summary: 'looks fine', category: 'x', verdict: 'PLAUSIBLE' as const },
      { file: 'b.ts', summary: 'real bug', category: 'correctness', verdict: 'CONFIRMED' as const },
    ];
    await svc.recordReview('run1', findings);
    expect(updated.some((u) => u.status === 'failed' && u.failureStage === 'review')).toBe(true);
    // Findings are still recorded even though the run failed.
    expect(updated.some((u) => Array.isArray(u.reviewFindings) && (u.reviewFindings as unknown[]).length === 2)).toBe(true);
  });

  it('PLAUSIBLE-only findings (including requiresHumanReview) never block — the run reaches human_review_pending with the findings preserved', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'review_pending' } });
    const findings = [
      { file: 'auth.ts', summary: 'possible tenant isolation gap', category: 'security', verdict: 'PLAUSIBLE' as const, requiresHumanReview: true },
    ];
    await svc.recordReview('run1', findings);
    const last = updated[updated.length - 1];
    expect(last.status).toBe('human_review_pending');
    expect(last.reviewFindings).toEqual(findings);
  });

  it('recordReview with zero findings reaches human_review_pending', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'review_pending' } });
    await svc.recordReview('run1', []);
    expect(updated[0].status).toBe('human_review_pending');
  });

  it('human_review_pending is terminal in L2.1 — no further transition is allowed', async () => {
    const { svc } = makeService({ row: { id: 'run1', status: 'human_review_pending' } });
    await expect(svc.recordReview('run1', [])).rejects.toBeInstanceOf(ConflictException);
  });

  it('fail() can be called at any point and always lands on failed with the given stage/reason', async () => {
    const { svc, updated } = makeService({ row: { id: 'run1', status: 'testing' } });
    await svc.fail('run1', 'generating', 'code agent produced no changes');
    expect(updated[0]).toMatchObject({ status: 'failed', failureStage: 'generating', failureReason: 'code agent produced no changes' });
  });
});
