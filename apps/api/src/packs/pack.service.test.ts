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
  return { prisma, docCreate, docCreateMany, gateCreate, packUpdate, tx };
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
}

/**
 * A full, BCG-compliant fixture — real generation writes something like this
 * for every real pack; a one-line placeholder would (correctly) now fail
 * product_pack_shallow_bcg / product_pack_missing_bcg_scorecard /
 * product_pack_missing_star_upgrade / product_pack_missing_unicorn_path /
 * product_pack_missing_upgrade_table. See product-pack-v2-quality.test.ts
 * for the dedicated negative-case tests of each of those checks.
 */
const BCG_FIXTURE_CONTENT = `
A. Current BCG Position
Question Mark: market growth is strong, but competitive position, distribution advantage, and defensibility are not yet proven. Differentiation is moderate; timing favors the category.

B. BCG Scorecard
| Dimension | Score | Why | What raises it | Evidence needed |
|---|---|---|---|---|
| Market growth | 7 | Category demand rising | Confirm with data | Market data |
| Urgency of problem | 6 | Painful, not acute | Sharper wedge | Interviews |
| Willingness to pay | 5 | Unproven | Pricing test | WTP survey |
| Competitive gap | 6 | Incumbents generic | Differentiated workflow | Competitor teardown |
| Differentiation | 5 | Some, not defensible | Unique data loop | User research |
| Distribution | 4 | No channel proven | PLG loop | Channel experiment |
| Retention | 5 | Habit not formed | Daily trigger | Cohort data |
| Monetization | 5 | Hypothesis only | Tiered pricing | WTP data |
| Defensibility | 3 | No moat yet | Data/workflow moat | Usage data |
| Evidence confidence | 4 | Mostly assumption | Interviews | Source-backed claims |
| Venture scale | 5 | Plausible, not proven | Expansion path | Market sizing |
| Execution feasibility | 7 | Buildable now | N/A | N/A |

C. Current State Diagnosis
Not yet a Star because distribution and defensibility are unproven. Weak: retention loop, moat. Promising: market growth, execution feasibility. Dangerous assumption: willingness to pay. Could collapse into a Dog if distribution never lands; could break out if the data loop compounds.

D. Star Upgrade Strategy
Product upgrades: add a daily-use workflow and a compounding data loop, raising retention and defensibility.
Positioning upgrades: sharpen the category wedge and name the status-quo enemy, raising differentiation.
Distribution upgrades: build a product-led growth loop and a partnership channel, raising distribution.
Monetization upgrades: move to usage-based pricing with an enterprise tier, raising monetization strength.
Defensibility upgrades: accumulate a proprietary workflow/data moat over the first year, raising defensibility.

E. Unicorn-grade Upside Path
This could become a category leader if the data moat compounds and distribution proves repeatable — this requires proof and is not proven yet, and depends on evidence from the first user cohort.

F. Before / After Upgrade Table
| Dimension | Current score | Weakness | Upgrade move | Target score after upgrades | Why score improves |
|---|---|---|---|---|---|
| Market growth | 7 | None major | Confirm with data | 8 | Third-party validation |
| Competitive position | 6 | Generic incumbents | Sharper wedge | 8 | Differentiation increases |
| Distribution | 4 | No channel proven | PLG loop | 7 | Channel derisked |
| Retention | 5 | No habit loop | Daily workflow | 8 | Habit loop formed |
| Monetization | 5 | Pricing unproven | Usage-based tiers | 7 | Pricing tested |
| Moat | 3 | No moat | Data/workflow moat | 7 | Compounding data |
| Evidence confidence | 4 | Mostly assumption | Interviews + test | 7 | Evidence collected |
| Venture scale | 5 | Plausible only | Expansion proof | 7 | Expansion validated |
| Execution feasibility | 7 | None major | N/A | 8 | Team proven |

G. Final BCG Verdict
Current BCG position: Question Mark. Target: Star, with a unicorn-grade category-leader path as the maximum ambition. Top 5 moves: daily workflow, PLG channel, pricing tests, data moat, customer interviews. Top 5 proof points: retention data, channel CAC, pricing data, moat usage data, expansion signal. Top 5 risks: distribution failing, retention not forming, pricing rejection, fast incumbent copying, moat compounding too slowly.
`;

