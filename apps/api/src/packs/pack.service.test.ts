import { describe, it, expect, vi } from 'vitest';
import { PackService } from './pack.service';
import { PRODUCT_PACK_V2_SECTIONS } from './prompts/product-pack-v2.sections';
import { PRODUCT_PACK_V2_STEPS, sectionsForStep } from './prompts/product-pack-v2.steps';
import type { PrismaService } from '../prisma/prisma.service';
import type { LlmRouterService } from '../llm/llm-router.service';

type StepDef = (typeof PRODUCT_PACK_V2_STEPS)[number];

function makePrisma() {
  const docCreate = vi.fn().mockResolvedValue({ id: 'd' });
  // The V2 pipeline persists all documents in one createMany() call (see
  // pack.service.ts) instead of one create() per document, to avoid
  // exceeding Prisma's interactive-transaction timeout on large packs.
  const docCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const gateCreate = vi.fn().mockResolvedValue({ id: 'g', status: 'warnings' });
  const packUpdate = vi.fn().mockResolvedValue({ id: 'pk1', nicheId: 'n1', projectId: 'p1', title: 'Build-Ready Product Pack' });
  const tx = {
    productPackDocument: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: docCreate,
      createMany: docCreateMany,
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
  // Interim (staged-availability) document rows created one createMany() call
  // per step — findMany() below hands each call's rows straight back (with a
  // synthetic id) so persistInterimStepDocuments() can resolve document ids.
  let interimDocSeq = 0;
  const interimDocCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const interimDocFindMany = vi.fn(async ({ where }: { where: { docType: { in: string[] } } }) =>
    where.docType.in.map((docType) => ({ id: `interim-${docType}-${interimDocSeq++}` })),
  );
  const stepUpsert = vi.fn().mockResolvedValue({});
  const jobCreate = vi.fn().mockResolvedValue({ id: 'job1' });
  const jobUpdate = vi.fn().mockResolvedValue({});
  const jobFindUnique = vi.fn().mockResolvedValue(null);
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
    productPackDocument: { create: docCreate, createMany: interimDocCreateMany, findMany: interimDocFindMany, updateMany: vi.fn().mockResolvedValue({}) },
    qualityGateResult: { create: gateCreate, findMany: vi.fn().mockResolvedValue([]) },
    ventureThesis: { findFirst: vi.fn().mockResolvedValue(null) },
    buildBlueprint: { deleteMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({ id: 'bp1' }) },
    productPackGenerationStep: { upsert: stepUpsert },
    productPackGenerationJob: { create: jobCreate, update: jobUpdate, findUnique: jobFindUnique },
    $transaction: vi.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaService;
  return { prisma, docCreate, docCreateMany, gateCreate, packUpdate, tx, interimDocCreateMany, interimDocFindMany, stepUpsert, jobCreate, jobUpdate, jobFindUnique };
}

/** Helper: the rows passed to the single createMany() call in a V2 test, or [] if it wasn't called. */
function createdDocRows(docCreateMany: ReturnType<typeof vi.fn>): Array<Record<string, any>> {
  const call = docCreateMany.mock.calls.at(-1) as [{ data: Array<Record<string, any>> }] | undefined;
  return call ? call[0].data : [];
}

interface StepJsonOptions {
  evidenceCount?: number;
  missingInputs?: string[];
  previewTitle?: boolean;
  unsourcedClaim?: boolean;
  bcgDocumentOverrides?: Record<string, unknown>;
}

/** One step's `documents[]`, scoped to exactly that step's section keys — mirrors the contract in product-pack-v2.builder.ts. */
function makeStepDocuments(step: StepDef, options: StepJsonOptions = {}) {
  const evidenceCount = options.evidenceCount ?? 2;
  return sectionsForStep(step).map((section) => {
    return {
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
            // Still padded past the shallow-content threshold — this branch
            // tests the unsourced-claim -> "Assumption / needs source:"
            // normalization, not section depth.
            ? 'According to reports, this market is growing rapidly. This section otherwise explains what it is, why it exists, who uses it, and how it connects to the rest of the product.'
            // Long enough to clear product_pack_section_too_shallow (>150 chars) —
            // real generation is always far longer than a one-line placeholder.
            : `Content for ${section.key}. This section explains what it is, why it exists, who uses it, and how it connects to the rest of the product, with product-specific detail a cold reader can act on.`,
          examples: ['Example'],
          implementationNotes: ['Note'],
          assumptions: ['Assumption'],
          risks: ['Risk'],
          evidenceRefs: evidenceCount > 0 ? ['Source 1'] : [],
          sourceNeeds: [],
        },
      ],
      acceptanceCriteria: ['Criterion 1'],
    };
  });
}

// ── BCG Opportunity Evaluation step fixture (structured, table-free contract
// — see product-pack-v2.steps.ts's BCG_STEP_DOCUMENT_CONTRACT). A full,
// schema-valid fixture — real generation writes something like this for
// every real pack; a shallow/incomplete one would (correctly) fail
// isValidBcgStructuredFields in pack.service.ts before ever reaching the
// content quality gate. See product-pack-v2-quality.test.ts for the
// dedicated negative-case tests of the content-quality checks, and the
// "BCG dedicated step" describe block below for schema-level negative cases.

