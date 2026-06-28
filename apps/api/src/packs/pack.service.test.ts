import { describe, it, expect, vi } from 'vitest';
import { PackService } from './pack.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { LlmRouterService } from '../llm/llm-router.service';

function makePrisma() {
  const docCreate = vi.fn().mockResolvedValue({ id: 'd' });
  const gateCreate = vi.fn().mockResolvedValue({ id: 'g', status: 'warnings' });
  const niche = {
    id: 'n1', workspaceId: 'w1', projectId: 'p1', title: 'Clinic Copilot', oneLiner: 'x', problem: 'p', targetAudience: 'clinics',
    whyNow: 'now', useCases: ['Book visits', 'Auto reply', 'Reminders'], competitors: ['c'], monetization: 'subs',
    mvpConcept: 'mvp', recommendedProductFormat: 'b2b_saas', riskLevel: 'medium',
    scores: [{ totalScore: 70, confidenceValue: 0.5, confidenceLevel: 'medium', explanation: 'e', breakdown: [] }],
  };
  const prisma = {
    niche: { findFirst: vi.fn().mockResolvedValue(niche) },
    project: { findUnique: vi.fn().mockResolvedValue({ targetCountry: 'TR', marketLanguage: 'tr', marketScope: 'manual_country', targetRegion: null }) },
    claim: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', text: 't', type: 'user_pain', confidenceLevel: 'high' }]) },
    assumption: { findMany: vi.fn().mockResolvedValue([]) },
    unresolvedQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    constraint: { findMany: vi.fn().mockResolvedValue([]) },
    evidenceItem: { findMany: vi.fn().mockResolvedValue([{ id: 'e1', summary: 's', sourceRefId: 's1' }]) },
    sourceReference: { findMany: vi.fn().mockResolvedValue([{ id: 's1', url: 'http://x', title: 't', adapter: 'url' }]) },
    productDocumentPack: { create: vi.fn().mockResolvedValue({ id: 'pk1', nicheId: 'n1', projectId: 'p1' }), update: vi.fn().mockResolvedValue({}) },
    productPackDocument: { create: docCreate, updateMany: vi.fn().mockResolvedValue({}) },
    qualityGateResult: { create: gateCreate },
    ventureThesis: { findFirst: vi.fn().mockResolvedValue(null) },
    buildBlueprint: { deleteMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({ id: 'bp1' }) },
  } as unknown as PrismaService;
  return { prisma, docCreate, gateCreate };
}

describe('PackService', () => {
  it('generates a full build-ready pack deterministically (no LLM), with metadata + quality gates', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const router = { run: vi.fn() } as unknown as LlmRouterService;
    const svc = new PackService(prisma, router);

    const out = await svc.generate('w1', 'n1', { depth: 'build_ready', vertical: 'b2b_saas' });
    // 27 canonical documents + 4 optional Session-14 blueprint documents.
    expect(out.documentCount).toBe(31);
    expect(docCreate).toHaveBeenCalledTimes(31);
    expect(gateCreate).toHaveBeenCalledTimes(1);

    // No direct LLM use when useLlm is not set.
    expect((router.run as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);

    // Each document carries the metadata contract.
    const firstDoc = docCreate.mock.calls[0]![0].data;
    expect(firstDoc.metadata.packDepth).toBe('build_ready');
    expect(firstDoc.metadata.verticalTemplate).toBe('b2b_saas');
    expect(firstDoc.metadata.claimIds).toContain('c1');
    expect(firstDoc.language).toBe('tr');
  });
});