/** One step's `documents[]`, scoped to exactly that step's section keys — mirrors the contract in product-pack-v2.builder.ts. */
function makeStepDocuments(step: StepDef, options: StepJsonOptions = {}) {
  const evidenceCount = options.evidenceCount ?? 2;
  return sectionsForStep(step).map((section) => {
    const isBcg = section.key === 'bcg_opportunity_evaluation_star_upgrade';
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
          content: isBcg
            ? BCG_FIXTURE_CONTENT
            : options.unsourcedClaim && section.key === 'market_context'
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

  it('fails a pack the old way — every section structurally present, but the BCG evaluation is a bare label with no scorecard or upgrade plan', async () => {
    // Reproduces "the old bad report": structurally complete (every section
    // the pre-Task-2 gate checked for is there — the per-step schema
    // validator already rejects an outright-missing section before this
    // even reaches the quality gate, which is its own good defense), but the
    // BCG document is exactly the shallow one-liner this task was written to
    // catch. This is what passed before this task and must fail now.
    const { prisma, gateCreate } = makePrisma();
    const routerRun = vi.fn();
    for (const step of PRODUCT_PACK_V2_STEPS) {
      const payload = makeStepPayload(step);
      if (step.id === 'vision') {
        payload.documents = payload.documents.map((doc: { type: string; sections: unknown[] }) =>
          doc.type === 'bcg_opportunity_evaluation_star_upgrade'
            ? {
                ...doc,
                sections: [{
                  heading: 'BCG',
                  content: 'Current BCG Position: Question Mark.',
                  examples: [], implementationNotes: [], assumptions: [], risks: [], evidenceRefs: [], sourceNeeds: [],
                }],
              }
            : doc,
        );
      }
      routerRun.mockResolvedValueOnce(makeLlmResult(JSON.stringify(payload)));
    }
    const { router } = makeRouter(routerRun);
    const svc = new PackService(prisma, router);

    await svc.generate('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true });

    const gateArgs = gateCreate.mock.calls[0]![0].data;
    expect(gateArgs.status).toBe('failed');
    const checkIds = gateArgs.checks.filter((c: { status: string }) => c.status === 'fail').map((c: { id: string }) => c.id);
    expect(checkIds).toEqual(expect.arrayContaining([
      'product_pack_shallow_bcg',
      'product_pack_missing_bcg_scorecard',
      'product_pack_missing_star_upgrade',
      'product_pack_missing_unicorn_path',
      'product_pack_missing_upgrade_table',
    ]));
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

describe('PRODUCT_PACK_V2_SECTIONS — BCG / Star Upgrade', () => {
  it('includes the BCG Opportunity Evaluation & Star Upgrade Plan in the canonical section list', () => {
    const section = PRODUCT_PACK_V2_SECTIONS.find((s) => s.key === 'bcg_opportunity_evaluation_star_upgrade');
    expect(section).toBeDefined();
    expect(section!.title).toBe('BCG Opportunity Evaluation & Star Upgrade Plan');
    expect(section!.layer).toBe('vision');
  });

  it('runs the BCG Opportunity Evaluation in the vision step, before Strategic Product Paths', () => {
    const visionStep = PRODUCT_PACK_V2_STEPS.find((s) => s.id === 'vision')!;
    const bcgIndex = visionStep.sectionKeys.indexOf('bcg_opportunity_evaluation_star_upgrade');
    const pathsIndex = visionStep.sectionKeys.indexOf('strategic_product_paths');
    expect(bcgIndex).toBeGreaterThanOrEqual(0);
    expect(pathsIndex).toBeGreaterThan(bcgIndex);
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
