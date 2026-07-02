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

  it('passes full context into the discovery prompt without hardcoded United States', async () => {
    const { prisma, evidence, router } = makeDeps([]);
    await new NichesService(prisma, evidence, router).discover('w1', 'p1', {
      directions: ['AI / Automation'],
      subthemes: ['multilingual support'],
      audiences: ['SMB owners'],
      productFormats: ['SaaS'],
      riskTolerance: 'medium',
      investorLens: true,
      language: 'en',
      mode: 'find_opportunities',
    });

    const prompt = router.run.mock.calls[0]![0].messages[1].content;
    expect(prompt).toContain('AI / Automation');
    expect(prompt).toContain('SMB owners');
    expect(prompt).toContain('SaaS');
    expect(prompt).toContain('Investor lens: enabled');
    expect(prompt).not.toContain('United States');
  });

  describe('createFromIdea', () => {
    it('creates a founder-supplied opportunity without sources', async () => {
      const { prisma, evidence, nicheCreate, nicheScoreCreate } = makeDeps([]);
      const svc = new NichesService(prisma, evidence, {} as unknown as LlmRouterService);

      const longIdea = 'A platform for small clinics in Eastern Europe to manage patient intake via WhatsApp with AI-driven triage, scheduling, and follow-up reminders — replacing manual receptionist workflows with a cost-effective subscription.';
      const result = await svc.createFromIdea('w1', 'p1', {
        founderIdea: longIdea,
        targetMarket: 'Eastern Europe',
        targetAudience: 'Small clinic owners',
        productFormat: 'saas',
        outputLanguage: 'ru',
        executionMode: 'both',
        evidenceMode: 'starter_hypothesis',
        riskTolerance: 'medium',
      });

      expect(result.id).toBe('n1');
      expect(result.name).toBeDefined();
      expect(result.opportunityScore).toBe(50);
      expect(result.confidence.level).toBe('low');
      expect(result.confidence.value).toBe(0.25);
      expect(result.generationMetadata?.mode).toBe('founder_idea');

      // Verify niche was created with founder metadata in mvpConcept
      expect(nicheCreate).toHaveBeenCalledTimes(1);
      const nicheData = nicheCreate.mock.calls[0]![0].data;
      expect(nicheData.language).toBe('ru');
      expect(nicheData.riskLevel).toBe('medium');
      expect(nicheData.problem).toContain('WhatsApp');
      
      // mvpConcept stores the founder meta JSON
      const meta = JSON.parse(nicheData.mvpConcept);
      expect(meta.signalKitFounderIdeaMeta).toBe(true);
      expect(meta.version).toBe(1);
      expect(meta.intakeMode).toBe('founder_idea');
      expect(meta.founderIdea).toBe(longIdea);
      expect(meta.executionMode).toBe('both');
      expect(meta.evidenceMode).toBe('starter_hypothesis');
      expect(meta.outputLanguage).toBe('ru');
      expect(meta.targetMarket).toBe('Eastern Europe');
      expect(meta.targetAudience).toBe('Small clinic owners');
      expect(meta.productFormat).toBe('saas');

      // Verify a starter-hypothesis score was created
      expect(nicheScoreCreate).toHaveBeenCalledTimes(1);
      const scoreData = nicheScoreCreate.mock.calls[0]![0].data;
      expect(scoreData.confidenceLevel).toBe('low');
      expect(scoreData.confidenceValue).toBe(0.25);
      expect(scoreData.totalScore).toBe(50);
      expect(scoreData.explanation).toContain('starter');
    });

    it('rejects founderIdea shorter than 50 characters', async () => {
      const { prisma, evidence } = makeDeps([]);
      const svc = new NichesService(prisma, evidence, {} as unknown as LlmRouterService);

      await expect(
        svc.createFromIdea('w1', 'p1', { founderIdea: 'Too short' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'founder_idea_too_short',
        }),
      });
    });

    it('defaults outputLanguage to project language when not provided', async () => {
      const { prisma, evidence, nicheCreate } = makeDeps([]);
      // Project has defaultOutputLanguage: 'tr'
      const svc = new NichesService(prisma, evidence, {} as unknown as LlmRouterService);

      const longIdea = 'A comprehensive platform for managing energy consumption in commercial buildings using IoT sensors and AI analytics, targeting facility managers in Europe and Middle East.';
      await svc.createFromIdea('w1', 'p1', { founderIdea: longIdea });

      const nicheData = nicheCreate.mock.calls[0]![0].data;
      expect(nicheData.language).toBe('tr');
      const meta = JSON.parse(nicheData.mvpConcept);
      expect(meta.outputLanguage).toBe('tr');
    });
  });
});