const BCG_SCORECARD_DIMS = [
  'Market growth', 'Urgency of problem', 'Buyer/user willingness to pay', 'Competitive gap',
  'Differentiation', 'Distribution access', 'Retention / switching cost', 'Monetization strength',
  'Defensibility / moat', 'Evidence confidence', 'Venture scale potential', 'Execution feasibility',
];

const BCG_UPGRADE_TABLE_DIMS = [
  'Market growth', 'Competitive position', 'Distribution', 'Retention', 'Monetization',
  'Moat', 'Evidence confidence', 'Venture scale', 'Execution feasibility',
];

/** The `bcg_star_evaluation` step's single document — structured fields only, no markdown-in-JSON. */
function makeBcgStepDocument(overrides: Record<string, unknown> = {}) {
  return {
    type: 'bcg_opportunity_evaluation_star_upgrade',
    layer: 'vision',
    title: 'BCG Opportunity Evaluation & Star Upgrade Plan',
    audience: ['founder', 'investor'],
    purpose: 'Score this idea against BCG growth-share logic and lay out a Star upgrade plan.',
    whatThisIs: 'A structured, scored BCG evaluation of the founder idea.',
    whyItExists: 'To classify the opportunity honestly and show what raises it to Star / unicorn-grade.',
    howToUse: 'Use it to prioritize the upgrade moves that raise the weakest scorecard dimensions.',
    connections: ['founder_investor_vision'],
    doneDefinition: ['Reviewed and approved'],
    acceptanceCriteria: ['Every scorecard dimension has a real 0-10 score with rationale'],
    sections: [],
    bcg: {
      opportunityType: 'B2B',
      currentPosition: 'Question Mark',
      marketGrowthAssessment: 'Category demand is rising quickly among target buyers.',
      relativeCompetitivePosition: 'Incumbents are generic; this idea has a differentiated workflow wedge.',
      classificationRationale: 'Market growth is strong but competitive position, distribution advantage, and defensibility are not yet proven, which places this in the Question Mark quadrant.',
      starBlockers: ['No proven distribution channel', 'No defensibility moat yet'],
      starPotential: 'Could become a Star if the retention loop compounds into a data moat.',
      minimumAmbition: 'Star',
      maximumAmbition: 'Category leader',
    },
    scorecard: BCG_SCORECARD_DIMS.map((dimension, i) => ({
      dimension,
      currentScore: 4 + (i % 4),
      rationale: `${dimension} rationale specific to this idea.`,
      whatWouldRaiseIt: `What would raise ${dimension.toLowerCase()}.`,
      evidenceNeeded: `Evidence needed for ${dimension.toLowerCase()}.`,
    })),
    currentStateDiagnosis: {
      weakParts: ['Retention loop', 'Moat'],
      promisingParts: ['Market growth', 'Execution feasibility'],
      dangerousAssumptions: ['Willingness to pay'],
      dogRisks: ['Distribution never materializes'],
      breakoutTriggers: ['Retention loop compounds into a data moat'],
    },
    starUpgradeStrategy: {
      productUpgrades: ['Add a daily-use workflow and a compounding data loop, raising retention and defensibility.'],
      positioningUpgrades: ['Sharpen the category wedge and name the status-quo enemy, raising differentiation.'],
      distributionUpgrades: ['Build a product-led growth loop and a partnership channel, raising distribution.'],
      monetizationUpgrades: ['Move to usage-based pricing with an enterprise tier, raising monetization strength.'],
      defensibilityUpgrades: ['Accumulate a proprietary workflow/data moat over the first year, raising defensibility.'],
      evidenceUpgrades: ['Run 20 customer interviews and a pricing test before claiming venture scale.'],
    },
    unicornGradeUpsidePath: {
      categoryExpansionNeeded: 'Could expand into adjacent workflows if the core loop proves out, though this requires proof.',
      platformOrEcosystemMove: 'Could become a platform for partner integrations, not proven yet.',
      moatNeeded: 'A compounding data/workflow moat, which depends on evidence from the first user cohort.',
      distributionAdvantageNeeded: 'A repeatable PLG channel, still to validate.',
      pricingOrLtvPath: 'Usage-based pricing with expansion revenue, a hypothesis not yet tested.',
      productSurfaceExpansion: 'Could expand from a single workflow to a full suite, requires proof of the first wedge.',
      proofRequiredBeforeClaimingUpside: ['Retention cohort data', 'Channel CAC data'],
      investorBeliefTriggers: ['Compounding retention curve', 'Repeatable channel CAC'],
    },
    beforeAfterUpgradeTable: BCG_UPGRADE_TABLE_DIMS.map((dimension, i) => ({
      dimension,
      currentScore: 4 + (i % 4),
      weakness: `${dimension} weakness specific to this idea.`,
      upgradeMove: `Upgrade move to raise ${dimension.toLowerCase()}.`,
      targetScoreAfterUpgrades: 7 + (i % 2),
      whyScoreImproves: `Why ${dimension.toLowerCase()} improves after the upgrade move.`,
    })),
    finalBcgVerdict: {
      currentBcgPosition: 'Question Mark',
      targetBcgPositionAfterUpgrades: 'Star',
      topFiveMovesRequired: ['Build the daily workflow', 'Prove the PLG channel', 'Run pricing tests', 'Start the data moat', 'Run 20 customer interviews'],
      topFiveProofPointsRequired: ['Retention cohort data', 'Channel CAC', 'Pricing willingness data', 'Moat usage data', 'Expansion signal'],
      topFiveRisks: ['Distribution never proving out', 'Retention not forming', 'Pricing rejection', 'Incumbents copying fast', 'Data moat too slow to compound'],
    },
    ...overrides,
  };
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
  if (step.id === 'bcg_star_evaluation') {
    return { documents: [makeBcgStepDocument(options.bcgDocumentOverrides)] };
  }
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
    const { prisma, docCreateMany, gateCreate, tx } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    const out = await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    // Steps ran sequentially, in declared order, each with its own realistic output budget.
    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length);
    PRODUCT_PACK_V2_STEPS.forEach((step, index) => {
      expect(routerRun.mock.calls[index]![0].estimatedOutputTokens).toBe(step.maxOutputTokens);
    });

    // All documents persisted in a single createMany() call (not one create() per doc —
    // see pack.service.ts for why: avoids the Prisma interactive-transaction timeout).
    expect(docCreateMany).toHaveBeenCalledTimes(1);
    const docRows = createdDocRows(docCreateMany);
    expect(docRows).toHaveLength(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
    expect(out.pack.title).toBe('Build-Ready Product Pack');
    expect(docRows[0]!.body).toContain('#');
    expect(docRows[0]!.metadata.pack.packType).toBe('build_ready_product_pack');
    expect(docRows[0]!.metadata.layer).toBe('vision');

    // Final document order follows the canonical section order, not step order.
    const createdDocTypes = docRows.map((row) => row.docType);
    expect(createdDocTypes).toEqual(PRODUCT_PACK_V2_SECTIONS.map((section) => section.key));

    // executionHandoff comes from the qira_backlog/ai_agent_bundle steps' real LLM output —
    // not the old hardcoded 3-epic/4-generic-prompt fabrication.
    const packMetadata = docRows[0]!.metadata.packMetadata;
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
    const { prisma, docCreateMany, gateCreate } = makePrisma();
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
    expect(createdDocRows(docCreateMany)).toHaveLength(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
  });

  it('regenerates from scratch as a third attempt when a non-truncation JSON defect survives repair too', async () => {
    // Large responses occasionally have a one-off syntax defect that isn't
    // truncation and that a repair pass (re-editing the same broken text)
    // doesn't reliably fix either — a fresh regeneration often succeeds
    // where re-editing the same broken blob doesn't.
    const { prisma, docCreateMany, gateCreate } = makePrisma();
    const [firstStep, ...restSteps] = PRODUCT_PACK_V2_STEPS;
    const routerRun = vi.fn();
    routerRun.mockResolvedValueOnce(makeLlmResult('not json at all', { outputTokens: 500 }));
    routerRun.mockResolvedValueOnce(makeLlmResult('still not json', { outputTokens: 500 }));
    routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(firstStep!)), { outputTokens: 180 }));
    for (const step of restSteps) {
      routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length + 2); // generate + repair + regenerate for the first step
    expect(createdDocRows(docCreateMany)).toHaveLength(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
  });

  it('does not waste a regenerate attempt when the failure is truncation (same budget would just truncate again)', async () => {
    const { prisma, gateCreate } = makePrisma();
    const firstStep = PRODUCT_PACK_V2_STEPS[0]!;
    const routerRun = vi.fn()
      .mockResolvedValueOnce(makeLlmResult('{"documents":[', { outputTokens: firstStep.maxOutputTokens }))
      .mockResolvedValueOnce(makeLlmResult('{"documents":[', { outputTokens: firstStep.maxOutputTokens }));
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'product_pack_v2_output_truncated' }) });

    expect(routerRun).toHaveBeenCalledTimes(2); // no third (regenerate) call
    expect(gateCreate).not.toHaveBeenCalled();
  });

  it('self-heals a minor JSON syntax defect (trailing comma) without an extra LLM repair call', async () => {
    // Large multi-thousand-token responses occasionally have one syntax slip
    // even with the provider's JSON mode enabled — jsonrepair should fix
    // this class of error locally instead of spending a repair round-trip.
    // build_product has no extra top-level fields, so its JSON is exactly
    // {"documents":[...]} — a known shape to inject a trailing comma into.
    const { prisma, docCreateMany, gateCreate } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      const payload = JSON.stringify(makeStepPayload(step));
      const withDefect = step.id === 'build_product' ? payload.replace(/\]\}$/, ',]}') : payload;
      routerRun.mockResolvedValueOnce(makeLlmResult(withDefect));
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length); // no extra repair call needed
    expect(createdDocRows(docCreateMany)).toHaveLength(PRODUCT_PACK_V2_SECTIONS.length);
    expect(gateCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to positional section matching when the model drifts on "type" but the document count is exactly right', async () => {
    // Live-tested: generating in a non-English output language, the model
    // sometimes writes a generic/descriptive "type" (e.g. "vision_document")
    // instead of the exact section key, even though "title" and "type" are
    // both explicitly specified in the prompt. Since the prompt also asks
    // for documents in the same order as the section list, an exact count
    // match is a safe positional fallback instead of failing the step.
    const { prisma, docCreateMany, gateCreate } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      const payload = makeStepPayload(step);
      if (step.id === 'vision') {
        payload.documents = payload.documents.map((doc) => ({ ...doc, type: 'vision_document', title: 'Обобщённое видение' }));
      }
      routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(payload)));
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length); // no repair/regenerate call needed
    const docRows = createdDocRows(docCreateMany);
    expect(docRows).toHaveLength(PRODUCT_PACK_V2_SECTIONS.length);
    const visionStep = PRODUCT_PACK_V2_STEPS.find((s) => s.id === 'vision')!;
    const visionDocTypes = docRows.filter((row) => visionStep.sectionKeys.includes(row.docType)).map((row) => row.docType);
    expect(visionDocTypes.sort()).toEqual([...visionStep.sectionKeys].sort());
  });

  it('passes the export gate for a genuine, idea-specific pack title (not just the literal placeholder string)', async () => {
    // Regression: the export gate used to require packTitle to be exactly
    // the literal string "Build-Ready Product Pack", which meant every real
    // pack failed it once generation started producing genuine product
    // names (the system prompt explicitly asks for a real product identity,
    // e.g. "Экосистема «Спутница»: ...", not a generic placeholder).
    const { prisma, docCreateMany, gateCreate, tx } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      const payload = makeStepPayload(step);
      if (step.id === 'vision') payload.packTitle = 'Экосистема «Спутница»: от трекера до ИИ-ассистента';
      routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(payload)));
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length); // no repair needed over naming alone
    const gateArgs = gateCreate.mock.calls[0]![0].data;
    expect(gateArgs.checks.find((check: { id: string }) => check.id === 'export-gate').status).toBe('pass');
    const docRows = createdDocRows(docCreateMany);
    expect(docRows[0]!.metadata.packMetadata.qualityGates.exportGate).toBe('ready');
    const updatedPackArgs = tx.productDocumentPack.update.mock.calls[0]![0].data;
    expect(updatedPackArgs.title).toBe('Экосистема «Спутница»: от трекера до ИИ-ассистента');
  });

  it('normalizes preview wording and keeps missing-source packs as warnings with starter-hypothesis evidence', async () => {
    const { prisma, docCreateMany, tx } = makePrisma();
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
    const docRows = createdDocRows(docCreateMany);
    expect(docRows.find((row) => row.docType === 'market_context')!.body).toContain('Assumption / needs source:');
    const packMetadata = docRows[0]!.metadata.packMetadata;
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
    const { prisma, docCreateMany, gateCreate, tx } = makePrisma();
    const failingStepIndex = PRODUCT_PACK_V2_STEPS.findIndex((step) => step.id === 'qira_backlog');
    const completedSteps = PRODUCT_PACK_V2_STEPS.slice(0, failingStepIndex);
    const routerRun = vi.fn();
    for (const step of completedSteps) {
      routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
    }
    // qira_backlog: generate, repair, and regenerate all return non-truncated invalid JSON — step fails, pipeline stops here.
    routerRun.mockResolvedValueOnce(makeLlmResult('not json', { outputTokens: 10 }));
    routerRun.mockResolvedValueOnce(makeLlmResult('still not json', { outputTokens: 10 }));
    routerRun.mockResolvedValueOnce(makeLlmResult('really still not json', { outputTokens: 10 }));

    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const completedSectionCount = completedSteps.reduce((sum, step) => sum + step.sectionKeys.length, 0);
    expect(createdDocRows(docCreateMany)).toHaveLength(completedSectionCount);
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

  // ── Task 2: venture-grade content quality (BCG / Star Upgrade) ────────────

  it('fails product_pack_generic_upgrade_advice when the BCG step schema-validates but one upgrade item is generic filler', async () => {
    // The BCG step's own schema validation (isValidBcgStructuredFields in
    // pack.service.ts) already rejects outright-missing/empty/too-short
    // structured fields — including the same 40-char classificationRationale
    // and valid-quadrant checks the content-quality gate's shallow_bcg check
    // also makes, so a document that fails those can never even reach the
    // gate (see the "BCG dedicated step" describe block below for that
    // schema-level defense). This reproduces the one thing schema validation
    // does NOT catch: every field present and well-formed, but one upgrade
    // item is generic, unexplained filler — exactly what the content-quality
    // gate exists to catch.
    const { prisma, gateCreate } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      if (step.id === 'bcg_star_evaluation') {
        const weakBcgDoc = makeBcgStepDocument({
          starUpgradeStrategy: {
            productUpgrades: ['improve quality'], // generic, unexplained -> product_pack_generic_upgrade_advice
            positioningUpgrades: ['Sharpen the wedge and name the status-quo enemy, raising differentiation.'],
            distributionUpgrades: ['Build a PLG loop and a partnership channel, raising distribution.'],
            monetizationUpgrades: ['Move to usage-based pricing with an enterprise tier, raising monetization.'],
            defensibilityUpgrades: ['Accumulate a proprietary data moat over the first year, raising defensibility.'],
            evidenceUpgrades: ['Run 20 customer interviews and a pricing test before claiming venture scale.'],
          },
        });
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify({ documents: [weakBcgDoc] })));
      } else {
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
      }
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const gateArgs = gateCreate.mock.calls[0]![0].data;
    expect(gateArgs.status).toBe('failed');
    const checkIds = gateArgs.checks.filter((c: { status: string }) => c.status === 'fail').map((c: { id: string }) => c.id);
    expect(checkIds).toEqual(expect.arrayContaining(['product_pack_generic_upgrade_advice']));
  });

  it('passes a genuinely deep, BCG-evaluated pack as a whole', async () => {
    const { prisma, gateCreate } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const gateArgs = gateCreate.mock.calls[0]![0].data;
    const failed = gateArgs.checks.filter((c: { status: string }) => c.status === 'fail');
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });
});

