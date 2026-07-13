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
      count: vi.fn().mockResolvedValue(0),
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

  it('tells the model that output language is not evidence of target market/audience', async () => {
    const { prisma, evidence, router } = makeDeps([]);
    await new NichesService(prisma, evidence, router).discover('w1', 'p1', { language: 'ru' });

    const systemPrompt = router.run.mock.calls[0]![0].messages[0].content;
    const userPrompt = router.run.mock.calls[0]![0].messages[1].content;
    expect(systemPrompt).toMatch(/output language is only|not evidence of the target market/i);
    expect(userPrompt).toContain('this is only the language to write in');
  });

  describe('discover — brief completeness gate (mode: find_opportunities only)', () => {
    it('rejects with 422 opportunity_search_context_incomplete and lists every missing field, without calling the LLM', async () => {
      const { prisma, evidence, router } = makeDeps([]);
      await expect(
        new NichesService(prisma, evidence, router).discover('w1', 'p1', { mode: 'find_opportunities' }),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: 'opportunity_search_context_incomplete', errorCode: 'opportunity_search_context_incomplete', missingFields: ['topic', 'audience', 'productType'] },
      });
      expect(router.run).not.toHaveBeenCalled();
      expect(prisma.niche.deleteMany).not.toHaveBeenCalled();
      expect(prisma.niche.create).not.toHaveBeenCalled();
    });

    it('lists only the fields that are actually missing', async () => {
      const { prisma, evidence, router } = makeDeps([]);
      await expect(
        new NichesService(prisma, evidence, router).discover('w1', 'p1', {
          mode: 'find_opportunities',
          directions: ['AI / Automation'],
          productFormats: ['SaaS'],
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'opportunity_search_context_incomplete', missingFields: ['audience'] },
      });
      expect(router.run).not.toHaveBeenCalled();
    });

    it('treats "Any direction" (empty string) and whitespace-only values as not completed', async () => {
      const { prisma, evidence, router } = makeDeps([]);
      await expect(
        new NichesService(prisma, evidence, router).discover('w1', 'p1', {
          mode: 'find_opportunities',
          directions: [''],
          audiences: ['   '],
          productFormats: ['SaaS'],
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'opportunity_search_context_incomplete', missingFields: ['topic', 'audience'] },
      });
      expect(router.run).not.toHaveBeenCalled();
    });

    it('allows discovery once topic, audience, and product type are all present', async () => {
      const { prisma, evidence, router } = makeDeps([]);
      await new NichesService(prisma, evidence, router).discover('w1', 'p1', {
        mode: 'find_opportunities',
        directions: ['AI / Automation'],
        audiences: ['SMB owners'],
        productFormats: ['SaaS'],
      });
      expect(router.run).toHaveBeenCalledTimes(1);
    });

    it('does not gate the open-ended radar scan (no mode set) — an unrelated flow must not be affected', async () => {
      const { prisma, evidence, router } = makeDeps([]);
      await new NichesService(prisma, evidence, router).discover('w1', 'p1', { confirmReplace: false });
      expect(router.run).toHaveBeenCalledTimes(1);
    });
  });

  it('refuses to re-run discovery on a project with existing niches unless confirmReplace is set', async () => {
    const { prisma, evidence, router } = makeDeps([]);
    (prisma.niche.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    await expect(new NichesService(prisma, evidence, router).discover('w1', 'p1')).rejects.toMatchObject({
      response: { code: 'existing_niches_require_confirmation', existingNicheCount: 3 },
    });
    expect(router.run).not.toHaveBeenCalled();
    expect(prisma.niche.deleteMany).not.toHaveBeenCalled();

    await new NichesService(prisma, evidence, router).discover('w1', 'p1', { confirmReplace: true });
    expect(router.run).toHaveBeenCalledTimes(1);
    expect(prisma.niche.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } });
  });

  it('anchors discovery on the project goal with a prominent, labeled block', async () => {
    const { prisma, evidence, router } = makeDeps([]);
    await new NichesService(prisma, evidence, router).discover('w1', 'p1');

    const prompt = router.run.mock.calls[0]![0].messages[1].content;
    expect(prompt).toContain("FOUNDER'S STATED IDEA / GOAL");
    expect(prompt).toContain('Find B2B AI opportunities'); // project.goal from the mock
    const systemPrompt = router.run.mock.calls[0]![0].messages[0].content;
    expect(systemPrompt).toContain("FOUNDER'S STATED IDEA / GOAL");
  });

  describe('createFromIdea', () => {
    it('rejects an idea shorter than 40 characters without calling the LLM', async () => {
      const { prisma, evidence, router, nicheCreate } = makeDeps([]);
      await expect(
        new NichesService(prisma, evidence, router).createFromIdea('w1', 'p1', { founderIdea: 'Too short.' }),
      ).rejects.toMatchObject({ response: { code: 'founder_idea_too_short' } });
      expect(router.run).not.toHaveBeenCalled();
      expect(nicheCreate).not.toHaveBeenCalled();
    });

    it('develops a real, LLM-scored opportunity from the founder idea (not a hardcoded placeholder)', async () => {
      const { prisma, evidence, router, nicheCreate, nicheScoreCreate } = makeDeps([]);
      const idea =
        "A lifelong personal health companion app for women, with a personal AI agent that knows her from menarche to old age, tracks cycles, pregnancy, and relationships, and can share access with family or a doctor.";

      const out = await new NichesService(prisma, evidence, router).createFromIdea('w1', 'p1', { founderIdea: idea });

      expect(out.niches).toBe(1);
      expect(router.run).toHaveBeenCalledTimes(1);
      expect(prisma.niche.deleteMany).not.toHaveBeenCalled();

      const nicheData = nicheCreate.mock.calls[0]![0].data;
      expect(nicheData.intakeMode).toBe('founder_idea');
      expect(nicheData.founderIdeaText).toBe(idea);

      // Score/confidence come from the mocked LLM draft, not the old hardcoded 50/0.25 placeholder.
      const scoreData = nicheScoreCreate.mock.calls[0]![0].data;
      expect(scoreData.totalScore).toBe(71);
      expect(scoreData.confidenceValue).toBeCloseTo(0.46, 2);
      expect(scoreData.explanation).toContain('founder-supplied');

      const prompt = router.run.mock.calls[0]![0].messages[1].content;
      expect(prompt).toContain(idea);
      expect(prompt).toContain("FOUNDER'S IDEA");
    });

    it('tells the model not to infer target market/audience from the output language (regression: Russian idea should not force a Russian-speaking audience)', async () => {
      const { prisma, evidence, router } = makeDeps([]);
      const idea =
        "A lifelong personal health companion app for women, with a personal AI agent that knows her from menarche to old age and can share access with family or a doctor.";

      await new NichesService(prisma, evidence, router).createFromIdea('w1', 'p1', { founderIdea: idea, outputLanguage: 'ru' });

      const systemPrompt = router.run.mock.calls[0]![0].messages[0].content;
      const userPrompt = router.run.mock.calls[0]![0].messages[1].content;
      expect(systemPrompt).toMatch(/output language is only|not evidence of the target market/i);
      expect(userPrompt).toContain('this is only the language to write in');
    });
  });
});

