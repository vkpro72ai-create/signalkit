import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { ImplementationProjectsService } from './implementation-projects.service';

type Row = Record<string, unknown>;

interface Fixture {
  pack?: Row | null;
  job?: Row | null;
  gate?: Row | null;
  venture?: Row | null;
  verdict?: Row | null;
  existingProject?: Row | null;
  niche?: Row | null;
}

function makeService(f: Fixture = {}) {
  const pack = f.pack === undefined
    ? { id: 'pack1', workspaceId: 'ws1', nicheId: 'n1', projectId: 'research1', title: 'Pack', status: 'draft' }
    : f.pack;
  const niche = f.niche === undefined ? { id: 'n1' } : f.niche;
  const created: Row[] = [];

  const prisma = {
    productDocumentPack: { findFirst: vi.fn().mockResolvedValue(pack) },
    project: { update: vi.fn().mockResolvedValue({ id: 'research1', status: 'archived' }) },
    niche: { findFirst: vi.fn().mockResolvedValue(niche) },
    productPackGenerationJob: { findFirst: vi.fn().mockResolvedValue(f.job ?? null) },
    qualityGateResult: { findFirst: vi.fn().mockResolvedValue(f.gate ?? null) },
    ventureThesis: { findFirst: vi.fn().mockResolvedValue(f.venture ?? null) },
    opportunityFounderVerdict: {
      findUnique: vi.fn().mockResolvedValue(f.verdict ?? null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockImplementation(({ create }: { create: Row }) => Promise.resolve({ id: 'fv1', ...create })),
    },
    implementationProject: {
      findUnique: vi.fn().mockResolvedValue(f.existingProject ?? null),
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        const row = { id: 'ip1', ...data };
        created.push(row);
        return Promise.resolve(row);
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  } as unknown as PrismaService;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const svc = new ImplementationProjectsService(prisma, audit);
  return { svc, prisma, audit, created };
}

const buildReadyJob = { buildReady: true };
const passedGate = { status: 'passed' };
const ratedVerdict = { rating: 4, comment: 'I want this', decision: 'ready_to_commit' };
const fullCommit = { ambitionMode: 'cash_flow_business' as const, commitmentConfirmed: true, reviewedRisks: true };

describe('ImplementationProjectsService — founder verdict', () => {
  it('persists a 1–5 rating + comment per user', async () => {
    const { svc, prisma } = makeService();
    const res = await svc.upsertFounderVerdict('ws1', 'n1', 'user1', { rating: 5, comment: 'love it', decision: 'explore' });
    expect(res).toMatchObject({ rating: 5, comment: 'love it', decision: 'explore', userId: 'user1', nicheId: 'n1' });
    expect((prisma.opportunityFounderVerdict.upsert as any)).toHaveBeenCalledOnce();
  });

  it('keeps the founder verdict separate from AI score (never reads NicheScore)', async () => {
    const { svc, prisma } = makeService();
    await svc.getFounderVerdict('ws1', 'n1', 'user1');
    // The verdict path must not touch scoring tables.
    expect((prisma as any).nicheScore).toBeUndefined();
  });
});

describe('ImplementationProjectsService — promotion gate', () => {
  it('rejects when the pack is not build-ready (system gate)', async () => {
    const { svc } = makeService({ job: { buildReady: false }, gate: passedGate, verdict: ratedVerdict });
    await expect(svc.promote('ws1', 'pack1', 'user1', fullCommit)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the quality gate failed even if job flag is stale', async () => {
    const { svc } = makeService({ job: { buildReady: true }, gate: { status: 'failed' }, verdict: ratedVerdict });
    await expect(svc.promote('ws1', 'pack1', 'user1', fullCommit)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when founder commitment is missing (founder gate)', async () => {
    const { svc } = makeService({ job: buildReadyJob, gate: passedGate, verdict: ratedVerdict });
    await expect(
      svc.promote('ws1', 'pack1', 'user1', { ...fullCommit, commitmentConfirmed: false }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects when the committing founder has no own rating', async () => {
    const { svc } = makeService({ job: buildReadyJob, gate: passedGate, verdict: { rating: null } });
    await expect(svc.promote('ws1', 'pack1', 'user1', fullCommit)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates a project when build-ready + full founder commitment, snapshotting the verdict + ambition', async () => {
    const { svc, prisma, created, audit } = makeService({
      job: buildReadyJob,
      gate: passedGate,
      verdict: ratedVerdict,
      venture: { ventureScaleLevel: 'high', thesis: { killReasons: ['No distribution edge'] } },
    });
    const res = await svc.promote('ws1', 'pack1', 'user1', { ...fullCommit, ambitionMode: 'venture_scale' });
    expect(res).toBeTruthy();
    expect(created[0]).toMatchObject({
      packId: 'pack1',
      nicheId: 'n1',
      researchProjectId: 'research1',
      ambitionMode: 'venture_scale',
      founderRatingSnapshot: 4,
      buildReadySnapshot: true,
    });
    expect(created[0].topRisksSnapshot).toEqual(['No distribution edge']);
    expect((audit.record as any)).toHaveBeenCalledOnce();
    // Promoting an opportunity auto-archives the research context it came
    // from, so it drops out of the default "Opportunity Search" list.
    expect((prisma.project.update as any)).toHaveBeenCalledWith({
      where: { id: 'research1' },
      data: { status: 'archived' },
    });
  });

  it('is idempotent — returns the existing project instead of creating a duplicate, and does not re-archive', async () => {
    const existing = { id: 'ip-existing', packId: 'pack1' };
    const { svc, prisma, created } = makeService({ existingProject: existing, job: buildReadyJob, gate: passedGate, verdict: ratedVerdict });
    const res = await svc.promote('ws1', 'pack1', 'user1', fullCommit);
    expect(res).toBe(existing);
    expect(created).toHaveLength(0);
    expect((prisma.project.update as any)).not.toHaveBeenCalled();
  });

  it('404s for an unknown pack', async () => {
    const { svc } = makeService({ pack: null });
    await expect(svc.promote('ws1', 'nope', 'user1', fullCommit)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ImplementationProjectsService — readiness separation', () => {
  it('a cash-flow-ready pack is build-ready without venture/unicorn potential', async () => {
    const { svc } = makeService({ job: buildReadyJob, gate: passedGate, venture: { ventureScaleLevel: 'low' } });
    const r = await svc.readinessForPack('ws1', 'pack1');
    expect(r.buildReady).toBe(true);
    expect(r.ventureReady).toBe(false);
    expect(r.unicornPotential).toBe(false);
    expect(r.promotable).toBe(true);
  });

  it('venture-ready and unicorn-potential are independent of build readiness', async () => {
    const { svc } = makeService({ job: { buildReady: false }, gate: passedGate, venture: { ventureScaleLevel: 'high' } });
    const r = await svc.readinessForPack('ws1', 'pack1');
    expect(r.buildReady).toBe(false); // not build-ready …
    expect(r.ventureReady).toBe(true); // … yet still venture-ready
    expect(r.unicornPotential).toBe(true); // … and unicorn-potential
    expect(r.promotable).toBe(false); // build-ready is the promotion gate, not venture/unicorn
  });
});