describe('PackService — BCG dedicated step (structured, table-free contract)', () => {
  it('generates the BCG Opportunity Evaluation as its own step, right after vision, not bundled into the vision call', async () => {
    const { prisma, docCreateMany } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const visionIndex = PRODUCT_PACK_V2_STEPS.findIndex((s) => s.id === 'vision');
    const bcgIndex = PRODUCT_PACK_V2_STEPS.findIndex((s) => s.id === 'bcg_star_evaluation');
    expect(bcgIndex).toBe(visionIndex + 1);

    // Vision step's own prompt no longer asks for the BCG section.
    const visionPrompt = routerRun.mock.calls[visionIndex]![0].messages[1].content as string;
    expect(visionPrompt).not.toContain('bcg_opportunity_evaluation_star_upgrade');

    // The dedicated step's prompt does, with the structured (table-free) contract.
    const bcgPrompt = routerRun.mock.calls[bcgIndex]![0].messages[1].content as string;
    expect(bcgPrompt).toContain('bcg_opportunity_evaluation_star_upgrade');
    expect(bcgPrompt).toContain('scorecard');
    expect(bcgPrompt).toContain('Do NOT write markdown tables');

    // Exactly one BCG document is ever persisted.
    const docRows = createdDocRows(docCreateMany);
    const bcgDocRows = docRows.filter((row) => row.docType === 'bcg_opportunity_evaluation_star_upgrade');
    expect(bcgDocRows).toHaveLength(1);
  });

  it('renders the structured scorecard and before/after table into markdown tables in the saved document body', async () => {
    const { prisma, docCreateMany } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const docRows = createdDocRows(docCreateMany);
    const bcgRow = docRows.find((row) => row.docType === 'bcg_opportunity_evaluation_star_upgrade')!;
    expect(bcgRow.body).toContain('| Dimension | Score | Rationale | What would raise it | Evidence needed |');
    expect(bcgRow.body).toContain('| Dimension | Current score | Weakness | Upgrade move | Target score after upgrades | Why score improves |');
    expect(bcgRow.body).toContain('Market growth');
    // The structured JSON itself (not just the rendered markdown) is preserved for downstream consumers.
    expect(bcgRow.metadata.document.scorecard).toHaveLength(BCG_SCORECARD_DIMS.length);
    expect(bcgRow.metadata.document.beforeAfterUpgradeTable).toHaveLength(BCG_UPGRADE_TABLE_DIMS.length);
  });

  it('rejects a BCG step response with more than one document instead of silently keeping the first', async () => {
    const { prisma } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      if (step.id === 'bcg_star_evaluation') {
        const twoDocs = JSON.stringify({ documents: [makeBcgStepDocument(), makeBcgStepDocument()] });
        routerRun.mockResolvedValueOnce(makeLlmResult(twoDocs, { outputTokens: 500 }));
        routerRun.mockResolvedValueOnce(makeLlmResult(twoDocs, { outputTokens: 500 })); // repair also invalid
      } else {
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
      }
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'product_pack_bcg_step_failed' }) });
  });

  it('recovers via exactly one BCG-only repair pass when the first attempt is invalid JSON', async () => {
    const { prisma, gateCreate } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      if (step.id === 'bcg_star_evaluation') {
        routerRun.mockResolvedValueOnce(makeLlmResult('not json', { outputTokens: 50 }));
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify({ documents: [makeBcgStepDocument()] }), { outputTokens: 500 }));
      } else {
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
      }
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    // Generate + one repair for the BCG step, no third (regenerate) attempt — see runBcgStep in pack.service.ts.
    expect(routerRun).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length + 1);
    expect(gateCreate).toHaveBeenCalledTimes(1);
  });

  it('fails the pack with product_pack_bcg_step_failed (not a fake fallback) when generate and repair both fail', async () => {
    const { prisma, docCreate, gateCreate } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      if (step.id === 'bcg_star_evaluation') {
        routerRun.mockResolvedValueOnce(makeLlmResult('not json', { outputTokens: 50 }));
        routerRun.mockResolvedValueOnce(makeLlmResult('still not json', { outputTokens: 50 }));
      } else {
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
      }
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'product_pack_bcg_step_failed' }) });

    // No regenerate-from-scratch call for the BCG step (generate + repair only).
    const visionIndex = PRODUCT_PACK_V2_STEPS.findIndex((s) => s.id === 'vision');
    expect(routerRun).toHaveBeenCalledTimes(visionIndex + 1 + 2);
    expect(docCreate).not.toHaveBeenCalled();
    expect(gateCreate).not.toHaveBeenCalled();
  });

  it('fails product_pack_bcg_step_failed when the scorecard is schema-invalid (shallow BCG output) on both attempts', async () => {
    const { prisma } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      if (step.id === 'bcg_star_evaluation') {
        const shallow = JSON.stringify({ documents: [makeBcgStepDocument({ scorecard: [] })] });
        routerRun.mockResolvedValueOnce(makeLlmResult(shallow, { outputTokens: 500 }));
        routerRun.mockResolvedValueOnce(makeLlmResult(shallow, { outputTokens: 500 }));
      } else {
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
      }
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'product_pack_bcg_step_failed' }) });
  });

  it('fails product_pack_bcg_step_failed when unicornGradeUpsidePath is missing on both attempts', async () => {
    const { prisma } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      if (step.id === 'bcg_star_evaluation') {
        const missingUnicorn = JSON.stringify({ documents: [makeBcgStepDocument({ unicornGradeUpsidePath: undefined })] });
        routerRun.mockResolvedValueOnce(makeLlmResult(missingUnicorn, { outputTokens: 500 }));
        routerRun.mockResolvedValueOnce(makeLlmResult(missingUnicorn, { outputTokens: 500 }));
      } else {
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
      }
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'product_pack_bcg_step_failed' }) });
  });

  it('fails product_pack_bcg_step_failed when the before/after upgrade table is missing on both attempts', async () => {
    const { prisma } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      if (step.id === 'bcg_star_evaluation') {
        const missingTable = JSON.stringify({ documents: [makeBcgStepDocument({ beforeAfterUpgradeTable: [] })] });
        routerRun.mockResolvedValueOnce(makeLlmResult(missingTable, { outputTokens: 500 }));
        routerRun.mockResolvedValueOnce(makeLlmResult(missingTable, { outputTokens: 500 }));
      } else {
        routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
      }
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(
      svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'product_pack_bcg_step_failed' }) });
  });
});

