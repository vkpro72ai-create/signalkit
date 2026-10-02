import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import type { PrismaService } from '../prisma/prisma.service';

const ev = (id: string) => ({
  id, relevanceScore: 0.9, sourceQuality: 0.9, freshnessScore: 1, summary: id, sourceRefId: 'sref',
});

function makePrisma(over: Partial<Record<string, unknown>> = {}) {
  const store: Record<string, ReturnType<typeof ev>> = {};
  const claimCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data }));
  const linkCreate = vi.fn().mockResolvedValue({});
  const contradictionCreate = vi.fn().mockResolvedValue({});
  const evidenceCreate = vi.fn().mockImplementation(({ data }) => {
    const id = `e${Object.keys(store).length + 1}`;
    store[id] = { ...ev(id), sourceRefId: data.sourceRefId };
    return Promise.resolve(store[id]);
  });
  const prisma = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', marketLanguage: 'tr', targetCountry: 'TR' }) },
    trendSignal: { findMany: vi.fn().mockResolvedValue(over.signals ?? []) },
    claim: { deleteMany: vi.fn().mockResolvedValue({}), create: claimCreate, findUnique: vi.fn() },
    evidenceItem: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: evidenceCreate,
      findMany: vi.fn().mockImplementation(({ where }) => {
        const ids: string[] = where?.id?.in ?? [];
        return Promise.resolve(ids.map((id) => store[id] ?? ev(id)));
      }),
    },
    claimEvidenceLink: { create: linkCreate },
    contradiction: { create: contradictionCreate },
    assumption: { updateMany: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return { prisma, claimCreate, linkCreate, contradictionCreate, evidenceCreate };
}

describe('EvidenceService — trust rules', () => {
  it('REFUSES a claim with neither evidence nor assumption', async () => {
    const { prisma } = makePrisma();
    const svc = new EvidenceService(prisma);
    await expect(
      svc.createClaim('w1', { projectId: 'p1', text: 'demand is huge', type: 'market_demand' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an evidence-backed claim with computed confidence', async () => {
    const { prisma, claimCreate, linkCreate } = makePrisma();
    const svc = new EvidenceService(prisma);
    const { assessment } = await svc.createClaim('w1', {
      projectId: 'p1', text: 'demand observed', type: 'market_demand', supportingEvidenceIds: ['e1', 'e2'],
    });
    expect(assessment.grounding).toBe('evidence_backed');
    expect(claimCreate.mock.calls[0]![0].data.confidenceValue).toBeGreaterThan(0);
    expect(linkCreate).toHaveBeenCalledTimes(2);
  });

  it('records a visible Contradiction when contradicting evidence is linked', async () => {
    const { prisma, contradictionCreate } = makePrisma();
    const svc = new EvidenceService(prisma);
    await svc.createClaim('w1', {
      projectId: 'p1', text: 'low competition', type: 'competition',
      supportingEvidenceIds: ['e1'], contradictingEvidenceIds: ['e2'],
    });
    expect(contradictionCreate).toHaveBeenCalledTimes(1);
    expect(contradictionCreate.mock.calls[0]![0].data.suggestedQuestion).toBeTruthy();
  });

  it('allows an assumption-only claim (grounded by assumption, not evidence)', async () => {
    const { prisma } = makePrisma();
    const svc = new EvidenceService(prisma);
    const { assessment } = await svc.createClaim('w1', {
      projectId: 'p1', text: 'buyers will pay', type: 'willingness_to_pay', assumptionIds: ['a1'],
    });
    expect(assessment.grounding).toBe('assumption_only');
    expect(assessment.weak).toBe(true);
  });

  it('synthesize builds evidence traceable to the source and grounded claims', async () => {
    const { prisma, evidenceCreate, claimCreate } = makePrisma({
      signals: [
        { signalType: 'demand', text: 'people want offline mode', strengthScore: 0.8, freshnessScore: 1, sourceQuality: 0.6, sourceRefIds: ['sref-1'] },
        { signalType: 'pricing', text: '$10/mo seems high', strengthScore: 0.6, freshnessScore: 1, sourceQuality: 0.7, sourceRefIds: ['sref-2'] },
      ],
    });
    const svc = new EvidenceService(prisma);
    const out = await svc.synthesize('w1', 'p1');
    expect(out.claims).toBe(2); // demand + pricing → two claim types
    expect(evidenceCreate.mock.calls[0]![0].data.sourceRefId).toBe('sref-1'); // traceable, not fabricated
    expect(claimCreate).toHaveBeenCalled();
  });
});

describe('EvidenceService.scanForNiche — honest states, never fabricates', () => {
  function makeScanPrisma(over: { signals?: unknown[]; claims?: Array<{ id: string; confidenceLevel: string }> } = {}) {
    return {
      niche: { findFirst: vi.fn().mockResolvedValue({ id: 'n1', projectId: 'p1' }) },
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', marketLanguage: 'en', targetCountry: 'US' }) },
      trendSignal: { findMany: vi.fn().mockResolvedValue(over.signals ?? []) },
      claim: {
        deleteMany: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'c1', ...data })),
        findMany: vi.fn().mockResolvedValue(over.claims ?? []),
      },
      evidenceItem: {
        deleteMany: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({ id: 'e1' }),
        findMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve((where.id.in ?? []).map((id) => ({ id, relevanceScore: 0.9, sourceQuality: 0.9, freshnessScore: 1, summary: id, sourceRefId: 'sref-1' }))),
        ),
        count: vi.fn().mockResolvedValue((over.claims ?? []).length),
      },
      claimEvidenceLink: { create: vi.fn().mockResolvedValue({}) },
      contradiction: { count: vi.fn().mockResolvedValue(0) },
      assumption: { count: vi.fn().mockResolvedValue(0) },
      unresolvedQuestion: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
  }

  it('reports configuration_needed (with a concrete env-var hint) when nothing can be scanned and no adapter is configured', async () => {
    const svc = new EvidenceService(makeScanPrisma());
    const res = await svc.scanForNiche('w1', 'n1');
    expect(res.status).toBe('configuration_needed');
    // Never fabricates claims.
    expect((res as { claims?: number }).claims ?? 0).toBe(0);
    // Surfaces a concrete next step (env var to configure).
    expect(res.missingConfiguration.some((m) => Boolean(m.envVar))).toBe(true);
  });

  it('reports claims_found when grounded claims are synthesized from ingested signals', async () => {
    const svc = new EvidenceService(
      makeScanPrisma({
        signals: [{ signalType: 'demand', text: 'lots of demand', sourceRefIds: ['sref-1'], strengthScore: 0.9, freshnessScore: 1, sourceQuality: 0.9 }],
        claims: [{ id: 'c1', confidenceLevel: 'high' }],
      }),
    );
    const res = await svc.scanForNiche('w1', 'n1');
    expect(res.status).toBe('claims_found');
    expect(res.verifiedClaims).toBe(1);
  });
});
