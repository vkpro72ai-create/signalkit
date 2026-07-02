import { describe, it, expect, vi } from 'vitest';
import { NichesService } from './niches.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EvidenceService } from '../evidence/evidence.service';
import type { LlmRouterService } from '../llm/llm-router.service';

function makeDeps(signals: unknown[]) {
  const nicheScoreCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sc1', ...data }));
  const nicheCreate = vi.fn().mockResolvedValue({ id: 'n1', projectId: 'p1', workspaceId: 'w1', title: 'Clinic AI Inbox', oneLiner: 'Inbox automation' });
  const ventureCreate = vi.fn().mockResolvedValue({ id: 'vt1' });
  const usageFindFirst = vi.fn().mockResolvedValue({ id: 'usage1', createdAt: new Date('2026-07-02T00:00:00.000Z') });
  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'p1',
        name: 'Opportunity Radar',
        goal: 'Find B2B AI opportunities',
        targetCountry: 'TR',
        marketLanguage: 'tr',
        defaultOutputLanguage: 'tr',
        marketScope: 'global',
        targetCountries: [],
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'p1',
        targetCountry: 'TR',
        marketLanguage: 'tr',
        defaultOutputLanguage: 'tr',
        marketScope: 'global',
        targetCountries: [],
      }),
    },
    trendSignal: { findMany: vi.fn().mockResolvedValue(signals) },
    niche: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: nicheCreate,
      findFirst: vi.fn().mockResolvedValue({ id: 'n1', projectId: 'p1', workspaceId: 'w1', language: 'tr', title: 'Clinic AI Inbox' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    evidenceItem: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    claim: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    contradiction: { count: vi.fn().mockResolvedValue(0) },
    scoringVersion: { findFirst: vi.fn().mockResolvedValue({ id: 'v1' }), create: vi.fn() },
    nicheScore: { create: nicheScoreCreate, findFirst: vi.fn() },
    unresolvedQuestion: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    assumption: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    ventureThesis: { deleteMany: vi.fn().mockResolvedValue({}), create: ventureCreate, findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    lLMUsageLog: { findFirst: usageFindFirst },
    buildBlueprint: { findMany: vi.fn().mockResolvedValue([]) },
    country: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  const evidence = { synthesize: vi.fn().mockResolvedValue({}), graph: vi.fn() } as unknown as EvidenceService;
  const router = {
    run: vi.fn().mockResolvedValue({
      provider: 'deepseek',
      modelId: 'deepseek-chat',
      taskType: 'niche_generation',
      content: JSON.stringify({
        opportunities: [
          {
            title: 'Clinic AI Inbox',
            oneLineThesis: 'Automate WhatsApp triage for clinics.',
            targetUser: 'Clinic operations teams',
            pain: 'Staff lose time replying manually.',
            whyNow: 'AI assistants can now handle multilingual clinic messaging.',
            market: 'Turkey',
            vertical: 'AI',
            opportunityScoreDraft: 71,
            confidenceDraft: 46,
            ventureScaleDraft: 63,
            buildReadinessDraft: 58,
            assumptions: ['Clinics will trust AI-first responses for inbound triage.'],
            risks: ['Incumbent EMR vendors may bundle similar workflows.'],
            validationQuestions: ['Will clinics route inbound chat to an external AI tool?'],
          },
        ],
      }),
      latencyMs: 1400,
      inputTokens: 320,
      outputTokens: 480,
      estimatedCost: 0.0042,
    }),
  } as unknown as LlmRouterService;
  return { prisma, evidence, router, nicheScoreCreate, nicheCreate, ventureCreate, usageFindFirst };
}

describe('NichesService', () => {
  it('uses LLM starter discovery when no signals exist instead of returning an empty list', async () => {
    const { prisma, evidence, router, nicheCreate } = makeDeps([]);
    const out = await new NichesService(prisma, evidence, router).discover('w1', 'p1');
    expect(out.niches).toBe(1);
    expect(router.run).toHaveBeenCalled();
    expect(evidence.synthesize).not.toHaveBeenCalled();
    expect(nicheCreate).toHaveBeenCalled();
  });

  it('uses signals plus evidence before LLM discovery and persists metadata-rich scores', async () => {
    const signals = [
      { signalType: 'demand', text: 'clinics want whatsapp automation', strengthScore: 0.8, freshnessScore: 1, sourceQuality: 0.6, topic: 'whatsapp automation' },
      { signalType: 'pain', text: 'staff overwhelmed by manual replies', strengthScore: 0.7, freshnessScore: 1, sourceQuality: 0.6, topic: 'whatsapp automation' },
    ];
    const { prisma, evidence, router, nicheScoreCreate } = makeDeps(signals);
    const out = await new NichesService(prisma, evidence, router).discover('w1', 'p1');
    expect(out.niches).toBe(1);
    expect(evidence.synthesize).toHaveBeenCalled();
    expect(router.run).toHaveBeenCalled();

    const scoreData = nicheScoreCreate.mock.calls[0]![0].data;
    expect(scoreData.breakdown).toHaveLength(4);
    expect(scoreData.totalScore).toBe(71);
    expect(scoreData.confidenceValue).toBeGreaterThan(0);
    expect(scoreData.explanation).toContain('LLM-assisted');
    expect(out.generation.provider).toBe('deepseek');
  });
});