describe('PRODUCT_PACK_V2_SECTIONS — BCG / Star Upgrade', () => {
  it('includes the BCG Opportunity Evaluation & Star Upgrade Plan in the canonical section list', () => {
    const section = PRODUCT_PACK_V2_SECTIONS.find((s) => s.key === 'bcg_opportunity_evaluation_star_upgrade');
    expect(section).toBeDefined();
    expect(section!.title).toBe('BCG Opportunity Evaluation & Star Upgrade Plan');
    expect(section!.layer).toBe('vision');
  });

  it('runs the BCG Opportunity Evaluation as its own dedicated step, immediately after the vision step (not bundled into it)', () => {
    const visionStep = PRODUCT_PACK_V2_STEPS.find((s) => s.id === 'vision')!;
    const bcgStep = PRODUCT_PACK_V2_STEPS.find((s) => s.id === 'bcg_star_evaluation')!;
    expect(visionStep.sectionKeys).not.toContain('bcg_opportunity_evaluation_star_upgrade');
    expect(bcgStep.sectionKeys).toEqual(['bcg_opportunity_evaluation_star_upgrade']);
    expect(PRODUCT_PACK_V2_STEPS.indexOf(bcgStep)).toBe(PRODUCT_PACK_V2_STEPS.indexOf(visionStep) + 1);
  });
});

