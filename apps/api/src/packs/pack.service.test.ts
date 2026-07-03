import { describe, it, expect, vi } from 'vitest';
import { PackService } from './pack.service';
import { DEPTH_DOCUMENTS } from './templates';
import { PRODUCT_PACK_V2_SECTIONS } from './prompts/product-pack-v2.sections';
import type { PrismaService } from '../prisma/prisma.service';
import type { LlmRouterService } from '../llm/llm-router.service';

function makePrisma() {
  const docCreate = vi.fn().mockResolvedValue({ id: 'd' });
  const gateCreate = vi.fn().mockResolvedValue({ id: 'g', status: 'warnings' });
  const packUpdate = vi.fn().mockResolvedValue({ id: 'pk1', nicheId: 'n1', projectId: 'p1', title: 'Build-Ready Product Pack' });
  const tx = {
    productPackDocument: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: docCreate,
      updateMany: vi.fn().mockResolvedValue({}),
    },
    qualityGateResult: { create: gateCreate },
    productDocumentPack: {
      update: packUpdate,
    },
  };
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
    $transaction: vi.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaService;
  return { prisma, docCreate, gateCreate, packUpdate, tx };
}

function makePackV2Json(options?: { evidenceCount?: number; missingInputs?: string[]; previewTitle?: boolean; unsourcedClaim?: boolean }) {
  const evidenceCount = options?.evidenceCount ?? 2;
  const previewTitle = options?.previewTitle ?? false;
  const unsourcedClaim = options?.unsourcedClaim ?? false;
  return {
    packTitle: previewTitle ? 'Preview Pack' : 'Build-Ready Product Pack',
    oneLineThesis: 'A structured pack.',
    language: 'en',
    packType: 'build_ready_product_pack',
    ideaAmplification: {
      fullVision: 'Full vision',
      hiddenOpportunities: ['Opportunity'],
      underratedFeatures: ['Feature'],
      competitorGaps: ['Gap'],
      categoryCreationPotential: 'High',
      largestUpsideScenario: 'Large outcome',
    },
    recommendedStrategy: {
      name: 'Primary strategy',
      whyThisPath: 'Why',
      whyNotOnlyMvp: 'Because',
      strategicWedge: 'Wedge',
      expansionPath: ['Expand'],
    },
    quality: {
      completenessScore: 92,
      confidenceScore: 88,
      assumptionCount: 1,
      evidenceCount,
      riskLevel: 'medium',
      missingInputs: options?.missingInputs ?? [],
    },
    documents: PRODUCT_PACK_V2_SECTIONS.map((section) => ({
      type: section.key,
      title: section.title,
      audience: ['founder', 'builder'],
      purpose: `Purpose for ${section.key}`,
      howToUse: 'Use it as guidance.',
      connections: ['product_vision'],
      sections: [
        {
          heading: 'Overview',
          content: unsourcedClaim && section.key === 'market_context'
            ? 'According to reports, this market is growing rapidly.'
            : `Content for ${section.key}`,
          examples: ['Example'],
          implementationNotes: ['Note'],
          assumptions: ['Assumption'],
          risks: ['Risk'],
          evidenceRefs: evidenceCount > 0 ? ['Source 1'] : [],
        },
      ],
      acceptanceCriteria: ['Criterion 1'],
    })),
    roleBriefs: {
      founder: ['Do this'],
      investor: ['Review this'],
      designer: ['Design this'],
      frontend: ['Build this'],
      backend: ['Implement this'],
      aiEngineer: ['Wire this'],
      qa: ['Test this'],
      growth: ['Launch this'],
      legalPrivacy: ['Check this'],
    },
    screenStoryboard: [],
    navigation: { home: {}, mainNavigation: [], settings: [], emptyStates: [], errorStates: [] },
    apiContracts: [],
    dataModel: [],
    risks: [],
    executionPhases: [],
    exportAssets: [],
  };
}

function makeRouter(run = vi.fn()) {
  const resolveTaskOutputBudget = vi.fn().mockResolvedValue(48_000);
  return {
    router: {
      run,
      resolveTaskOutputBudget,
    } as unknown as LlmRouterService,
    run,
    resolveTaskOutputBudget,
  };
}