describe('radarSummary', () => {
  const DAY = 24 * 60 * 60 * 1000;

  function makeRadarPrisma(overrides: {
    nicheCountTotal?: number;
    nicheCountThisWeek?: number;
    nicheCountPriorWeek?: number;
    scoresThisWeek?: number[];
    scoresPriorWeek?: number[];
    latestConfidenceValues?: number[];
    thesesThisWeek?: number[];
    thesesPriorWeek?: number[];
    latestVentureScaleScores?: number[];
    lastUsageAt?: Date | null;
    aiEngineName?: string | null;
  }) {
    const nicheCount = vi
      .fn()
      .mockResolvedValueOnce(overrides.nicheCountTotal ?? 0)
      .mockResolvedValueOnce(overrides.nicheCountThisWeek ?? 0)
      .mockResolvedValueOnce(overrides.nicheCountPriorWeek ?? 0);
    const nicheScoreFindMany = vi
      .fn()
      .mockResolvedValueOnce((overrides.scoresThisWeek ?? []).map((confidenceValue) => ({ confidenceValue })))
      .mockResolvedValueOnce((overrides.scoresPriorWeek ?? []).map((confidenceValue) => ({ confidenceValue })));
    const nicheFindMany = vi
      .fn()
      .mockResolvedValueOnce(
        (overrides.latestConfidenceValues ?? []).map((confidenceValue) => ({ scores: [{ confidenceValue }] })),
      )
      .mockResolvedValueOnce(
        (overrides.latestVentureScaleScores ?? []).map((ventureScaleScore) => ({ ventureTheses: [{ ventureScaleScore }] })),
      );
    const ventureThesisFindMany = vi
      .fn()
      .mockResolvedValueOnce((overrides.thesesThisWeek ?? []).map((ventureScaleScore) => ({ ventureScaleScore })))
      .mockResolvedValueOnce((overrides.thesesPriorWeek ?? []).map((ventureScaleScore) => ({ ventureScaleScore })));
    const prisma = {
      niche: { count: nicheCount, findMany: nicheFindMany },
      nicheScore: { findMany: nicheScoreFindMany },
      ventureThesis: { findMany: ventureThesisFindMany },
      lLMUsageLog: { findFirst: vi.fn().mockResolvedValue(overrides.lastUsageAt ? { createdAt: overrides.lastUsageAt } : null) },
      workspaceSettings: { findUnique: vi.fn().mockResolvedValue({ aiEngineName: overrides.aiEngineName ?? null }) },
    } as unknown as PrismaService;
    return prisma;
  }

  it('computes week-over-week deltas as real percent change, not fabricated numbers', async () => {
    const prisma = makeRadarPrisma({
      nicheCountTotal: 20,
      nicheCountThisWeek: 6,
      nicheCountPriorWeek: 4, // +50%
      scoresThisWeek: [0.8, 0.8], // avg 0.8
      scoresPriorWeek: [0.4, 0.4], // avg 0.4 -> +100%
      latestConfidenceValues: [0.6, 0.8], // current overall avg 0.7
      thesesThisWeek: [80, 80], // avg 80
      thesesPriorWeek: [40, 40], // avg 40 -> +100%
      latestVentureScaleScores: [60, 80], // current overall avg 70/100 -> 0.7 -> 'high'
    });
    const svc = new NichesService(prisma, {} as EvidenceService, {} as LlmRouterService);

    const out = await svc.radarSummary('w1', 'p1');

    expect(out.opportunitiesFound).toEqual({ total: 20, deltaPct: 50 });
    expect(out.avgConfidence.value).toBeCloseTo(0.7, 5);
    expect(out.avgConfidence.level).toBe('high');
    expect(out.avgConfidence.deltaPct).toBeCloseTo(100, 5);
    expect(out.investorInterest.level).toBe('high');
    expect(out.investorInterest.deltaPct).toBeCloseTo(100, 5);
  });

  it('returns a null delta (not 0, not a divide-by-zero NaN) when there is no prior-week data to compare against', async () => {
    const prisma = makeRadarPrisma({
      nicheCountTotal: 3,
      nicheCountThisWeek: 3,
      nicheCountPriorWeek: 0,
      scoresThisWeek: [0.5],
      scoresPriorWeek: [],
    });
    const svc = new NichesService(prisma, {} as EvidenceService, {} as LlmRouterService);

    const out = await svc.radarSummary('w1', 'p1');

    expect(out.opportunitiesFound.deltaPct).toBeNull();
    expect(out.avgConfidence.deltaPct).toBeNull();
    expect(Number.isNaN(out.opportunitiesFound.deltaPct as unknown as number)).toBe(false);
  });

  it('reports the AI engine as active only within the last 48h, and surfaces the configured display name honestly (no fabricated brand)', async () => {
    const activePrisma = makeRadarPrisma({ lastUsageAt: new Date(Date.now() - 1 * DAY), aiEngineName: 'Acme AI' });
    const svcActive = new NichesService(activePrisma, {} as EvidenceService, {} as LlmRouterService);
    const outActive = await svcActive.radarSummary('w1', 'p1');
    expect(outActive.aiEngine.active).toBe(true);
    expect(outActive.aiEngine.displayName).toBe('Acme AI');

    const stalePrisma = makeRadarPrisma({ lastUsageAt: new Date(Date.now() - 10 * DAY), aiEngineName: null });
    const svcStale = new NichesService(stalePrisma, {} as EvidenceService, {} as LlmRouterService);
    const outStale = await svcStale.radarSummary('w1', 'p1');
    expect(outStale.aiEngine.active).toBe(false);
    expect(outStale.aiEngine.displayName).toBeNull(); // frontend applies the translated default, not the backend
  });
});