// ── PackService.amendDocumentV2 / isV2Document ───────────────────────────────

const VALID_V2_DOCUMENT = {
  type: 'product_vision',
  layer: 'build',
  title: 'Product Vision',
  audience: ['founder'],
  purpose: 'p',
  whatThisIs: 'w',
  whyItExists: 'w',
  howToUse: 'h',
  connections: [],
  doneDefinition: ['d'],
  sections: [
    { heading: 'Overview', content: 'c', examples: [], implementationNotes: [], assumptions: [], risks: [], evidenceRefs: [], sourceNeeds: [] },
  ],
  acceptanceCriteria: ['a'],
};

function makeAmendPrisma(docMetadata: Record<string, unknown> = { document: VALID_V2_DOCUMENT }) {
  const doc = { id: 'doc1', packId: 'pk1', docType: 'product_vision', title: 'Product Vision', language: 'en', metadata: docMetadata };
  const pack = { id: 'pk1', workspaceId: 'w1', projectId: 'p1', primaryLanguage: 'en' };
  return {
    prisma: {
      productPackDocument: { findFirst: vi.fn().mockResolvedValue(doc) },
      productDocumentPack: { findFirst: vi.fn().mockResolvedValue(pack) },
    } as unknown as PrismaService,
    doc,
    pack,
  };
}