describe('PackService', () => {
  it('generates a full build-ready pack deterministically (no LLM), with metadata + quality gates', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const { router, run } = makeRouter();
    const svc = new PackService(prisma, router);

    const out = await svc.generate('w1', 'n1', { depth: 'build_ready', vertical: 'b2b_saas' });
    // 27 canonical documents + 4 optional Session-14 blueprint documents.
    expect(out.documentCount).toBe(31);
    expect(docCreate).toHaveBeenCalledTimes(31);
    expect(gateCreate).toHaveBeenCalledTimes(1);

    // No direct LLM use when useLlm is not set.
    expect(run.mock.calls.length).toBe(0);

    // Each document carries the metadata contract.
    const firstDoc = docCreate.mock.calls[0]![0].data;
    expect(firstDoc.metadata.packDepth).toBe('build_ready');
    expect(firstDoc.metadata.verticalTemplate).toBe('b2b_saas');
    expect(firstDoc.metadata.claimIds).toContain('c1');
    expect(firstDoc.language).toBe('tr');
  });

  it('generates a v2 pack with one LLM call and stores structured JSON docs', async () => {
    const { prisma, docCreate, gateCreate, tx } = makePrisma();
    const routerRun = vi.fn().mockResolvedValue({
      content: JSON.stringify(makePackV2Json()),
      taskType: 'product_vision_generation',
      modelId: 'm1',
      provider: 'openai',
      usedFallback: false,
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 50,
      estimatedCost: 0.1,
      validation: { ok: true, issues: [] },
    });
    const { router, resolveTaskOutputBudget } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    const out = await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });
    expect(routerRun).toHaveBeenCalledTimes(1);
    expect(routerRun.mock.calls[0]![0].estimatedOutputTokens).toBe(48_000);
    expect(resolveTaskOutputBudget).toHaveBeenCalledWith('product_vision_generation', 'm1', 48_000);
    expect(docCreate).toHaveBeenCalledTimes(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
    expect(out.pack.title).toBe('Build-Ready Product Pack');
    expect(docCreate.mock.calls[0]![0].data.body).toContain('#');
    expect(docCreate.mock.calls[0]![0].data.metadata.pack.packType).toBe('build_ready_product_pack');
    expect(docCreate.mock.calls[0]![0].data.docType).toBe(PRODUCT_PACK_V2_SECTIONS[0]!.key);
    expect(docCreate.mock.calls[0]![0].data.metadata.document.title).toBe(PRODUCT_PACK_V2_SECTIONS[0]!.title);
    expect(docCreate.mock.calls[0]![0].data.metadata.layer).toBe('vision');
    const createdDocTypes = docCreate.mock.calls.map((call) => call[0].data.docType);
    expect(createdDocTypes).toEqual(PRODUCT_PACK_V2_SECTIONS.map((section) => section.key));
    expect(createdDocTypes.indexOf('founder_investor_vision')).toBeLessThan(createdDocTypes.indexOf('mvp_scope'));
    expect(createdDocTypes.indexOf('expansion_paths')).toBeLessThan(createdDocTypes.indexOf('execution_phasing'));
    expect(createdDocTypes).toEqual(
      expect.arrayContaining([
        'product_vision',
        'market_context',
        'user_buyer_role_model',
        'target_audience_icp',
        'jobs_to_be_done',
        'problem_map',
        'user_scenarios',
        'feature_checklist',
        'mvp_scope',
        'ux_flow',
        'screen_map',
        'designer_pack',
        'frontend_pack',
        'backend_pack',
        'data_model',
        'api_integration_requirements',
        'ai_agent_pack',
        'qa_acceptance_pack',
        'growth_monetization_pack',
        'execution_phasing',
        'team_handoff',
        'qira_ready_backlog_draft',
        'ai_agent_prompt_bundle_draft',
      ]),
    );
    const firstPackMetadata = docCreate.mock.calls[0]![0].data.metadata.packMetadata;
    const updatedPackArgs = tx.productDocumentPack.update.mock.calls[0]![0].data;
    expect(updatedPackArgs.title).toBe('Build-Ready Product Pack');
    expect(firstPackMetadata.packTitle).toBe('Build-Ready Product Pack');
    expect(firstPackMetadata.executionHandoff.mode).toBe('team_studio_and_ai_agent');
    expect(firstPackMetadata.executionHandoff.qiraBacklogDraft.projectTitle).toBe('Build-Ready Product Pack');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft.length).toBeGreaterThan(0);
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Context:');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Scope:');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Open only:');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Do not:');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Task:');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Acceptance:');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Tests:');
    expect(firstPackMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Final report:');
    expect((out.pack as Record<string, any>).metadata.packTitle).toBe('Build-Ready Product Pack');
  });

  it('repairs invalid JSON with one extra LLM call', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const routerRun = vi.fn()
      .mockResolvedValueOnce({
        content: 'not json',
        taskType: 'product_vision_generation',
        modelId: 'm1',
        provider: 'openai',
        usedFallback: false,
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 50,
        estimatedCost: 0.1,
        validation: { ok: true, issues: [] },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(makePackV2Json()),
        taskType: 'product_vision_generation',
        modelId: 'm1',
        provider: 'openai',
        usedFallback: false,
        inputTokens: 80,
        outputTokens: 180,
        latencyMs: 45,
        estimatedCost: 0.08,
        validation: { ok: true, issues: [] },
      });
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });
    expect(routerRun).toHaveBeenCalledTimes(2);
    expect(routerRun.mock.calls[0]![0].estimatedOutputTokens).toBe(48_000);
    expect(routerRun.mock.calls[1]![0].estimatedOutputTokens).toBe(48_000);
    expect(docCreate).toHaveBeenCalledTimes(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
  });

  it('normalizes preview wording and keeps missing-source packs as warnings with starter-hypothesis evidence', async () => {
    const { prisma, docCreate, tx } = makePrisma();
    const routerRun = vi.fn().mockResolvedValue({
      content: JSON.stringify(makePackV2Json({
        evidenceCount: 0,
        missingInputs: ['market sources'],
        previewTitle: true,
        unsourcedClaim: true,
      })),
      taskType: 'product_vision_generation',
      modelId: 'm1',
      provider: 'openai',
      usedFallback: false,
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 50,
      estimatedCost: 0.1,
      validation: { ok: true, issues: [] },
    });
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    const out = await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });
    expect(out.qualityGate.status).toBe('warnings');
    expect(docCreate.mock.calls.find((call) => call[0].data.docType === 'market_context')![0].data.body).toContain('Assumption / needs source:');
    const packMetadata = docCreate.mock.calls[0]![0].data.metadata.packMetadata;
    const updatedPackArgs = tx.productDocumentPack.update.mock.calls[0]![0].data;
    expect(updatedPackArgs.title).toBe('Build-Ready Product Pack');
    expect(packMetadata.packTitle).toBe('Build-Ready Product Pack');
    expect(packMetadata.qualityGates.evidenceGate).toBe('starter_hypothesis');
    expect(packMetadata.qualityGates.structureGate).toBe('complete');
    expect((out.pack as Record<string, any>).metadata.qualityGates.evidenceGate).toBe('starter_hypothesis');
  });

  it('returns a visible LLM failure and does not create a fake fallback pack for useLlm=true', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const routerRun = vi.fn().mockRejectedValue(new Error('llm_model_not_configured'));
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'product_pack_v2_generation_failed',
        message: 'llm_model_not_configured',
      }),
    });
    expect(routerRun).toHaveBeenCalledTimes(1);
    expect(docCreate).not.toHaveBeenCalled();
    expect(gateCreate).not.toHaveBeenCalled();
  });

  it('returns product_pack_v2_output_truncated when both attempts hit the output cap with invalid JSON', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const routerRun = vi.fn()
      .mockResolvedValueOnce({
        content: '{"packTitle":"Build-Ready Product Pack"',
        taskType: 'product_vision_generation',
        modelId: 'm1',
        provider: 'openai',
        usedFallback: false,
        inputTokens: 100,
        outputTokens: 48_000,
        latencyMs: 50,
        estimatedCost: 0.1,
        validation: { ok: true, issues: [] },
      })
      .mockResolvedValueOnce({
        content: '{"packTitle":"Build-Ready Product Pack"',
        taskType: 'product_vision_generation',
        modelId: 'm1',
        provider: 'openai',
        usedFallback: false,
        inputTokens: 100,
        outputTokens: 48_000,
        latencyMs: 45,
        estimatedCost: 0.08,
        validation: { ok: true, issues: [] },
      });
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'product_pack_v2_output_truncated',
        message: expect.stringContaining('truncated Product Pack JSON'),
      }),
    });
    expect(docCreate).not.toHaveBeenCalled();
    expect(gateCreate).not.toHaveBeenCalled();
  });
});
