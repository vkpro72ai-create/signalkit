import { describe, it, expect, vi } from 'vitest';
import { NichesService } from './niches.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EvidenceService } from '../evidence/evidence.service';

function makeDeps(signals: unknown[]) {
  const nicheScoreCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sc1', ...data }));
  const nicheCreate = vi.fn().mockResolvedValue({ id: 'n1', projectId: 'p1', workspaceId: 'w1' });
  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'p1', targetCountry: 'TR', marketLanguage: 'tr', targetCountries: [] }),
      findUnique: vi.fn().mockResolvedValue({ id: 'p1', targetCountry: 'TR', marketLanguage: 'tr', targetCountries: [] }),
    },
    trendSignal: { findMany: vi.fn().mockResolvedValue(signals) },
    niche: { deleteMany: vi.fn().mockResolvedValue({}), create: nicheCreate, findFirst: vi.fn().mockResolvedValue({ id: 'n1', projectId: 'p1', workspaceId: 'w1' }) },
    evidenceItem: { findMany: vi.fn().mockResolvedValue([]) },
    claim: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    contradiction: { count: vi.fn().mockResolvedValue(0) },
    scoringVersion: { findFirst: vi.fn().mockResolvedValue({ id: 'v1' }), create: vi.fn() },
    nicheScore: { create: nicheScoreCreate, findFirst: vi.fn() },
    unresolvedQuestion: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    assumption: { findMany: vi.fn().mockResolvedValue([]) },
    // Session 14: score() recomputes the Venture Thesis (separate score).
    ventureThesis: { deleteMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({ id: 'vt1' }) },
  } as unknown as PrismaService;
  const evidence = { synthesize: vi.fn().mockResolvedValue({}) } as unknown as EvidenceService;
  return { prisma, evidence, nicheScoreCreate, nicheCreate };
}

describe('NichesService', () => {
  it('does NOT invent niches when there are no signals', async () => {
    const { prisma, evidence, nicheCreate } = makeDeps([]);
    const out = await new NichesService(prisma, evidence).discover('w1', 'p1');
    expect(out).toEqual({ niches: 0, message: 'no_signals' });
    expect(nicheCreate).not.toHaveBeenCalled();
  });

  it('discovers a niche from real signals and scores it with a full breakdown', async () => {
    const signals = [
      { signalType: 'demand', text: 'clinics want whatsapp automation', strengthScore: 0.8, freshnessScore: 1, sourceQuality: 0.6, topic: 'whatsapp automation' },
      { signalType: 'pain', text: 'staff overwhelmed by manual replies', strengthScore: 0.7, freshnessScore: 1, sourceQuality: 0.6, topic: 'whatsapp automation' },
    ];
    const { prisma, evidence, nicheScoreCreate, nicheCreate } = makeDeps(signals);
    const out = await new NichesService(prisma, evidence).discover('w1', 'p1');
    expect(out.niches).toBe(1);
    expect(evidence.synthesize).toHaveBeenCalled(); // evidence built from signals first
    expect(nicheCreate).toHaveBeenCalled();

    const scoreData = nicheScoreCreate.mock.calls[0]![0].data;
    expect(scoreData.breakdown).toHaveLength(17); // no score without a breakdown
    expect(typeof scoreData.totalScore).toBe('number');
    // Opportunity and confidence are SEPARATE persisted fields.
    expect(typeof scoreData.confidenceValue).toBe('number');
    expect(scoreData.confidenceValue).toBeLessThanOrEqual(1);
    expect(scoreData.explanation).toContain('Confidence');
  });
});