describe('PackService.isV2Document', () => {
  it('is true only when metadata.document is a complete, valid V2 document', () => {
    const { router } = makeRouter();
    const svc = new PackService({} as PrismaService, router);
    expect(svc.isV2Document({ metadata: { document: VALID_V2_DOCUMENT } })).toBe(true);
    expect(svc.isV2Document({ metadata: {} })).toBe(false);
    expect(svc.isV2Document({ metadata: null })).toBe(false);
    expect(svc.isV2Document({ metadata: { document: { title: 'incomplete' } } })).toBe(false);
  });
});

describe('PackService.amendDocumentV2', () => {
  it('amends a document incorporating instructions, preserving type/layer, and returns a matching markdown body', async () => {
    const { prisma } = makeAmendPrisma();
    const amended = { ...VALID_V2_DOCUMENT, title: 'Product Vision (updated)', sections: [{ ...VALID_V2_DOCUMENT.sections[0], content: 'updated content' }] };
    const run = vi.fn().mockResolvedValueOnce(makeLlmResult(JSON.stringify(amended)));
    const { router } = makeRouter(run);
    const svc = new PackService(prisma, router);

    const result = await svc.amendDocumentV2('w1', 'pk1', 'doc1', ['Please clarify the pricing section']);

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.document.title).toBe('Product Vision (updated)');
    expect(result.document.type).toBe('product_vision');
    expect(result.body).toContain('Product Vision (updated)');
    expect(result.body).toContain('updated content');
  });

  it('falls back to one repair call on invalid JSON, then throws if the repair also fails', async () => {
    const { prisma } = makeAmendPrisma();
    const run = vi.fn()
      .mockResolvedValueOnce(makeLlmResult('not json'))
      .mockResolvedValueOnce(makeLlmResult('still not json'));
    const { router } = makeRouter(run);
    const svc = new PackService(prisma, router);

    await expect(svc.amendDocumentV2('w1', 'pk1', 'doc1', [])).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('recovers via the repair call when only the first attempt is invalid', async () => {
    const { prisma } = makeAmendPrisma();
    const run = vi.fn()
      .mockResolvedValueOnce(makeLlmResult('not json'))
      .mockResolvedValueOnce(makeLlmResult(JSON.stringify(VALID_V2_DOCUMENT)));
    const { router } = makeRouter(run);
    const svc = new PackService(prisma, router);

    const result = await svc.amendDocumentV2('w1', 'pk1', 'doc1', []);
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.document.title).toBe('Product Vision');
  });

  it('refuses to amend a legacy (non-V2) document rather than silently producing wrong output', async () => {
    const { prisma } = makeAmendPrisma({});
    const { router } = makeRouter();
    const svc = new PackService(prisma, router);
    await expect(svc.amendDocumentV2('w1', 'pk1', 'doc1', [])).rejects.toThrow();
  });
});

