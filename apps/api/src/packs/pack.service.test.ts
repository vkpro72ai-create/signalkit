import { describe, it, expect, vi } from 'vitest';
import { PackService } from './pack.service';
import { PRODUCT_PACK_V2_SECTIONS } from './prompts/product-pack-v2.sections';
import { PRODUCT_PACK_V2_STEPS, sectionsForStep } from './prompts/product-pack-v2.steps';
import type { PrismaService } from '../prisma/prisma.service';
import type { LlmRouterService } from '../llm/llm-router.service';

type StepDef = (typeof PRODUCT_PACK_V2_STEPS)[number];

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
    productDocumentPack: {
      create: vi.fn().mockResolvedValue({ id: 'pk1', nicheId: 'n1', projectId: 'p1' }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    productPackDocument: { create: docCreate, updateMany: vi.fn().mockResolvedValue({}) },
    qualityGateResult: { create: gateCreate, findMany: vi.fn().mockResolvedValue([]) },
    ventureThesis: { findFirst: vi.fn().mockResolvedValue(null) },
    buildBlueprint: { deleteMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({ id: 'bp1' }) },
    $transaction: vi.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaService;
  return { prisma, docCreate, gateCreate, packUpdate, tx };
}

interface StepJsonOptions {
  evidenceCount?: number;
  missingInputs?: string[];
  previewTitle?: boolean;
  unsourcedClaim?: boolean;
}

/** One step's `documents[]`, scoped to exactly that step's section keys — mirrors the contract in product-pack-v2.builder.ts. */
function makeStepDocuments(step: StepDef, options: StepJsonOptions = {}) {
  const evidenceCount = options.evidenceCount ?? 2;
  return sectionsForStep(step).map((section) => ({
    type: section.key,
    layer: section.layer,
    title: section.title,
    audience: ['founder', 'builder'],
    purpose: `Purpose for ${section.key}`,
    whatThisIs: `What ${section.key} is`,
    whyItExists: `Why ${section.key} exists`,
    howToUse: 'Use it as guidance.',
    connections: ['product_vision'],
    doneDefinition: ['Reviewed and approved'],
    sections: [
      {
        heading: 'Overview',
        content: options.unsourcedClaim && section.key === 'market_context'
          ? 'According to reports, this market is growing rapidly.'
          : `Content for ${section.key}`,
        examples: ['Example'],
        implementationNotes: ['Note'],
        assumptions: ['Assumption'],
        risks: ['Risk'],
        evidenceRefs: evidenceCount > 0 ? ['Source 1'] : [],
        sourceNeeds: [],
      },
    ],
    acceptanceCriteria: ['Criterion 1'],
  }));
}

/** Top-level fields a given step owns, beyond `documents[]` — mirrors each step's `extraFieldsContract`. */
function makeStepExtraFields(step: StepDef, options: StepJsonOptions = {}): Record<string, unknown> {
  switch (step.id) {
    case 'vision':
      return {
        packTitle: options.previewTitle ? 'Preview Pack' : 'Build-Ready Product Pack',
        oneLineThesis: 'A structured pack.',
        language: 'en',
        packType: 'build_ready_product_pack',
        ideaAmplification: { fullVision: 'Full vision', hiddenOpportunities: ['Opportunity'] },
        recommendedStrategy: { name: 'Primary strategy', strategicWedge: 'Wedge' },
      };
    case 'build_product':
      return {};
    case 'build_design':
      return {
        screenStoryboard: [
          { scenario: 's', userState: 'u', screen: 'Home', whatUserSees: [], primaryAction: 'a', systemBehavior: [], dataUsed: [], successState: 'ok', failureState: 'fail' },
        ],
        navigation: { home: {}, mainNavigation: [], settings: [], emptyStates: [], loadingStates: [], errorStates: [] },
      };
    case 'build_engineering':
      return {
        apiContracts: [{ name: 'GetThing', method: 'GET', path: '/thing', auth: 'bearer', request: {}, response: {}, sideEffects: [], errorCodes: [] }],
        dataModel: [{ entity: 'Thing', purpose: 'p', fields: [], relations: [] }],
      };
    case 'execution':
      return {
        executionPhases: [{ phase: 'Phase 1', goal: 'g', whatItBuilds: [], whatItProvesOrUnlocks: [], mustNotLoseFromFullVision: [], definitionOfDone: [] }],
        roleBriefs: {
          founder: ['Do this'], investor: ['Review this'], designer: ['Design this'], frontend: ['Build this'], backend: ['Implement this'],
          aiEngineer: ['Wire this'], qa: ['Test this'], growth: ['Launch this'], legalPrivacy: ['Check this'],
        },
      };
    case 'qira_backlog':
      return {
        executionHandoff: {
          qiraBacklogDraft: {
            projectTitle: 'Build-Ready Product Pack',
            projectDescription: 'A real, idea-specific backlog.',
            epics: [
              {
                title: 'Epic 1', description: 'd', sourceSections: [], priority: 'high', sprintHint: 'Sprint 1',
                tasks: [{ title: 'Task 1', description: 'd', ownerRole: 'backend', taskType: 'build', sourceSections: [], implementationNotes: [], filesHint: [], dependencies: [], acceptanceCriteria: [], qaChecks: [], doneDefinition: [] }],
                acceptanceCriteria: [], dependencies: [], doneDefinition: [],
              },
            ],
            sprints: [{ name: 'Sprint 1', goal: 'g', epicTitles: ['Epic 1'], taskTitles: ['Task 1'], definitionOfDone: [] }],
            dependencies: [], ownerRoles: ['backend'], labels: [], acceptanceCriteria: [], doneDefinition: [],
          },
        },
      };
    case 'ai_agent_bundle':
      return {
        executionHandoff: {
          aiAgentPromptBundleDraft: [
            {
              title: 'Prompt 1', targetAgent: 'claude_code', purpose: 'p',
              promptBody: 'Context:\nScope:\nOpen only:\nDo not:\nTask:\nAcceptance:\nTests:\nFinal report:',
              relatedSections: [], expectedFiles: [], tests: [], finalReportFormat: [],
            },
          ],
        },
      };
    case 'evidence':
      return {
        quality: {
          completenessScore: 92,
          confidenceScore: 88,
          assumptionCount: 1,
          evidenceCount: options.evidenceCount ?? 2,
          riskLevel: 'medium',
          missingInputs: options.missingInputs ?? [],
        },
        risks: [],
        exportAssets: [],
      };
  }
}

function makeStepPayload(step: StepDef, options: StepJsonOptions = {}) {
  return { documents: makeStepDocuments(step, options), ...makeStepExtraFields(step, options) };
}

function makeLlmResult(content: string, overrides: Record<string, unknown> = {}) {
  return {
    content,
    taskType: 'product_vision_generation',
    modelId: 'm1',
    provider: 'openai',
    usedFallback: false,
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 50,
    estimatedCost: 0.1,
    validation: { ok: true, issues: [] },
    ...overrides,
  };
}

/** Queues one successful mocked LLM response per pipeline step, in declared order. */
function mockAllStepsSucceed(options: StepJsonOptions = {}) {
  const routerRun = vi.fn();
  for (const step of PRODUCT_PACK_V2_STEPS) {
    routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step, options))));
  }
  return routerRun;
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
  it('listForNiche always includes documents (never undefined) and the latest quality gate, even with no Prisma relation for it', async () => {
    const { prisma } = makePrisma();
    (prisma.productDocumentPack.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'pk1', title: 'Pack One', documents: [{ id: 'd1' }, { id: 'd2' }] },
      { id: 'pk2', title: 'Pack Two', documents: [] },
    ]);
    (prisma.qualityGateResult.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'g1', packId: 'pk1', status: 'passed', createdAt: new Date('2026-07-02') },
      { id: 'g0', packId: 'pk1', status: 'failed', createdAt: new Date('2026-07-01') }, // older — must not win
    ]);
    const { router } = makeRouter();
    const svc = new PackService(prisma, router);

    const out = await svc.listForNiche('w1', 'n1');

    expect(out[0]!.documents).toHaveLength(2);
    expect(out[0]!.qualityGate?.status).toBe('passed'); // most recent, not the older failed one
    expect(out[1]!.documents).toHaveLength(0);
    expect(out[1]!.qualityGate).toBeNull(); // no gate rows for pk2 — must be null, not undefined
  });

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

  it('generates a v2 pack across sequential steps, in order, with a real (non-fabricated) executionHandoff', async () => {
    const { prisma, docCreate, gateCreate, tx } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    const out = await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    // Steps ran sequentially, in declared order, each with its own realistic output budget.
    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length);
    PRODUCT_PACK_V2_STEPS.forEach((step, index) => {
      expect(routerRun.mock.calls[index]![0].estimatedOutputTokens).toBe(step.maxOutputTokens);
    });

    expect(docCreate).toHaveBeenCalledTimes(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
    expect(out.pack.title).toBe('Build-Ready Product Pack');
    expect(docCreate.mock.calls[0]![0].data.body).toContain('#');
    expect(docCreate.mock.calls[0]![0].data.metadata.pack.packType).toBe('build_ready_product_pack');
    expect(docCreate.mock.calls[0]![0].data.metadata.layer).toBe('vision');

    // Final document order follows the canonical section order, not step order.
    const createdDocTypes = docCreate.mock.calls.map((call) => call[0].data.docType);
    expect(createdDocTypes).toEqual(PRODUCT_PACK_V2_SECTIONS.map((section) => section.key));

    // executionHandoff comes from the qira_backlog/ai_agent_bundle steps' real LLM output —
    // not the old hardcoded 3-epic/4-generic-prompt fabrication.
    const packMetadata = docCreate.mock.calls[0]![0].data.metadata.packMetadata;
    const updatedPackArgs = tx.productDocumentPack.update.mock.calls[0]![0].data;
    expect(updatedPackArgs.title).toBe('Build-Ready Product Pack');
    expect(packMetadata.packTitle).toBe('Build-Ready Product Pack');
    expect(packMetadata.executionHandoff.qiraBacklogDraft.projectTitle).toBe('Build-Ready Product Pack');
    expect(packMetadata.executionHandoff.qiraBacklogDraft.epics).toHaveLength(1);
    expect(packMetadata.executionHandoff.qiraBacklogDraft.epics[0].title).toBe('Epic 1');
    expect(packMetadata.executionHandoff.qiraBacklogDraft.epics[0].tasks[0].title).toBe('Task 1');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft).toHaveLength(1);
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Context:');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Scope:');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Open only:');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Do not:');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Task:');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Acceptance:');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Tests:');
    expect(packMetadata.executionHandoff.aiAgentPromptBundleDraft[0].promptBody).toContain('Final report:');
    expect((out.pack as Record<string, any>).metadata.packTitle).toBe('Build-Ready Product Pack');
  });

  it('carries a deterministic summary of completed steps into later steps prompts (sequential, not parallel)', async () => {
    const { prisma } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const firstStepPrompt = routerRun.mock.calls[0]![0].messages[1].content as string;
    expect(firstStepPrompt).toContain('This is the first step of this pack');

    const secondStepPrompt = routerRun.mock.calls[1]![0].messages[1].content as string;
    expect(secondStepPrompt).toContain('PRIOR LAYERS');
    expect(secondStepPrompt).toContain('Build-Ready Product Pack'); // vision step's packTitle summary
  });

  it('uses the verbatim founder idea as founderRequest when the niche came from createFromIdea', async () => {
    const { prisma } = makePrisma();
    const idea =
      "A lifelong personal health companion app for women, with a personal AI agent that knows her from menarche to old age and can share access with family or a doctor.";
    (prisma.niche.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'n1', workspaceId: 'w1', projectId: 'p1', title: "Women's Lifelong Health Companion", oneLiner: 'x', problem: 'p', targetAudience: 'women',
      whyNow: 'now', useCases: [], competitors: [], monetization: '', mvpConcept: 'mvp', recommendedProductFormat: 'mobile_app', riskLevel: 'medium',
      intakeMode: 'founder_idea', founderIdeaText: idea,
      scores: [{ totalScore: 70, confidenceValue: 0.5, confidenceLevel: 'medium', explanation: 'e', breakdown: [] }],
    });
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const userPrompt = routerRun.mock.calls[0]![0].messages[1].content;
    expect(userPrompt).toContain(idea);
  });

  it('repairs invalid JSON with one extra LLM call within a single step', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const [firstStep, ...restSteps] = PRODUCT_PACK_V2_STEPS;
    const routerRun = vi.fn();
    routerRun.mockResolvedValueOnce(makeLlmResult('not json', { outputTokens: 50 }));
    routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(firstStep!)), { outputTokens: 180 }));
    for (const step of restSteps) {
      routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });
    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length + 1);
    expect(routerRun.mock.calls[0]![0].estimatedOutputTokens).toBe(firstStep!.maxOutputTokens);
    expect(routerRun.mock.calls[1]![0].estimatedOutputTokens).toBe(firstStep!.maxOutputTokens);
    expect(docCreate).toHaveBeenCalledTimes(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
  });

  it('normalizes preview wording and keeps missing-source packs as warnings with starter-hypothesis evidence', async () => {
    const { prisma, docCreate, tx } = makePrisma();
    const routerRun = mockAllStepsSucceed({
      evidenceCount: 0,
      missingInputs: ['market sources'],
      previewTitle: true,
      unsourcedClaim: true,
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

  it('returns product_pack_v2_output_truncated when a step\'s generate and repair both hit the output cap with invalid JSON', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const firstStep = PRODUCT_PACK_V2_STEPS[0]!;
    const routerRun = vi.fn()
      .mockResolvedValueOnce(makeLlmResult('{"packTitle":"Build-Ready Product Pack"', { outputTokens: firstStep.maxOutputTokens }))
      .mockResolvedValueOnce(makeLlmResult('{"packTitle":"Build-Ready Product Pack"', { outputTokens: firstStep.maxOutputTokens }));
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'product_pack_v2_output_truncated',
        message: expect.stringContaining(firstStep.title),
      }),
    });
    expect(routerRun).toHaveBeenCalledTimes(2);
    expect(docCreate).not.toHaveBeenCalled();
    expect(gateCreate).not.toHaveBeenCalled();
  });

  it('persists documents from completed steps when a later step fails even after repair, instead of discarding everything', async () => {
    const { prisma, docCreate, gateCreate, tx } = makePrisma();
    const failingStepIndex = PRODUCT_PACK_V2_STEPS.findIndex((step) => step.id === 'qira_backlog');
    const completedSteps = PRODUCT_PACK_V2_STEPS.slice(0, failingStepIndex);
    const routerRun = vi.fn();
    for (const step of completedSteps) {
      routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
    }
    // qira_backlog: both generate and repair return non-truncated invalid JSON — step fails, pipeline stops here.
    routerRun.mockResolvedValueOnce(makeLlmResult('not json', { outputTokens: 10 }));
    routerRun.mockResolvedValueOnce(makeLlmResult('still not json', { outputTokens: 10 }));

    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const completedSectionCount = completedSteps.reduce((sum, step) => sum + step.sectionKeys.length, 0);
    expect(docCreate).toHaveBeenCalledTimes(completedSectionCount);
    expect(gateCreate).toHaveBeenCalledTimes(1);

    // Quality gate honestly reports the pack as incomplete (missing qira/ai-agent/evidence sections)...
    const gateArgs = gateCreate.mock.calls[0]![0].data;
    expect(gateArgs.status).toBe('failed');
    expect(gateArgs.checks.find((check: { id: string }) => check.id === 'structure-gate').status).toBe('fail');
    // ...but the pack row itself is still persisted as a usable draft, not wiped out.
    const updatedPackArgs = tx.productDocumentPack.update.mock.calls[0]![0].data;
    expect(updatedPackArgs.status).toBe('draft');
    expect(updatedPackArgs.title).toBe('Build-Ready Product Pack');
  });
});