// ── Task 3: async job-based generation — per-step progress + staged availability ──

const JOB_SHAPE = { id: 'job1', workspaceId: 'w1', nicheId: 'n1', packId: 'pk1', depth: 'quick_opportunity', verticalTemplate: 'b2b_saas', language: null as string | null };

describe('PackService.createPackShellForJob', () => {
  it('creates the pack row and resolves context without running any pipeline step (no LLM calls)', async () => {
    const { prisma } = makePrisma();
    const { router, run } = makeRouter();
    const svc = new PackService(prisma, router);

    const { pack, ctx, projectId } = await svc.createPackShellForJob('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    expect(pack.id).toBe('pk1');
    expect(projectId).toBe('p1');
    expect(ctx.niche.title).toBe('Clinic Copilot');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('PackService.generateV2ForJob — per-step progress tracking + staged availability', () => {
  it('persists each step\'s documents incrementally and marks every step row completed with timing/provider/model/attempt data', async () => {
    const { prisma, interimDocCreateMany, stepUpsert } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    const result = await svc.generateV2ForJob(JOB_SHAPE);

    expect(result.allStepsCompleted).toBe(true);
    // One interim createMany() per step, each scoped to that step's own documents.
    expect(interimDocCreateMany).toHaveBeenCalledTimes(PRODUCT_PACK_V2_STEPS.length);
    const bcgInterimCall = interimDocCreateMany.mock.calls.find((call: any) =>
      (call[0].data as Array<{ docType: string }>).some((row) => row.docType === 'bcg_opportunity_evaluation_star_upgrade'),
    );
    expect(bcgInterimCall).toBeDefined();

    // Every step got a "running" upsert then a "completed" upsert (2 calls each, none left pending).
    const completedCalls = stepUpsert.mock.calls.filter((call: any) => call[0].create.status === 'completed' || call[0].update.status === 'completed');
    expect(completedCalls).toHaveLength(PRODUCT_PACK_V2_STEPS.length);
    for (const call of completedCalls) {
      const patch = call[0].update;
      expect(patch.durationMs).toBeGreaterThanOrEqual(0);
      expect(patch.provider).toBeTruthy();
      expect(patch.model).toBeTruthy();
      expect(patch.attemptCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(patch.documentIds)).toBe(true);
    }
  });

  it('tracks the BCG step\'s own progress row explicitly (completed, attemptCount 1, repairCount 0 on a clean run)', async () => {
    const { prisma, stepUpsert } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generateV2ForJob(JOB_SHAPE);

    const bcgCompleted = stepUpsert.mock.calls.find((call: any) => call[0].where.jobId_stepKey.stepKey === 'bcg_star_evaluation' && call[0].update.status === 'completed');
    expect(bcgCompleted).toBeDefined();
    expect(bcgCompleted![0].update.attemptCount).toBe(1);
    expect(bcgCompleted![0].update.repairCount).toBe(0);
  });

  it('tracks repairCount/attemptCount when a step needs one repair pass', async () => {
    const { prisma, stepUpsert } = makePrisma();
    const [firstStep, ...restSteps] = PRODUCT_PACK_V2_STEPS;
    const routerRun = vi.fn();
    routerRun.mockResolvedValueOnce(makeLlmResult('not json', { outputTokens: 50 }));
    routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(firstStep!)), { outputTokens: 180 }));
    for (const step of restSteps) routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generateV2ForJob(JOB_SHAPE);

    const firstStepCompleted = stepUpsert.mock.calls.find((call: any) => call[0].where.jobId_stepKey.stepKey === firstStep!.id && call[0].update.status === 'completed');
    expect(firstStepCompleted![0].update.attemptCount).toBe(2);
    expect(firstStepCompleted![0].update.repairCount).toBe(1);
  });

  it('marks a failed step with an error code/reason instead of leaving it pending', async () => {
    const { prisma, stepUpsert } = makePrisma();
    const firstStep = PRODUCT_PACK_V2_STEPS[0]!;
    const routerRun = vi.fn()
      .mockResolvedValueOnce(makeLlmResult('{"documents":[', { outputTokens: firstStep.maxOutputTokens }))
      .mockResolvedValueOnce(makeLlmResult('{"documents":[', { outputTokens: firstStep.maxOutputTokens }));
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await expect(svc.generateV2ForJob(JOB_SHAPE)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'product_pack_v2_output_truncated' }),
    });

    const failedCall = stepUpsert.mock.calls.find((call: any) => call[0].where.jobId_stepKey.stepKey === firstStep.id && call[0].update.status === 'failed');
    expect(failedCall).toBeDefined();
    expect(failedCall![0].update.errorCode).toBeTruthy();
    expect(failedCall![0].update.errorReason).toBeTruthy();
  });

  it('reports allStepsCompleted=false (partially generated, not build-ready) when a later non-BCG step fails after repair+regenerate', async () => {
    const { prisma } = makePrisma();
    const failingStepIndex = PRODUCT_PACK_V2_STEPS.findIndex((step) => step.id === 'qira_backlog');
    const completedSteps = PRODUCT_PACK_V2_STEPS.slice(0, failingStepIndex);
    const routerRun = vi.fn();
    for (const step of completedSteps) routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(makeStepPayload(step))));
    routerRun.mockResolvedValueOnce(makeLlmResult('not json', { outputTokens: 10 }));
    routerRun.mockResolvedValueOnce(makeLlmResult('still not json', { outputTokens: 10 }));
    routerRun.mockResolvedValueOnce(makeLlmResult('really still not json', { outputTokens: 10 }));
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    const result = await svc.generateV2ForJob(JOB_SHAPE);

    expect(result.allStepsCompleted).toBe(false);
    // buildReady is computed by PackGenerationJobService as allStepsCompleted && gate !== 'failed' —
    // an incomplete pack must never compute true regardless of gate status.
    const wouldBeBuildReady = result.allStepsCompleted && result.qualityGate.status !== 'failed';
    expect(wouldBeBuildReady).toBe(false);
  });

  it('reports allStepsCompleted=true for a fully generated pack (build-ready once the gate is not a hard fail)', async () => {
    const { prisma } = makePrisma();
    const routerRun = mockAllStepsSucceed();
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    const result = await svc.generateV2ForJob(JOB_SHAPE);

    expect(result.allStepsCompleted).toBe(true);
    expect(result.qualityGate.status).not.toBe('failed');
  });
});
