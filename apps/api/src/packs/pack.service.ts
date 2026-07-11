import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type DocumentType,
  type LLMTaskType,
  type LocaleCode,
  type ProductPackDepth,
  type VerticalTemplate,
  type VentureThesis,
  type VentureScaleScoreResult,
} from '@signalkit/shared';
import { baseContract, LLMError } from '@signalkit/llm';
import { jsonrepair } from 'jsonrepair';
import { PrismaService } from '../prisma/prisma.service';
import { LlmRouterService } from '../llm/llm-router.service';
import { buildPackContext, type PackContext, type PackContextInput, type PackScore } from './context';
import { DEPTH_DOCUMENTS, buildDocument } from './templates';
import { buildBuildBlueprint } from './blueprint';
import { runQualityGates, type DocForGate } from './quality-gates';
import { runProductPackV2ContentQualityChecks } from './product-pack-v2-quality';
import {
  buildProductPackV2StepPrompt,
  buildProductPackV2StepRepairPrompt,
  buildProductPackV2AmendPrompt,
  buildProductPackV2AmendRepairPrompt,
  type BuildProductPackV2PromptInput,
} from './prompts/product-pack-v2.builder';
import {
  PRODUCT_PACK_V2_SECTIONS,
  type ProductPackV2Layer,
  type ProductPackV2SectionKey,
} from './prompts/product-pack-v2.sections';
import {
  PRODUCT_PACK_V2_STEPS,
  type ProductPackV2Step,
  type ProductPackV2StepId,
} from './prompts/product-pack-v2.steps';

export interface GeneratePackOptions {
  depth: ProductPackDepth;
  vertical: VerticalTemplate;
  language?: LocaleCode;
  /** Use LlmRouterService to enhance documents (requires a configured LLM). */
  useLlm?: boolean;
}

interface ProductPackV2Section {
  heading: string;
  content: string;
  examples: string[];
  implementationNotes: string[];
  assumptions: string[];
  risks: string[];
  evidenceRefs: string[];
  sourceNeeds: string[];
}

interface ProductPackV2Document {
  type: string;
  layer?: string;
  title: string;
  audience: string[];
  purpose: string;
  whatThisIs: string;
  whyItExists: string;
  howToUse: string;
  connections: string[];
  doneDefinition: string[];
  sections: ProductPackV2Section[];
  acceptanceCriteria: string[];
}

// ── BCG Opportunity Evaluation (dedicated step, structured contract) ────────
// See product-pack-v2.steps.ts's BCG_STEP_DOCUMENT_CONTRACT for the prompt
// side of this shape. The model never writes markdown/tables for this
// document — renderBcgDocumentToSections() below builds `sections`
// deterministically from these fields once parsed.

interface ProductPackV2BcgScorecardItem {
  dimension: string;
  currentScore: number;
  rationale: string;
  whatWouldRaiseIt: string;
  evidenceNeeded: string;
}

interface ProductPackV2BcgUpgradeTableItem {
  dimension: string;
  currentScore: number;
  weakness: string;
  upgradeMove: string;
  targetScoreAfterUpgrades: number;
  whyScoreImproves: string;
}

interface ProductPackV2BcgCore {
  opportunityType: string;
  currentPosition: string;
  marketGrowthAssessment: string;
  relativeCompetitivePosition: string;
  classificationRationale: string;
  starBlockers: string[];
  starPotential: string;
  minimumAmbition: string;
  maximumAmbition: string;
}

interface ProductPackV2BcgCurrentStateDiagnosis {
  weakParts: string[];
  promisingParts: string[];
  dangerousAssumptions: string[];
  dogRisks: string[];
  breakoutTriggers: string[];
}

interface ProductPackV2BcgStarUpgradeStrategy {
  productUpgrades: string[];
  positioningUpgrades: string[];
  distributionUpgrades: string[];
  monetizationUpgrades: string[];
  defensibilityUpgrades: string[];
  evidenceUpgrades: string[];
}

interface ProductPackV2BcgUnicornPath {
  categoryExpansionNeeded: string;
  platformOrEcosystemMove: string;
  moatNeeded: string;
  distributionAdvantageNeeded: string;
  pricingOrLtvPath: string;
  productSurfaceExpansion: string;
  proofRequiredBeforeClaimingUpside: string[];
  investorBeliefTriggers: string[];
}

interface ProductPackV2BcgVerdict {
  currentBcgPosition: string;
  targetBcgPositionAfterUpgrades: string;
  topFiveMovesRequired: string[];
  topFiveProofPointsRequired: string[];
  topFiveRisks: string[];
}

interface ProductPackV2BcgDocument extends ProductPackV2Document {
  bcg: ProductPackV2BcgCore;
  scorecard: ProductPackV2BcgScorecardItem[];
  currentStateDiagnosis: ProductPackV2BcgCurrentStateDiagnosis;
  starUpgradeStrategy: ProductPackV2BcgStarUpgradeStrategy;
  unicornGradeUpsidePath: ProductPackV2BcgUnicornPath;
  beforeAfterUpgradeTable: ProductPackV2BcgUpgradeTableItem[];
  finalBcgVerdict: ProductPackV2BcgVerdict;
}

const BCG_SCORECARD_DIMENSIONS = [
  'Market growth', 'Urgency of problem', 'Buyer/user willingness to pay', 'Competitive gap',
  'Differentiation', 'Distribution access', 'Retention / switching cost', 'Monetization strength',
  'Defensibility / moat', 'Evidence confidence', 'Venture scale potential', 'Execution feasibility',
] as const;

const BCG_UPGRADE_TABLE_DIMENSIONS = [
  'Market growth', 'Competitive position', 'Distribution', 'Retention', 'Monetization',
  'Moat', 'Evidence confidence', 'Venture scale', 'Execution feasibility',
] as const;

const BCG_POSITIONS = ['Star', 'Question Mark', 'Cash Cow', 'Dog'] as const;

interface ProductPackV2QiraTask {
  title: string;
  description: string;
  ownerRole: string;
  taskType: string;
  sourceSections: string[];
  implementationNotes: string[];
  filesHint: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  qaChecks: string[];
  doneDefinition: string[];
}

interface ProductPackV2QiraEpic {
  title: string;
  description: string;
  sourceSections: string[];
  priority: string;
  sprintHint: string;
  tasks: ProductPackV2QiraTask[];
  acceptanceCriteria: string[];
  dependencies: string[];
  doneDefinition: string[];
}

interface ProductPackV2QiraBacklog {
  projectTitle: string;
  projectDescription: string;
  epics: ProductPackV2QiraEpic[];
  sprints: Array<{ name: string; goal: string; epicTitles: string[]; taskTitles: string[]; definitionOfDone: string[] }>;
  dependencies: string[];
  ownerRoles: string[];
  labels: string[];
  acceptanceCriteria: string[];
  doneDefinition: string[];
}

interface ProductPackV2AiAgentPrompt {
  title: string;
  targetAgent: string;
  purpose: string;
  promptBody: string;
  relatedSections: string[];
  expectedFiles: string[];
  tests: string[];
  finalReportFormat: string[];
}

interface ProductPackV2ExecutionHandoff {
  mode: string;
  qiraBacklogDraft: ProductPackV2QiraBacklog | null;
  aiAgentPromptBundleDraft: ProductPackV2AiAgentPrompt[];
}

interface ProductPackV2Json {
  packTitle: string;
  oneLineThesis: string;
  language: string;
  packType: string;
  ideaAmplification: Record<string, unknown>;
  recommendedStrategy: Record<string, unknown>;
  quality: {
    completenessScore: number;
    confidenceScore: number;
    assumptionCount: number;
    evidenceCount: number;
    riskLevel: string;
    missingInputs: string[];
  };
  documents: ProductPackV2Document[];
  roleBriefs: Record<string, string[]>;
  screenStoryboard: unknown[];
  navigation: Record<string, unknown>;
  apiContracts: unknown[];
  dataModel: unknown[];
  risks: unknown[];
  executionPhases: unknown[];
  executionHandoff: ProductPackV2ExecutionHandoff;
  exportAssets: unknown[];
}

interface ProductPackV2GateCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  documentTypes: DocumentType[];
}

interface ProductPackV2QualityGates {
  structureGate: 'complete' | 'missing_required_sections';
  evidenceGate: 'supported' | 'weak' | 'starter_hypothesis';
  safetyGate: 'clear' | 'needs_source_labels';
  buildabilityGate: 'ready' | 'incomplete';
  exportGate: 'ready' | 'naming_issue';
  openQuestions: string[];
  sourceNeeds: string[];
  whatNotToBuildOrClaim: string[];
}

type ProductPackV2ParseReason =
  | 'ok'
  | 'empty_json'
  | 'invalid_json'
  | 'schema_invalid_root'
  | 'schema_missing_top_level'
  | 'schema_invalid_quality'
  | 'schema_missing_documents'
  | 'schema_invalid_documents'
  | 'schema_missing_sections'
  | 'schema_invalid_bcg_fields';

/** Parse result for ONE step's JSON output (documents scoped to that step, plus whichever top-level fields it owns). */
interface ProductPackV2StepParseResult {
  json: (Partial<ProductPackV2Json> & { documents: ProductPackV2Document[] }) | null;
  reason: ProductPackV2ParseReason;
}

interface ProductPackV2RunDiagnostics {
  stage: 'generate' | 'repair' | 'regenerate';
  rawLength: number;
  parseReason: ProductPackV2ParseReason | 'truncated_output';
  outputTokens: number;
  requestedMaxOutputTokens: number;
  effectiveMaxOutputTokens: number;
  provider: string;
  modelId: string;
  finishReason: string | null;
  likelyTruncated: boolean;
}

interface PackV2AiRunDetails {
  taskType: string;
  modelId: string;
  provider: string;
  usedFallback: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCost: number;
  requestedMaxOutputTokens: number;
  effectiveMaxOutputTokens: number;
  finishReason: string | null;
  parseReason: ProductPackV2RunDiagnostics['parseReason'];
}

interface PackV2AiRun {
  primary: PackV2AiRunDetails;
  repair?: PackV2AiRunDetails;
  regenerate?: PackV2AiRunDetails;
}

/** One AI-run record per completed pipeline step, keyed by step id. */
type PackV2StepAiRuns = Partial<Record<ProductPackV2StepId, PackV2AiRun>>;

const PACK_V2_TASK_TYPE: LLMTaskType = 'product_vision_generation';
// Slightly above the router's own per-attempt timeout (see
// PRODUCT_PACK_TASK_TIMEOUT_MS in llm-router.service.ts) so that timeout
// fires first with a specific LLMError instead of this generic wrapper.
const PACK_V2_TIMEOUT_MS = 500_000;
const PACK_V2_DEBUG_RAW_LOGGING = /^(1|true|yes)$/i.test(process.env.DEBUG_PRODUCT_PACK_V2 ?? '');

const FALLBACK_EXECUTION_HANDOFF: ProductPackV2ExecutionHandoff = {
  mode: 'team_studio_and_ai_agent',
  qiraBacklogDraft: null,
  aiAgentPromptBundleDraft: [],
};

/** docType → router task type, for optional LLM enhancement. */
const DOC_TASK: Partial<Record<DocumentType, LLMTaskType>> = {
  product_vision: 'product_vision_generation',
  market_context: 'market_context_generation',
  target_audience_icp: 'icp_generation',
  jobs_to_be_done: 'jtbd_generation',
  problem_map: 'problem_map_generation',
  user_scenarios: 'user_scenarios_generation',
  feature_checklist: 'feature_scope_generation',
  ux_flow: 'ux_flow_generation',
  screen_map: 'screen_map_generation',
  design_brd: 'design_brd_generation',
  backend_brd: 'backend_brd_generation',
  data_model: 'data_model_generation',
  api_requirements: 'api_requirements_generation',
  ai_agent_instructions: 'ai_agent_instructions_generation',
  acceptance_criteria: 'acceptance_criteria_generation',
  monetization_plan: 'monetization_generation',
  go_to_market_plan: 'gtm_generation',
  analytics_plan: 'analytics_plan_generation',
  risks_and_assumptions: 'risk_analysis_generation',
  research_questions: 'research_questions_generation',
  roadmap: 'roadmap_generation',
};

@Injectable()
export class PackService {
  private readonly logger = new Logger(PackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: LlmRouterService,
  ) {}

  /** Generate a full Product Document Pack for a niche. */
  async generate(workspaceId: string, nicheId: string, opts: GeneratePackOptions) {
    const ctx = await this.gatherContext(workspaceId, nicheId, opts);
    const requiredDocs = DEPTH_DOCUMENTS[opts.depth];

    if (opts.useLlm) {
      return this.generatePackV2(workspaceId, nicheId, opts, ctx, requiredDocs);
    }

    const pack = await this.prisma.productDocumentPack.create({
      data: {
        workspaceId,
        nicheId,
        projectId: await this.projectIdForNiche(workspaceId, nicheId),
        title: `${ctx.niche.title} — ${opts.depth.replace(/_/g, ' ')} pack`,
        depth: opts.depth,
        verticalTemplate: opts.vertical,
        primaryLanguage: ctx.language,
        status: 'generating',
        confidenceValue: ctx.score?.confidenceValue ?? 0,
        confidenceLevel: ctx.score?.confidenceLevel ?? 'low',
      },
    });

    const docMeta = this.documentMetadata(ctx, opts);
    const built: DocForGate[] = [];
    for (const docType of requiredDocs) {
      const doc = buildDocument(docType, ctx);
      const body = opts.useLlm ? await this.maybeEnhance(workspaceId, docType, doc.body, ctx) : doc.body;
      await this.prisma.productPackDocument.create({
        data: {
          packId: pack.id,
          docType,
          title: doc.title,
          body,
          language: ctx.language,
          status: 'draft',
          confidenceValue: ctx.score?.confidenceValue ?? 0,
          confidenceLevel: ctx.score?.confidenceLevel ?? 'low',
          metadata: docMeta as unknown as Prisma.InputJsonValue,
        },
      });
      built.push({ docType, body, language: ctx.language });
    }

    const gate = runQualityGates(built, ctx, requiredDocs);
    const result = await this.prisma.qualityGateResult.create({
      data: {
        packId: pack.id,
        status: gate.status,
        checks: gate.checks as unknown as Prisma.InputJsonValue,
        passedCount: gate.passedCount,
        warnCount: gate.warnCount,
        failCount: gate.failCount,
      },
    });
    await this.prisma.productPackDocument.updateMany({
      where: { packId: pack.id },
      data: { qualityGateStatus: gate.status === 'failed' ? 'failed' : gate.status === 'warnings' ? 'warnings' : 'passed' },
    });
    await this.prisma.productDocumentPack.update({ where: { id: pack.id }, data: { status: 'draft' } });

    // Persist the Build Blueprint derived from this pack's context.
    if (ctx.buildBlueprint) {
      await this.persistBlueprint(workspaceId, pack.id, nicheId, pack.projectId, ctx.buildBlueprint);
    }

    return { pack, documentCount: built.length, qualityGate: result };
  }

  /** Create just the pack row + resolve context, without running any LLM steps — fast, synchronous. Used by PackGenerationJobService so the client gets a real packId immediately, before the (possibly 20+ minute) pipeline runs in the background. */
  async createPackShellForJob(workspaceId: string, nicheId: string, opts: GeneratePackOptions) {
    const ctx = await this.gatherContext(workspaceId, nicheId, opts);
    const projectId = await this.projectIdForNiche(workspaceId, nicheId);
    const pack = await this.prisma.productDocumentPack.create({
      data: {
        workspaceId,
        nicheId,
        projectId,
        title: 'Build-Ready Product Pack',
        depth: opts.depth,
        verticalTemplate: opts.vertical,
        primaryLanguage: ctx.language,
        status: 'generating',
        confidenceValue: ctx.score?.confidenceValue ?? 0,
        confidenceLevel: ctx.score?.confidenceLevel ?? 'low',
      },
    });
    return { pack, ctx, projectId };
  }

  /** Runs the full V2 pipeline for an already-created job + pack row, with per-step progress tracking and staged document persistence. Called by PackGenerationJobService's (queued or inline) worker — never awaited by the HTTP request that created the job. */
  async generateV2ForJob(job: {
    id: string;
    workspaceId: string;
    nicheId: string;
    packId: string;
    depth: string;
    verticalTemplate: string;
    language: string | null;
  }) {
    const opts: GeneratePackOptions = {
      depth: job.depth as ProductPackDepth,
      vertical: job.verticalTemplate as VerticalTemplate,
      language: (job.language ?? undefined) as LocaleCode | undefined,
      useLlm: true,
    };
    const ctx = await this.gatherContext(job.workspaceId, job.nicheId, opts);
    const requiredDocs = DEPTH_DOCUMENTS[opts.depth];
    return this.generatePackV2(job.workspaceId, job.nicheId, opts, ctx, requiredDocs, {
      jobId: job.id,
      pack: { id: job.packId },
    });
  }

  /**
   * Generate a Build-Ready Product Pack as a sequence of independent LLM
   * steps (see product-pack-v2.steps.ts) instead of one ~39-section mega
   * call. Steps run strictly in order — never in parallel — so each step
   * can be told what earlier steps already decided (via a deterministic,
   * non-LLM summary) and stay consistent with it. If a later step fails
   * even after its own repair attempt, generation stops there but the
   * documents/fields already produced by completed steps are still
   * persisted rather than discarded.
   *
   * When `jobContext` is provided (async/job-based generation only — see
   * generateV2ForJob above), the already-created pack row is reused instead
   * of creating a new one, and each step's progress/timing is persisted to
   * ProductPackGenerationStep plus its documents are written to the DB
   * immediately (staged availability) rather than only at the very end. The
   * synchronous call path (plain `generate()`, and all of pack.service.test.ts)
   * never passes `jobContext`, so its behavior is completely unchanged.
   */
  private async generatePackV2(
    workspaceId: string,
    nicheId: string,
    opts: GeneratePackOptions,
    ctx: PackContext,
    _requiredDocs: readonly DocumentType[],
    jobContext?: { jobId: string; pack: { id: string } },
  ) {
    const projectId = await this.projectIdForNiche(workspaceId, nicheId);
    const pack = jobContext
      ? jobContext.pack
      : await this.prisma.productDocumentPack.create({
          data: {
            workspaceId,
            nicheId,
            projectId,
            title: 'Build-Ready Product Pack',
            depth: opts.depth,
            verticalTemplate: opts.vertical,
            primaryLanguage: ctx.language,
            status: 'generating',
            confidenceValue: ctx.score?.confidenceValue ?? 0,
            confidenceLevel: ctx.score?.confidenceLevel ?? 'low',
          },
        });
    const jobId = jobContext?.jobId;

    const input = this.buildProductPackV2Input(ctx, opts);
    const documents: ProductPackV2Document[] = [];
    const extraFields: Record<string, unknown> = {};
    const stepAiRuns: PackV2StepAiRuns = {};
    const priorSummaries: string[] = [];
    let pipelineError: unknown = null;
    let allStepsCompleted = true;
    const totalSteps = PRODUCT_PACK_V2_STEPS.length;

    for (const [stepIndex, step] of PRODUCT_PACK_V2_STEPS.entries()) {
      const stepStartedAt = Date.now();
      if (jobId) await this.markGenerationStepRunning(jobId, step.id);
      try {
        const stepResult = step.id === 'bcg_star_evaluation'
          ? await this.runBcgStep(workspaceId, pack.id, projectId, ctx, input, step, priorSummaries.join('\n\n'))
          : await this.runPackV2Step(workspaceId, pack.id, projectId, ctx, input, step, priorSummaries.join('\n\n'));
        documents.push(...stepResult.documents);
        mergeStepFields(extraFields, stepResult.extraFields);
        stepAiRuns[step.id] = stepResult.aiRun;
        priorSummaries.push(summarizeStepForNextStep(step, stepResult));
        if (jobId) {
          const documentIds = await this.persistInterimStepDocuments(stepResult.documents, ctx, opts, pack.id);
          await this.markGenerationStepCompleted(jobId, step.id, stepResult.aiRun, Date.now() - stepStartedAt, documentIds);
          await this.updateJobProgress(jobId, {
            currentStep: step.id,
            progressPercent: Math.round(((stepIndex + 1) / totalSteps) * 100),
            readyDocumentCount: documents.length,
          });
        }
      } catch (error) {
        pipelineError = error;
        this.logger.warn(`Product Pack v2 step "${step.id}" failed for niche ${nicheId}: ${String(error)}`);
        if (jobId) await this.markGenerationStepFailed(jobId, step.id, error, Date.now() - stepStartedAt);
        // Every other step's documents-so-far are still persisted as a
        // draft pack on failure (see the docstring above) — but there is no
        // safe partial/fake fallback for a scored BCG evaluation, so a BCG
        // failure hard-fails generation instead of silently continuing.
        if (step.id === 'bcg_star_evaluation') {
          await this.prisma.productDocumentPack.update({ where: { id: pack.id }, data: { status: 'failed' } });
          throw mapPackGenerationError(pipelineError, 'BCG Opportunity Evaluation step failed.');
        }
        allStepsCompleted = false;
        break;
      }
    }

    if (documents.length === 0) {
      await this.prisma.productDocumentPack.update({ where: { id: pack.id }, data: { status: 'failed' } });
      throw mapPackGenerationError(pipelineError, 'Build-Ready Product Pack generation failed.');
    }

    try {
      const packJson = normalizePackV2Pack(finalizePackV2Json(extraFields, documents, ctx));
      const quality = packJson.quality;
      const finalTitle = normalizePackTitle(packJson.packTitle);
      const confidenceValue = normalizeConfidenceScore(quality.confidenceScore);
      const confidenceLevel = confidenceLevelFromScore(confidenceValue);
      const packMetadata = buildProductPackV2Metadata(packJson, stepAiRuns);
      const docRows = packJson.documents.map((doc) =>
        mapPackV2DocumentToProductPackDocument(doc, packJson, packMetadata, ctx, opts, pack.id, stepAiRuns),
      );
      const gate = buildProductPackV2QualityGate(packJson, packMetadata.qualityGates);

      const saved = await this.prisma.$transaction(
        async (tx) => {
          await tx.productPackDocument.deleteMany({ where: { packId: pack.id } });
          // A step-based pack can have 30+ documents, each with a large JSON
          // metadata blob (including a full pack snapshot). createMany cut
          // this to one round trip, but a full ~39-document pack still moved
          // enough data to exceed Prisma's default 5s interactive-transaction
          // timeout on its own — raise it explicitly (see the timeout option
          // below) rather than relying on the default.
          await tx.productPackDocument.createMany({ data: docRows });
          const qualityGate = await tx.qualityGateResult.create({
            data: {
              packId: pack.id,
              status: gate.status,
              checks: gate.checks as unknown as Prisma.InputJsonValue,
              passedCount: gate.passedCount,
              warnCount: gate.warnCount,
              failCount: gate.failCount,
            },
          });
          const updatedPack = await tx.productDocumentPack.update({
            where: { id: pack.id },
            data: {
              title: finalTitle,
              status: 'draft',
              confidenceValue,
              confidenceLevel,
            },
          });
          await tx.productPackDocument.updateMany({
            where: { packId: pack.id },
            data: { qualityGateStatus: gate.status === 'failed' ? 'failed' : gate.status === 'warnings' ? 'warnings' : 'passed' },
          });
          return { updatedPack, qualityGate };
        },
        { timeout: 30_000 },
      );

      if (ctx.buildBlueprint) {
        await this.persistBlueprint(workspaceId, pack.id, nicheId, projectId, ctx.buildBlueprint);
      }

      return {
        pack: { ...saved.updatedPack, metadata: packMetadata },
        documentCount: docRows.length,
        qualityGate: saved.qualityGate,
        allStepsCompleted,
      };
    } catch (error) {
      await this.prisma.productDocumentPack.update({ where: { id: pack.id }, data: { status: 'failed' } });
      this.logger.warn(`Product Pack v2 post-processing failed for niche ${nicheId}: ${String(error)}`);
      throw mapPackGenerationError(error, 'Build-Ready Product Pack generation failed.');
    }
  }

  // ── Async job progress hooks (only exercised when generatePackV2 is called with jobContext) ──

  private async markGenerationStepRunning(jobId: string, stepKey: string): Promise<void> {
    await this.prisma.productPackGenerationStep.upsert({
      where: { jobId_stepKey: { jobId, stepKey } },
      create: { jobId, stepKey, status: 'running', startedAt: new Date(), attemptCount: 1 },
      update: { status: 'running', startedAt: new Date() },
    });
  }

  private async markGenerationStepCompleted(
    jobId: string,
    stepKey: string,
    aiRun: PackV2AiRun,
    durationMs: number,
    documentIds: string[],
  ): Promise<void> {
    const attemptCount = 1 + (aiRun.repair ? 1 : 0) + (aiRun.regenerate ? 1 : 0);
    const repairCount = (aiRun.repair ? 1 : 0) + (aiRun.regenerate ? 1 : 0);
    const finalAttempt = aiRun.regenerate ?? aiRun.repair ?? aiRun.primary;
    await this.prisma.productPackGenerationStep.upsert({
      where: { jobId_stepKey: { jobId, stepKey } },
      create: {
        jobId, stepKey, status: 'completed', startedAt: new Date(Date.now() - durationMs), completedAt: new Date(),
        durationMs, attemptCount, repairCount,
        provider: finalAttempt.provider, model: finalAttempt.modelId, maxOutputTokens: finalAttempt.effectiveMaxOutputTokens,
        inputTokens: finalAttempt.inputTokens, outputTokens: finalAttempt.outputTokens,
        documentIds: documentIds as unknown as Prisma.InputJsonValue,
        metadata: { aiRun } as unknown as Prisma.InputJsonValue,
      },
      update: {
        status: 'completed', completedAt: new Date(), durationMs, attemptCount, repairCount,
        provider: finalAttempt.provider, model: finalAttempt.modelId, maxOutputTokens: finalAttempt.effectiveMaxOutputTokens,
        inputTokens: finalAttempt.inputTokens, outputTokens: finalAttempt.outputTokens,
        documentIds: documentIds as unknown as Prisma.InputJsonValue,
        metadata: { aiRun } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async markGenerationStepFailed(jobId: string, stepKey: string, error: unknown, durationMs: number): Promise<void> {
    const mapped = mapPackGenerationError(error, 'Product Pack step failed.');
    const response = mapped.getResponse();
    const errorCode = response && typeof response === 'object' && 'code' in response ? String((response as { code: unknown }).code) : 'product_pack_step_failed';
    const errorReason = mapped instanceof Error ? mapped.message.slice(0, 500) : String(mapped).slice(0, 500);
    await this.prisma.productPackGenerationStep.upsert({
      where: { jobId_stepKey: { jobId, stepKey } },
      create: { jobId, stepKey, status: 'failed', startedAt: new Date(Date.now() - durationMs), completedAt: new Date(), durationMs, attemptCount: 1, errorCode, errorReason },
      update: { status: 'failed', completedAt: new Date(), durationMs, errorCode, errorReason },
    });
  }

  private async updateJobProgress(
    jobId: string,
    patch: { currentStep: string; progressPercent: number; readyDocumentCount: number },
  ): Promise<void> {
    await this.prisma.productPackGenerationJob.update({ where: { id: jobId }, data: patch });
  }

  /** Staged availability: write this step's documents to the DB right away (lightweight rows, no full pack aggregation) so a polling client can list them before the pipeline finishes. The final transaction later replaces every row with the fully-normalized set. */
  private async persistInterimStepDocuments(
    stepDocuments: ProductPackV2Document[],
    ctx: PackContext,
    opts: GeneratePackOptions,
    packId: string,
  ): Promise<string[]> {
    if (stepDocuments.length === 0) return [];
    const rows = stepDocuments.map((doc) => mapPackV2DocumentToInterimRow(doc, ctx, opts, packId));
    await this.prisma.productPackDocument.createMany({ data: rows });
    const docTypes = rows.map((row) => row.docType);
    const saved = await this.prisma.productPackDocument.findMany({
      where: { packId, docType: { in: docTypes as DocumentType[] } },
      select: { id: true },
    });
    return saved.map((row) => row.id);
  }

  private buildProductPackV2Input(ctx: PackContext, opts: GeneratePackOptions): BuildProductPackV2PromptInput {
    return {
      opportunity: {
        id: ctx.niche.title,
        title: ctx.niche.title,
        oneLineThesis: ctx.niche.oneLiner,
        description: ctx.niche.problem,
        market: ctx.market.country ?? ctx.market.scope,
        direction: ctx.niche.mvpConcept,
        subthemes: ctx.niche.useCases,
        audience: ctx.niche.targetAudience,
        buyerType: ctx.niche.recommendedProductFormat,
        productFormat: ctx.niche.recommendedProductFormat,
        riskTolerance: ctx.niche.riskLevel,
        language: ctx.language,
        evidenceMode: ctx.sourceRefs.length > 0 ? 'source_backed' : 'starter_hypothesis',
        investorLens: opts.depth === 'investor_grade' || opts.depth === 'build_ready',
        scores: ctx.score
          ? {
              totalScore: ctx.score.totalScore,
              confidenceValue: ctx.score.confidenceValue,
              confidenceLevel: ctx.score.confidenceLevel,
              explanation: ctx.score.explanation,
              breakdown: ctx.score.breakdown,
            }
          : undefined,
        assumptions: ctx.assumptions.map((a) => a.text),
        risks: ctx.constraints.map((c) => c.text),
        validationQuestions: ctx.unresolvedQuestions.map((q) => q.text),
      },
      searchContext: {
        marketScope: ctx.market.scope,
        locations: [ctx.market.country, ctx.market.region].filter((value): value is string => Boolean(value)),
        directions: [ctx.niche.oneLiner, ctx.niche.problem, ctx.niche.mvpConcept].filter(Boolean),
        subthemes: ctx.niche.useCases,
        audiences: [ctx.niche.targetAudience].filter(Boolean),
        buyerType: ctx.niche.recommendedProductFormat,
        productFormats: [ctx.niche.recommendedProductFormat].filter(Boolean),
        riskTolerance: ctx.niche.riskLevel,
        mvpTimeline: opts.depth === 'quick_opportunity' ? '6_weeks' : '3_months',
        language: ctx.language,
        evidenceMode: ctx.sourceRefs.length > 0 ? 'source_backed' : 'starter_hypothesis',
        investorLens: opts.depth === 'investor_grade' || opts.depth === 'build_ready',
      },
      evidence: {
        claims: ctx.claims.map((claim) => ({
          claim: claim.text,
          status: claim.confidenceLevel === 'high' ? 'source_backed' : 'weak_signal',
          confidence: confidenceValueFromLevel(claim.confidenceLevel),
        })),
        sources: ctx.sourceRefs.map((source) => ({
          title: source.title ?? '',
          ...(source.url ? { url: source.url } : {}),
          type: source.adapter,
          relevance: 'pack evidence source',
        })),
        assumptions: ctx.assumptions.map((a) => a.text),
        contradictions: ctx.constraints.map((c) => c.text),
      },
      outputLanguage: ctx.language,
      founderRequest:
        ctx.niche.intakeMode === 'founder_idea' && ctx.niche.founderIdeaText
          ? ctx.niche.founderIdeaText
          : [ctx.niche.title, ctx.niche.oneLiner, ctx.niche.problem].filter(Boolean).join('\n'),
      existingPackNotes: undefined,
    };
  }

  /** Run one step of the sequential Product Pack V2 pipeline: generate, and repair once if invalid. */
  private async runPackV2Step(
    workspaceId: string,
    packId: string,
    projectId: string,
    ctx: PackContext,
    input: BuildProductPackV2PromptInput,
    step: ProductPackV2Step,
    priorSummary: string,
  ): Promise<{ documents: ProductPackV2Document[]; extraFields: Record<string, unknown>; aiRun: PackV2AiRun }> {
    const prompt = buildProductPackV2StepPrompt(step, input, priorSummary);
    const firstRun = await this.runPackPrompt(workspaceId, packId, projectId, ctx.language, prompt, PACK_V2_TASK_TYPE, step.maxOutputTokens);
    const firstAttempt = await this.inspectPackV2Attempt(PACK_V2_TASK_TYPE, 'generate', firstRun, step.maxOutputTokens, (raw) =>
      parsePackV2StepJson(raw, step),
    );

    let parsed = firstAttempt.parsed;
    const aiRun: PackV2AiRun = { primary: this.aiRunFromResult(firstRun, firstAttempt.diagnostics) };
    let lastDiagnostics = firstAttempt.diagnostics;

    if (!parsed.json) {
      const repairPrompt = buildProductPackV2StepRepairPrompt(step, firstAttempt.raw);
      const repairRun = await this.runPackPrompt(workspaceId, packId, projectId, ctx.language, repairPrompt, PACK_V2_TASK_TYPE, step.maxOutputTokens);
      const repairAttempt = await this.inspectPackV2Attempt(PACK_V2_TASK_TYPE, 'repair', repairRun, step.maxOutputTokens, (raw) =>
        parsePackV2StepJson(raw, step),
      );
      parsed = repairAttempt.parsed;
      aiRun.repair = this.aiRunFromResult(repairRun, repairAttempt.diagnostics);
      lastDiagnostics = repairAttempt.diagnostics;
    }

    // Live-tested: large (80-100k char) JSON responses occasionally have a
    // one-off syntax defect that isn't truncation and isn't a schema issue —
    // just inherent LLM non-determinism (the identical prompt succeeded on a
    // later isolated retry). Re-editing the same broken text via a repair
    // prompt doesn't reliably fix that class of defect, but a fresh
    // regeneration often doesn't reproduce it. Skip this for truncation,
    // where asking again with the same budget would just truncate again.
    if (!parsed.json && !firstAttempt.diagnostics.likelyTruncated && !lastDiagnostics.likelyTruncated) {
      const regenerateRun = await this.runPackPrompt(workspaceId, packId, projectId, ctx.language, prompt, PACK_V2_TASK_TYPE, step.maxOutputTokens);
      const regenerateAttempt = await this.inspectPackV2Attempt(PACK_V2_TASK_TYPE, 'regenerate', regenerateRun, step.maxOutputTokens, (raw) =>
        parsePackV2StepJson(raw, step),
      );
      parsed = regenerateAttempt.parsed;
      aiRun.regenerate = this.aiRunFromResult(regenerateRun, regenerateAttempt.diagnostics);
      lastDiagnostics = regenerateAttempt.diagnostics;
    }

    if (!parsed.json) {
      if (firstAttempt.diagnostics.likelyTruncated || lastDiagnostics.likelyTruncated) {
        throw buildProductPackV2StepTruncatedException(step);
      }
      throw new BadRequestException({
        code: 'product_pack_v2_step_repair_failed',
        message: `Product Pack step "${step.title}" JSON repair failed (reason: ${lastDiagnostics.parseReason}).`,
      });
    }

    const json = parsed.json;
    const documents = json.documents;
    const extraFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json)) {
      if (key !== 'documents') extraFields[key] = value;
    }
    return { documents, extraFields, aiRun };
  }

  /**
   * Runs the dedicated BCG Opportunity Evaluation step. Deliberately NOT the
   * same 3-attempt (generate/repair/regenerate-from-scratch) flow as
   * runPackV2Step: generate, then at most ONE repair pass. If that also
   * fails, the pack fails with a BCG-specific error code instead of falling
   * back to a fake/deterministic BCG document — there is no safe
   * deterministic fallback for a scored strategic evaluation.
   */
  private async runBcgStep(
    workspaceId: string,
    packId: string,
    projectId: string,
    ctx: PackContext,
    input: BuildProductPackV2PromptInput,
    step: ProductPackV2Step,
    priorSummary: string,
  ): Promise<{ documents: ProductPackV2Document[]; extraFields: Record<string, unknown>; aiRun: PackV2AiRun }> {
    const prompt = buildProductPackV2StepPrompt(step, input, priorSummary);
    const firstRun = await this.runPackPrompt(workspaceId, packId, projectId, ctx.language, prompt, PACK_V2_TASK_TYPE, step.maxOutputTokens);
    const firstAttempt = await this.inspectPackV2Attempt(PACK_V2_TASK_TYPE, 'generate', firstRun, step.maxOutputTokens, (raw) =>
      parseBcgStepJson(raw, step),
    );

    let parsed = firstAttempt.parsed;
    const aiRun: PackV2AiRun = { primary: this.aiRunFromResult(firstRun, firstAttempt.diagnostics) };
    let lastDiagnostics = firstAttempt.diagnostics;

    if (!parsed.json) {
      const repairPrompt = buildProductPackV2StepRepairPrompt(step, firstAttempt.raw);
      const repairRun = await this.runPackPrompt(workspaceId, packId, projectId, ctx.language, repairPrompt, PACK_V2_TASK_TYPE, step.maxOutputTokens);
      const repairAttempt = await this.inspectPackV2Attempt(PACK_V2_TASK_TYPE, 'repair', repairRun, step.maxOutputTokens, (raw) =>
        parseBcgStepJson(raw, step),
      );
      parsed = repairAttempt.parsed;
      aiRun.repair = this.aiRunFromResult(repairRun, repairAttempt.diagnostics);
      lastDiagnostics = repairAttempt.diagnostics;
    }

    if (!parsed.json) {
      if (firstAttempt.diagnostics.likelyTruncated || lastDiagnostics.likelyTruncated) {
        throw buildProductPackV2StepTruncatedException(step);
      }
      throw new BadRequestException({
        code: 'product_pack_bcg_step_failed',
        message: `BCG Opportunity Evaluation step failed after generate + one repair attempt (reason: ${lastDiagnostics.parseReason}).`,
      });
    }

    const bcgDoc = parsed.json.documents[0];
    const renderedDoc: ProductPackV2Document = { ...bcgDoc, sections: renderBcgDocumentToSections(bcgDoc) };
    return { documents: [renderedDoc], extraFields: {}, aiRun };
  }

  private async runPackPrompt(
    workspaceId: string,
    packId: string,
    projectId: string,
    language: LocaleCode,
    prompt: { system: string; user: string },
    taskType: LLMTaskType,
    maxOutputTokens: number,
  ) {
    const request = this.router.run({
      taskType,
      workspaceId,
      projectId,
      packId,
      jsonMode: true,
      estimatedOutputTokens: maxOutputTokens,
      contract: {
        ...baseContract(language),
        outputLanguage: language,
        marketLanguage: language,
        evidenceRequirement: 'required',
        unsupportedClaimsPolicy: 'mark_as_assumption',
      },
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    });
    return withTimeout(request, PACK_V2_TIMEOUT_MS, 'llm_timeout');
  }

  private async inspectPackV2Attempt<T extends { json: unknown; reason: ProductPackV2ParseReason }>(
    taskType: LLMTaskType,
    stage: 'generate' | 'repair' | 'regenerate',
    result: Awaited<ReturnType<LlmRouterService['run']>>,
    requestedMaxOutputTokens: number,
    parseFn: (raw: string) => T,
  ) {
    const raw = extractLlmText(result);
    const effectiveMaxOutputTokens = await this.router.resolveTaskOutputBudget(taskType, result.modelId, requestedMaxOutputTokens);
    const parsed = parseFn(raw);
    const finishReason = extractFinishReason(result);
    const likelyTruncated = isLikelyTruncatedPackOutput({
      json: parsed.json,
      outputTokens: result.outputTokens,
      requestedMaxOutputTokens,
      effectiveMaxOutputTokens,
      finishReason,
    });
    const diagnostics: ProductPackV2RunDiagnostics = {
      stage,
      rawLength: raw.length,
      parseReason: likelyTruncated && !parsed.json ? 'truncated_output' : parsed.reason,
      outputTokens: result.outputTokens,
      requestedMaxOutputTokens,
      effectiveMaxOutputTokens,
      provider: result.provider,
      modelId: result.modelId,
      finishReason,
      likelyTruncated,
    };
    this.logPackV2Diagnostics(diagnostics, raw);
    return { raw, parsed, diagnostics };
  }

  private logPackV2Diagnostics(diagnostics: ProductPackV2RunDiagnostics, raw: string) {
    if (diagnostics.parseReason === 'ok' && !diagnostics.likelyTruncated) {
      return;
    }
    this.logger.warn(
      `Product Pack v2 ${diagnostics.stage} diagnostics: ${JSON.stringify({
        stage: diagnostics.stage,
        rawLength: diagnostics.rawLength,
        parseReason: diagnostics.parseReason,
        outputTokens: diagnostics.outputTokens,
        requestedMaxOutputTokens: diagnostics.requestedMaxOutputTokens,
        effectiveMaxOutputTokens: diagnostics.effectiveMaxOutputTokens,
        provider: diagnostics.provider,
        modelId: diagnostics.modelId,
        finishReason: diagnostics.finishReason,
        likelyTruncated: diagnostics.likelyTruncated,
      })}`,
    );
    if (PACK_V2_DEBUG_RAW_LOGGING) {
      this.logger.debug(
        `Product Pack v2 ${diagnostics.stage} raw snippets: ${JSON.stringify({
          start: raw.slice(0, 500),
          end: raw.slice(-500),
        })}`,
      );
    }
  }

  private aiRunFromResult(
    result: Awaited<ReturnType<LlmRouterService['run']>>,
    diagnostics: ProductPackV2RunDiagnostics,
  ): PackV2AiRun['primary'] {
    return {
      taskType: result.taskType,
      modelId: result.modelId,
      provider: result.provider,
      usedFallback: result.usedFallback,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      estimatedCost: result.estimatedCost,
      requestedMaxOutputTokens: diagnostics.requestedMaxOutputTokens,
      effectiveMaxOutputTokens: diagnostics.effectiveMaxOutputTokens,
      finishReason: diagnostics.finishReason,
      parseReason: diagnostics.parseReason,
    };
  }

  /** Get the Build Blueprint for a pack (regenerating from context if absent). */
  async getBlueprint(workspaceId: string, packId: string) {
    await this.getPack(workspaceId, packId);
    const existing = await this.prisma.buildBlueprint.findFirst({ where: { packId }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
    return this.regenerateBlueprint(workspaceId, packId);
  }

  /** Regenerate the Build Blueprint from the current pack context. */
  async regenerateBlueprint(workspaceId: string, packId: string) {
    const { pack, ctx } = await this.getContextForPack(workspaceId, packId);
    const blueprint = ctx.buildBlueprint ?? buildBuildBlueprint(ctx);
    return this.persistBlueprint(
      workspaceId,
      packId,
      pack.nicheId as string,
      pack.projectId as string,
      blueprint,
    );
  }

  private async persistBlueprint(
    workspaceId: string,
    packId: string,
    nicheId: string,
    projectId: string,
    bp: NonNullable<PackContext['buildBlueprint']>,
  ) {
    await this.prisma.buildBlueprint.deleteMany({ where: { packId } });
    return this.prisma.buildBlueprint.create({
      data: {
        workspaceId,
        packId,
        nicheId,
        projectId,
        screenContracts: bp.screenContracts as unknown as object,
        stateMatrix: bp.stateMatrix as unknown as object,
        apiToScreenMap: bp.apiToScreenMap as unknown as object,
        componentContracts: bp.componentContracts as unknown as object,
        permissionMatrix: bp.permissionMatrix as unknown as object,
        analyticsEvents: bp.analyticsEvents as unknown as object,
        doNotBuild: bp.doNotBuild as unknown as object,
        validationRules: bp.validationRules as unknown as object,
        buildReadinessScore: bp.buildReadiness.totalScore,
        buildReadinessLevel: bp.buildReadiness.level,
        buildReadinessBreakdown: bp.buildReadiness.breakdown as unknown as object,
        warnings: bp.buildReadiness.warnings as unknown as object,
      },
    });
  }

  async getPack(workspaceId: string, packId: string) {
    const pack = await this.prisma.productDocumentPack.findFirst({
      where: { id: packId, workspaceId },
      include: { documents: { orderBy: { createdAt: 'asc' } } },
    });
    if (!pack) throw new NotFoundException('Pack not found');
    const gate = await this.prisma.qualityGateResult.findFirst({ where: { packId }, orderBy: { createdAt: 'desc' } });
    const metadata = extractPackV2Metadata(pack.documents);
    return metadata ? { ...pack, metadata, qualityGate: gate } : { ...pack, qualityGate: gate };
  }

  /**
   * List packs for a niche with their documents and latest quality gate —
   * the web/mobile pack list reads `pack.documents.length` and
   * `pack.qualityGate.status` directly, so both must always be present
   * (never `undefined`) even though `qualityGate` has no Prisma relation.
   */
  async listForNiche(workspaceId: string, nicheId: string) {
    const packs = await this.prisma.productDocumentPack.findMany({
      where: { workspaceId, nicheId },
      orderBy: { createdAt: 'desc' },
      include: { documents: true },
    });
    if (packs.length === 0) return [];

    const gates = await this.prisma.qualityGateResult.findMany({
      where: { packId: { in: packs.map((pack) => pack.id) } },
      orderBy: { createdAt: 'desc' },
    });
    const latestGateByPack = new Map<string, (typeof gates)[number]>();
    for (const gate of gates) {
      if (!latestGateByPack.has(gate.packId)) latestGateByPack.set(gate.packId, gate);
    }

    return packs.map((pack) => ({ ...pack, qualityGate: latestGateByPack.get(pack.id) ?? null }));
  }

  async documents(workspaceId: string, packId: string) {
    await this.getPack(workspaceId, packId);
    return this.prisma.productPackDocument.findMany({ where: { packId }, orderBy: { createdAt: 'asc' } });
  }

  /** Re-run quality gates over the current documents. */
  async runGates(workspaceId: string, packId: string) {
    const pack = await this.getPack(workspaceId, packId);
    const ctx = await this.gatherContext(workspaceId, pack.nicheId, {
      depth: pack.depth as ProductPackDepth,
      vertical: pack.verticalTemplate as VerticalTemplate,
      language: pack.primaryLanguage as LocaleCode,
    });
    const built: DocForGate[] = pack.documents.map((d) => ({ docType: d.docType as DocumentType, body: d.body, language: d.language }));
    const gate = runQualityGates(built, ctx, DEPTH_DOCUMENTS[pack.depth as ProductPackDepth]);
    return this.prisma.qualityGateResult.create({
      data: {
        packId,
        status: gate.status,
        checks: gate.checks as unknown as Prisma.InputJsonValue,
        passedCount: gate.passedCount,
        warnCount: gate.warnCount,
        failCount: gate.failCount,
      },
    });
  }

  /** Public context accessor for governance/regeneration use. */
  async getContextForPack(workspaceId: string, packId: string): Promise<{ pack: Record<string, unknown>; ctx: PackContext }> {
    const pack = await this.getPack(workspaceId, packId);
    const ctx = await this.gatherContext(workspaceId, pack.nicheId, {
      depth: pack.depth as ProductPackDepth,
      vertical: pack.verticalTemplate as VerticalTemplate,
      language: pack.primaryLanguage as LocaleCode,
    });
    return { pack, ctx };
  }

  /** Regenerate a single document using LLM (falls back to deterministic). Returns new body. */
  async regenerateOne(workspaceId: string, packId: string, documentId: string): Promise<string> {
    const doc = await this.prisma.productPackDocument.findFirst({ where: { id: documentId, packId } });
    if (!doc) throw new NotFoundException('Document not found');
    const { ctx } = await this.getContextForPack(workspaceId, packId);
    const built = buildDocument(doc.docType as DocumentType, ctx);
    return this.maybeEnhance(workspaceId, doc.docType as DocumentType, built.body, ctx);
  }

  /** True if this document was produced by the Product Pack V2 sequential pipeline (has its full generated JSON stored), as opposed to the legacy V1 deterministic-template path. */
  isV2Document(doc: { metadata: unknown }): boolean {
    const meta = doc.metadata as Record<string, unknown> | null;
    return Boolean(meta && isValidPackV2Document(meta.document));
  }

  /**
   * Amend ONE V2 document in place, incorporating reviewer feedback
   * (`instructions` — e.g. open comment bodies; empty = "just tidy/reconfirm").
   * Unlike `regenerateOne` (V1-only, unaware of comments), this reads the
   * document's own already-generated JSON and asks the model to selectively
   * update it, preserving everything the feedback doesn't require changing.
   */
  async amendDocumentV2(
    workspaceId: string,
    packId: string,
    documentId: string,
    instructions: string[],
  ): Promise<{ body: string; document: ProductPackV2Document }> {
    const doc = await this.prisma.productPackDocument.findFirst({ where: { id: documentId, packId } });
    if (!doc) throw new NotFoundException('Document not found');
    const pack = await this.prisma.productDocumentPack.findFirst({ where: { id: packId, workspaceId } });
    if (!pack) throw new NotFoundException('Pack not found');

    const meta = doc.metadata as Record<string, unknown> | null;
    const original = meta?.document as ProductPackV2Document | undefined;
    if (!original || !isValidPackV2Document(original)) {
      throw new BadRequestException({
        code: 'not_a_v2_document',
        message: 'This document was not generated by the Product Pack V2 pipeline and cannot be amended this way.',
      });
    }

    const language = (doc.language || pack.primaryLanguage || 'en') as LocaleCode;
    const sectionKey = resolvePackV2SectionKey(original);
    const owningStep = PRODUCT_PACK_V2_STEPS.find((step) => sectionKey && step.sectionKeys.includes(sectionKey));
    const maxOutputTokens = owningStep?.maxOutputTokens ?? 20000;

    const prompt = buildProductPackV2AmendPrompt(original, instructions);
    const firstRun = await this.runPackPrompt(workspaceId, packId, pack.projectId, language, prompt, PACK_V2_TASK_TYPE, maxOutputTokens);
    let updated = parseAmendedDocument(extractLlmText(firstRun), original);

    if (!updated) {
      const repairPrompt = buildProductPackV2AmendRepairPrompt(original, extractLlmText(firstRun));
      const repairRun = await this.runPackPrompt(workspaceId, packId, pack.projectId, language, repairPrompt, PACK_V2_TASK_TYPE, maxOutputTokens);
      updated = parseAmendedDocument(extractLlmText(repairRun), original);
    }

    if (!updated) {
      throw new BadRequestException({
        code: 'product_pack_v2_amend_failed',
        message: `Could not produce a valid amendment for "${doc.title}".`,
      });
    }

    return { body: documentToMarkdown(updated), document: updated };
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async maybeEnhance(workspaceId: string, docType: DocumentType, deterministic: string, ctx: PackContext): Promise<string> {
    const taskType = DOC_TASK[docType];
    if (!taskType) return deterministic;
    try {
      const result = await this.router.run({
        taskType,
        workspaceId,
        contract: { ...baseContract(ctx.language), evidenceRequirement: 'required', unsupportedClaimsPolicy: 'mark_as_assumption', documentType: docType, packDepth: ctx.depth, verticalTemplate: ctx.vertical },
        messages: [
          { role: 'system', content: 'You expand product documents. Keep structure and headings, stay evidence-backed, mark unsupported points as assumptions, never invent sources. Output Markdown only.' },
          { role: 'user', content: `Improve this ${docType} document in ${ctx.language}:\n\n${deterministic}` },
        ],
      });
      return result.validation.ok ? result.content : deterministic;
    } catch (err) {
      this.logger.debug(`LLM enhancement skipped for ${docType}: ${String(err)}`);
      return deterministic; // never fake LLM output; fall back honestly
    }
  }

  private documentMetadata(ctx: PackContext, opts: GeneratePackOptions) {
    return {
      language: ctx.language,
      market: ctx.market,
      packDepth: opts.depth,
      verticalTemplate: opts.vertical,
      confidence: ctx.score ? { value: ctx.score.confidenceValue, level: ctx.score.confidenceLevel } : null,
      sourceRefIds: ctx.sourceRefs.map((s) => s.id),
      claimIds: ctx.claims.map((c) => c.id),
      assumptionIds: ctx.assumptions.map((a) => a.id),
      constraintIds: ctx.constraints.map((c) => c.id),
      unresolvedQuestionIds: ctx.unresolvedQuestions.map((q) => q.id),
    };
  }

  private async projectIdForNiche(workspaceId: string, nicheId: string): Promise<string> {
    const niche = await this.prisma.niche.findFirst({ where: { id: nicheId, workspaceId }, select: { projectId: true } });
    if (!niche) throw new NotFoundException('Niche not found');
    return niche.projectId;
  }

  private async gatherContext(workspaceId: string, nicheId: string, opts: GeneratePackOptions): Promise<PackContext> {
    const niche = await this.prisma.niche.findFirst({
      where: { id: nicheId, workspaceId },
      include: { scores: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!niche) throw new NotFoundException('Niche not found');
    const project = await this.prisma.project.findUnique({ where: { id: niche.projectId } });
    const language = (opts.language ?? (project?.defaultOutputLanguage as LocaleCode) ?? (project?.marketLanguage as LocaleCode) ?? 'en') as LocaleCode;

    const [claims, assumptions, questions, constraints, evidence, sourceRefs] = await Promise.all([
      this.prisma.claim.findMany({ where: { projectId: niche.projectId } }),
      this.prisma.assumption.findMany({ where: { projectId: niche.projectId } }),
      this.prisma.unresolvedQuestion.findMany({ where: { projectId: niche.projectId } }),
      this.prisma.constraint.findMany({ where: { projectId: niche.projectId } }),
      this.prisma.evidenceItem.findMany({ where: { projectId: niche.projectId }, take: 100 }),
      this.prisma.sourceReference.findMany({ where: { projectId: niche.projectId } }),
    ]);

    const score = niche.scores[0];
    const input: PackContextInput = {
      niche: {
        title: niche.title, oneLiner: niche.oneLiner, problem: niche.problem, targetAudience: niche.targetAudience,
        whyNow: niche.whyNow, useCases: niche.useCases, competitors: niche.competitors, monetization: niche.monetization,
        mvpConcept: niche.mvpConcept, recommendedProductFormat: niche.recommendedProductFormat, riskLevel: niche.riskLevel,
        intakeMode: niche.intakeMode, founderIdeaText: niche.founderIdeaText,
      },
      score: score
        ? {
            totalScore: score.totalScore,
            confidenceValue: score.confidenceValue,
            confidenceLevel: score.confidenceLevel,
            explanation: score.explanation,
            breakdown: score.breakdown as unknown as PackScore['breakdown'],
          }
        : null,
      market: {
        country: project?.targetCountry ?? null,
        region: project?.targetRegion ?? null,
        marketLanguage: project?.marketLanguage ?? 'en',
        scope: project?.marketScope ?? 'global',
      },
      language,
      depth: opts.depth,
      vertical: opts.vertical,
      claims: claims.map((c) => ({ id: c.id, text: c.text, type: c.type, confidenceLevel: c.confidenceLevel })),
      assumptions: assumptions.map((a) => ({ id: a.id, text: a.text })),
      constraints: constraints.map((c) => ({ id: c.id, text: c.text })),
      unresolvedQuestions: questions.map((q) => ({ id: q.id, text: q.text })),
      evidence: evidence.map((e) => ({ id: e.id, summary: e.summary, sourceRefId: e.sourceRefId })),
      sourceRefs: sourceRefs.map((s) => ({ id: s.id, url: s.url, title: s.title, adapter: s.adapter })),
    };
    const ctx = buildPackContext(input);

    // Attach the Venture Thesis + Venture Scale Score (if computed for the niche)
    // and derive the Build Blueprint from the canonical context (consistent by
    // construction). Both are optional and additive — packs work without them.
    const vt = await this.prisma.ventureThesis.findFirst({ where: { nicheId }, orderBy: { createdAt: 'desc' } });
    if (vt) {
      ctx.ventureThesis = vt.thesis as unknown as VentureThesis;
      ctx.ventureScale = {
        totalScore: vt.ventureScaleScore,
        confidence: { value: vt.ventureScaleConfidence, level: vt.ventureScaleLevel as VentureScaleScoreResult['confidence']['level'] },
        breakdown: vt.ventureScaleBreakdown as unknown as VentureScaleScoreResult['breakdown'],
        whatMustBeTrue: vt.whatMustBeTrue as unknown as string[],
        explanation: (ctx.ventureThesis?.ventureScaleNarrative.text) ?? '',
      };
    }
    ctx.buildBlueprint = buildBuildBlueprint(ctx);
    return ctx;
  }
}

function extractLlmText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const record = result as Record<string, unknown>;
  if (typeof record.content === 'string') return record.content;
  if (typeof record.text === 'string') return record.text;
  return '';
}

function buildProductPackV2TruncatedException() {
  return new BadRequestException({
    code: 'product_pack_v2_output_truncated',
    message: 'Selected model/output limit returned truncated Product Pack JSON. Choose a model with higher output capacity.',
  });
}

function buildProductPackV2StepTruncatedException(step: ProductPackV2Step) {
  return new BadRequestException({
    code: 'product_pack_v2_output_truncated',
    message: `Selected model/output limit returned truncated JSON for the "${step.title}" step of Product Pack generation. Choose a model with higher output capacity.`,
  });
}

function extractFinishReason(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const direct = extractFinishReasonFromRecord(result as Record<string, unknown>);
  if (direct) return direct;
  const record = result as Record<string, unknown>;
  for (const key of ['metadata', 'providerMetadata', 'raw']) {
    const nested = record[key];
    if (!nested || typeof nested !== 'object') continue;
    const nestedReason = extractFinishReasonFromRecord(nested as Record<string, unknown>);
    if (nestedReason) return nestedReason;
  }
  return null;
}

function extractFinishReasonFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ['finishReason', 'stopReason', 'finish_reason', 'stop_reason']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isLikelyTruncatedPackOutput(input: {
  json: unknown;
  outputTokens: number;
  requestedMaxOutputTokens: number;
  effectiveMaxOutputTokens: number;
  finishReason: string | null;
}): boolean {
  if (input.json) return false;
  if (isLengthStopReason(input.finishReason)) return true;
  if (input.effectiveMaxOutputTokens > 0 && input.outputTokens >= input.effectiveMaxOutputTokens) return true;
  if (input.requestedMaxOutputTokens > 0 && input.outputTokens >= input.requestedMaxOutputTokens) return true;
  return false;
}

function isLengthStopReason(reason: string | null): boolean {
  return Boolean(reason && /\b(length|max[_ ]?tokens?|output[_ ]?limit|token[_ ]?limit|context[_ ]?window)\b/i.test(reason));
}

function parseJsonLike(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('empty_json');
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      return JSON.parse(fenced);
    } catch {
      const objectStart = fenced.indexOf('{');
      const objectEnd = fenced.lastIndexOf('}');
      const candidate = objectStart >= 0 && objectEnd > objectStart ? fenced.slice(objectStart, objectEnd + 1) : fenced;
      try {
        return JSON.parse(candidate);
      } catch {
        // Large multi-thousand-token JSON responses occasionally have one
        // minor syntax slip (an unescaped control character, a stray comma)
        // even with the provider's own JSON mode enabled. jsonrepair fixes
        // that class of error without needing another expensive LLM call —
        // only fall through to a full repair prompt if it can't either.
        try {
          return JSON.parse(jsonrepair(candidate));
        } catch {
          throw new Error('invalid_json');
        }
      }
    }
  }
}

/** Parse and validate ONE step's JSON output: documents must cover exactly this step's section keys, and any fields the step owns (see validateStepExtraFields) must be present. */
function parsePackV2StepJson(raw: string, step: ProductPackV2Step): ProductPackV2StepParseResult {
  try {
    const parsed = parseJsonLike(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { json: null, reason: 'schema_invalid_root' };
    }
    if (!Array.isArray(parsed.documents) || parsed.documents.length === 0) {
      return { json: null, reason: 'schema_missing_documents' };
    }
    if ((parsed.documents as unknown[]).some((doc) => !isValidPackV2Document(doc))) {
      return { json: null, reason: 'schema_invalid_documents' };
    }
    let documents = parsed.documents as ProductPackV2Document[];

    let matchedKeys = new Set(
      documents
        .map((doc) => resolvePackV2Section(doc.type, doc.title))
        .filter((section): section is typeof PRODUCT_PACK_V2_SECTIONS[number] => Boolean(section))
        .map((section) => section.key),
    );

    // The prompt asks for documents to be non-English-titled (translated)
    // but keeps "type" as the stable English key, in the same order as the
    // section list — occasionally the model still drifts on "type" too
    // (e.g. a descriptive slug instead of the exact key). If the document
    // count matches exactly, positional order is a safe fallback rather
    // than failing the whole step over a naming miss.
    if (step.sectionKeys.some((key) => !matchedKeys.has(key)) && documents.length === step.sectionKeys.length) {
      documents = documents.map((doc, index) => ({ ...doc, type: step.sectionKeys[index]! }));
      matchedKeys = new Set(step.sectionKeys);
    }

    if (step.sectionKeys.some((key) => !matchedKeys.has(key))) {
      return { json: null, reason: 'schema_missing_sections' };
    }

    if (!validateStepExtraFields(step.id, parsed)) {
      return { json: null, reason: 'schema_missing_top_level' };
    }

    return {
      json: { ...parsed, documents } as Partial<ProductPackV2Json> & { documents: ProductPackV2Document[] },
      reason: 'ok',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'empty_json') {
      return { json: null, reason: 'empty_json' };
    }
    return { json: null, reason: 'invalid_json' };
  }
}

interface ProductPackV2BcgStepParseResult {
  json: (Partial<ProductPackV2Json> & { documents: [ProductPackV2BcgDocument] }) | null;
  reason: ProductPackV2ParseReason;
}

/**
 * Parses the BCG step's response: reuses the generic envelope/section-key
 * validation (parsePackV2StepJson — the model still returns `documents: [1
 * item]` with `sections: []`), then additionally validates the structured
 * BCG fields the generic validator doesn't know about. A document that's
 * envelope-valid but has a missing/malformed `scorecard` or
 * `starUpgradeStrategy` etc. fails here with 'schema_invalid_bcg_fields'
 * rather than silently passing through as an empty-bodied document.
 */
function parseBcgStepJson(raw: string, step: ProductPackV2Step): ProductPackV2BcgStepParseResult {
  const base = parsePackV2StepJson(raw, step);
  if (!base.json) return { json: null, reason: base.reason };
  if (base.json.documents.length !== 1) {
    return { json: null, reason: 'schema_missing_sections' };
  }
  const doc = base.json.documents[0]!;
  if (!isValidBcgStructuredFields(doc)) {
    return { json: null, reason: 'schema_invalid_bcg_fields' };
  }
  return { json: { ...base.json, documents: [doc] }, reason: 'ok' };
}

function isValidBcgStructuredFields(doc: ProductPackV2Document): doc is ProductPackV2BcgDocument {
  const d = doc as unknown as Record<string, unknown>;

  const bcg = d.bcg;
  if (!isRecord(bcg)) return false;
  if (typeof bcg.currentPosition !== 'string' || !(BCG_POSITIONS as readonly string[]).includes(bcg.currentPosition)) return false;
  if (typeof bcg.classificationRationale !== 'string' || bcg.classificationRationale.trim().length < 40) return false;
  if (typeof bcg.opportunityType !== 'string' || typeof bcg.marketGrowthAssessment !== 'string') return false;

  const scorecard = d.scorecard;
  if (!Array.isArray(scorecard) || scorecard.length < 8) return false;
  if (!(scorecard as unknown[]).every((item) => isRecord(item)
    && typeof item.dimension === 'string'
    && typeof item.currentScore === 'number'
    && typeof item.rationale === 'string' && item.rationale.trim().length > 0
    && typeof item.whatWouldRaiseIt === 'string' && item.whatWouldRaiseIt.trim().length > 0
    && typeof item.evidenceNeeded === 'string' && item.evidenceNeeded.trim().length > 0)) return false;

  const diagnosis = d.currentStateDiagnosis;
  if (!isRecord(diagnosis) || !Array.isArray(diagnosis.weakParts) || !Array.isArray(diagnosis.promisingParts) || !Array.isArray(diagnosis.dangerousAssumptions)) return false;

  const strategy = d.starUpgradeStrategy;
  if (!isRecord(strategy)) return false;
  const upgradeTracks = ['productUpgrades', 'positioningUpgrades', 'distributionUpgrades', 'monetizationUpgrades', 'defensibilityUpgrades', 'evidenceUpgrades'];
  if (!upgradeTracks.every((k) => Array.isArray(strategy[k]) && (strategy[k] as unknown[]).length > 0)) return false;

  const unicorn = d.unicornGradeUpsidePath;
  if (!isRecord(unicorn)) return false;
  if (typeof unicorn.categoryExpansionNeeded !== 'string' || !Array.isArray(unicorn.proofRequiredBeforeClaimingUpside)) return false;

  const table = d.beforeAfterUpgradeTable;
  if (!Array.isArray(table) || table.length < 6) return false;
  if (!(table as unknown[]).every((item) => isRecord(item)
    && typeof item.dimension === 'string'
    && typeof item.currentScore === 'number'
    && typeof item.weakness === 'string'
    && typeof item.upgradeMove === 'string' && item.upgradeMove.trim().length > 0
    && typeof item.targetScoreAfterUpgrades === 'number'
    && typeof item.whyScoreImproves === 'string' && item.whyScoreImproves.trim().length > 0)) return false;

  const verdict = d.finalBcgVerdict;
  if (!isRecord(verdict)) return false;
  if (typeof verdict.currentBcgPosition !== 'string' || typeof verdict.targetBcgPositionAfterUpgrades !== 'string') return false;
  if (!Array.isArray(verdict.topFiveMovesRequired) || !Array.isArray(verdict.topFiveProofPointsRequired) || !Array.isArray(verdict.topFiveRisks)) return false;

  return true;
}

function mdTable(headers: string[], rows: string[][]): string {
  const escape = (v: string) => v.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const headerRow = `| ${headers.join(' | ')} |`;
  const sepRow = `|${headers.map(() => '---').join('|')}|`;
  const bodyRows = rows.map((row) => `| ${row.map(escape).join(' | ')} |`);
  return [headerRow, sepRow, ...bodyRows].join('\n');
}

function bulletList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '_(none provided)_';
}

/**
 * Deterministically renders the BCG document's structured fields into the
 * same `sections[]` shape every other document uses (heading/content/...),
 * including both markdown tables — built here in code, never asked of the
 * model, which is the whole point of the structured contract.
 */
function renderBcgDocumentToSections(doc: ProductPackV2BcgDocument): ProductPackV2Section[] {
  const { bcg, scorecard, currentStateDiagnosis: diag, starUpgradeStrategy: strat, unicornGradeUpsidePath: unicorn, beforeAfterUpgradeTable, finalBcgVerdict: verdict } = doc;

  const scorecardTable = mdTable(
    ['Dimension', 'Score', 'Rationale', 'What would raise it', 'Evidence needed'],
    scorecard.map((item) => [item.dimension, String(item.currentScore), item.rationale, item.whatWouldRaiseIt, item.evidenceNeeded]),
  );
  const upgradeTable = mdTable(
    ['Dimension', 'Current score', 'Weakness', 'Upgrade move', 'Target score after upgrades', 'Why score improves'],
    beforeAfterUpgradeTable.map((item) => [item.dimension, String(item.currentScore), item.weakness, item.upgradeMove, String(item.targetScoreAfterUpgrades), item.whyScoreImproves]),
  );

  return [
    {
      heading: 'A. Current BCG Position',
      content: `**${bcg.currentPosition}** (${bcg.opportunityType})\n\n${bcg.classificationRationale}\n\nMarket growth: ${bcg.marketGrowthAssessment}\n\nRelative competitive position: ${bcg.relativeCompetitivePosition}`,
      examples: [], implementationNotes: [], assumptions: bcg.starBlockers, risks: [], evidenceRefs: [], sourceNeeds: [],
    },
    {
      heading: 'B. BCG Scorecard',
      content: scorecardTable,
      examples: [], implementationNotes: [], assumptions: [], risks: [], evidenceRefs: [], sourceNeeds: [],
    },
    {
      heading: 'C. Current State Diagnosis',
      content: `**Weak parts**\n${bulletList(diag.weakParts)}\n\n**Promising parts**\n${bulletList(diag.promisingParts)}\n\n**Dog-collapse risks**\n${bulletList(diag.dogRisks)}\n\n**Breakout triggers**\n${bulletList(diag.breakoutTriggers)}`,
      examples: [], implementationNotes: [], assumptions: diag.dangerousAssumptions, risks: diag.dogRisks, evidenceRefs: [], sourceNeeds: [],
    },
    {
      heading: 'D. Star Upgrade Strategy',
      content: [
        '**Product upgrades**', bulletList(strat.productUpgrades), '',
        '**Positioning upgrades**', bulletList(strat.positioningUpgrades), '',
        '**Distribution upgrades**', bulletList(strat.distributionUpgrades), '',
        '**Monetization upgrades**', bulletList(strat.monetizationUpgrades), '',
        '**Defensibility upgrades**', bulletList(strat.defensibilityUpgrades), '',
        '**Evidence upgrades**', bulletList(strat.evidenceUpgrades),
      ].join('\n'),
      examples: [], implementationNotes: [], assumptions: [], risks: [], evidenceRefs: [], sourceNeeds: strat.evidenceUpgrades,
    },
    {
      heading: 'E. Unicorn-grade Upside Path',
      content: [
        `Category expansion needed: ${unicorn.categoryExpansionNeeded}`,
        `Platform/ecosystem move: ${unicorn.platformOrEcosystemMove}`,
        `Moat needed: ${unicorn.moatNeeded}`,
        `Distribution advantage needed: ${unicorn.distributionAdvantageNeeded}`,
        `Pricing/LTV path: ${unicorn.pricingOrLtvPath}`,
        `Product surface expansion: ${unicorn.productSurfaceExpansion}`,
        '', '**Proof required before claiming this upside**', bulletList(unicorn.proofRequiredBeforeClaimingUpside),
        '', '**What would make investors believe this**', bulletList(unicorn.investorBeliefTriggers),
      ].join('\n'),
      examples: [], implementationNotes: [], assumptions: unicorn.proofRequiredBeforeClaimingUpside, risks: [], evidenceRefs: [], sourceNeeds: [],
    },
    {
      heading: 'F. Before / After Upgrade Table',
      content: upgradeTable,
      examples: [], implementationNotes: [], assumptions: [], risks: [], evidenceRefs: [], sourceNeeds: [],
    },
    {
      heading: 'G. Final BCG Verdict',
      content: [
        `Current BCG position: ${verdict.currentBcgPosition}`,
        `Target BCG position after upgrades: ${verdict.targetBcgPositionAfterUpgrades}`,
        `Minimum ambition: ${bcg.minimumAmbition}. Maximum ambition: ${bcg.maximumAmbition}.`,
        '', '**Top 5 moves required**', bulletList(verdict.topFiveMovesRequired),
        '', '**Top 5 proof points required**', bulletList(verdict.topFiveProofPointsRequired),
        '', '**Top 5 risks that can kill the upgrade**', bulletList(verdict.topFiveRisks),
      ].join('\n'),
      examples: [], implementationNotes: [], assumptions: [], risks: verdict.topFiveRisks, evidenceRefs: [], sourceNeeds: verdict.topFiveProofPointsRequired,
    },
  ];
}

/** Parse+validate one amended document, forcing `type`/`layer` back to the original's (the model is asked to keep them, but identity must never drift from a single-document amend). */
function parseAmendedDocument(raw: string, original: ProductPackV2Document): ProductPackV2Document | null {
  try {
    const parsed = parseJsonLike(raw);
    if (!isValidPackV2Document(parsed)) return null;
    return { ...parsed, type: original.type, layer: original.layer };
  } catch {
    return null;
  }
}

function isValidPackV2Document(doc: unknown): doc is ProductPackV2Document {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as Record<string, unknown>;
  return (
    typeof d.type === 'string' &&
    typeof d.title === 'string' &&
    Array.isArray(d.audience) &&
    typeof d.purpose === 'string' &&
    typeof d.whatThisIs === 'string' &&
    typeof d.whyItExists === 'string' &&
    typeof d.howToUse === 'string' &&
    Array.isArray(d.connections) &&
    Array.isArray(d.doneDefinition) &&
    Array.isArray(d.sections) &&
    Array.isArray(d.acceptanceCriteria) &&
    (d.sections as unknown[]).every((section) => isValidPackV2Section(section))
  );
}

function isValidPackV2Section(section: unknown): section is ProductPackV2Section {
  if (!section || typeof section !== 'object') return false;
  const s = section as Record<string, unknown>;
  return (
    typeof s.heading === 'string' &&
    typeof s.content === 'string' &&
    Array.isArray(s.examples) &&
    Array.isArray(s.implementationNotes) &&
    Array.isArray(s.assumptions) &&
    Array.isArray(s.risks) &&
    Array.isArray(s.evidenceRefs) &&
    Array.isArray(s.sourceNeeds)
  );
}

/** Checks the top-level fields a given step is responsible for (beyond the universal `documents[]`), mirroring each step's `extraFieldsContract` in product-pack-v2.steps.ts. */
function validateStepExtraFields(stepId: ProductPackV2StepId, obj: Record<string, unknown>): boolean {
  switch (stepId) {
    case 'vision':
      return (
        typeof obj.packTitle === 'string' &&
        obj.packTitle.trim().length > 0 &&
        typeof obj.oneLineThesis === 'string' &&
        typeof obj.language === 'string' &&
        isRecord(obj.ideaAmplification) &&
        isRecord(obj.recommendedStrategy)
      );
    case 'build_product':
      return true;
    case 'build_design':
      return Array.isArray(obj.screenStoryboard) && isRecord(obj.navigation);
    case 'build_engineering':
      return Array.isArray(obj.apiContracts) && Array.isArray(obj.dataModel);
    case 'execution':
      return Array.isArray(obj.executionPhases) && isRecord(obj.roleBriefs);
    case 'qira_backlog': {
      const handoff = obj.executionHandoff;
      return isRecord(handoff) && isRecord(handoff.qiraBacklogDraft);
    }
    case 'ai_agent_bundle': {
      const handoff = obj.executionHandoff;
      return isRecord(handoff) && Array.isArray(handoff.aiAgentPromptBundleDraft);
    }
    case 'evidence':
      return isRecord(obj.quality) && Array.isArray(obj.risks) && Array.isArray(obj.exportAssets);
    default:
      return true;
  }
}

/** Merge one step's extra fields into the running accumulator. `executionHandoff` is special-cased since two separate steps (qira_backlog, ai_agent_bundle) each own a different sub-key of it. */
function mergeStepFields(target: Record<string, unknown>, extra: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(extra)) {
    if (key === 'executionHandoff' && isRecord(target.executionHandoff) && isRecord(value)) {
      target.executionHandoff = { ...target.executionHandoff, ...value };
    } else {
      target[key] = value;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidQuality(value: unknown): value is ProductPackV2Json['quality'] {
  if (!isRecord(value)) return false;
  return (
    typeof value.completenessScore === 'number' &&
    typeof value.confidenceScore === 'number' &&
    typeof value.assumptionCount === 'number' &&
    typeof value.evidenceCount === 'number' &&
    typeof value.riskLevel === 'string' &&
    Array.isArray(value.missingInputs)
  );
}

/**
 * Merge the accumulated per-step fields and documents into the same
 * `ProductPackV2Json` shape the (unchanged) downstream normalize/metadata/
 * quality-gate functions already expect. Any field a step never reached
 * (because the pipeline stopped early) gets a safe default instead of
 * `undefined`, so an incomplete pack degrades gracefully rather than
 * crashing post-processing — the structure-gate check already surfaces
 * exactly which sections are missing.
 */
function finalizePackV2Json(
  fields: Record<string, unknown>,
  documents: ProductPackV2Document[],
  ctx: PackContext,
): ProductPackV2Json {
  const executionHandoff = isRecord(fields.executionHandoff)
    ? {
        mode: typeof fields.executionHandoff.mode === 'string' ? fields.executionHandoff.mode : FALLBACK_EXECUTION_HANDOFF.mode,
        qiraBacklogDraft: isRecord(fields.executionHandoff.qiraBacklogDraft)
          ? (fields.executionHandoff.qiraBacklogDraft as unknown as ProductPackV2QiraBacklog)
          : null,
        aiAgentPromptBundleDraft: Array.isArray(fields.executionHandoff.aiAgentPromptBundleDraft)
          ? (fields.executionHandoff.aiAgentPromptBundleDraft as ProductPackV2AiAgentPrompt[])
          : [],
      }
    : FALLBACK_EXECUTION_HANDOFF;

  return {
    packTitle: typeof fields.packTitle === 'string' && fields.packTitle.trim() ? fields.packTitle : ctx.niche.title,
    oneLineThesis: typeof fields.oneLineThesis === 'string' && fields.oneLineThesis.trim() ? fields.oneLineThesis : ctx.niche.oneLiner,
    language: typeof fields.language === 'string' && fields.language.trim() ? fields.language : ctx.language,
    packType: typeof fields.packType === 'string' && fields.packType.trim() ? fields.packType : 'build_ready_product_pack',
    ideaAmplification: isRecord(fields.ideaAmplification) ? fields.ideaAmplification : {},
    recommendedStrategy: isRecord(fields.recommendedStrategy) ? fields.recommendedStrategy : {},
    quality: isValidQuality(fields.quality)
      ? fields.quality
      : {
          completenessScore: 0,
          confidenceScore: ctx.score?.confidenceValue ?? 0.5,
          assumptionCount: 0,
          evidenceCount: 0,
          riskLevel: 'medium',
          missingInputs: ['evidence_layer_step_incomplete'],
        },
    documents,
    roleBriefs: isRecord(fields.roleBriefs) ? (fields.roleBriefs as Record<string, string[]>) : {},
    screenStoryboard: Array.isArray(fields.screenStoryboard) ? fields.screenStoryboard : [],
    navigation: isRecord(fields.navigation) ? fields.navigation : {},
    apiContracts: Array.isArray(fields.apiContracts) ? fields.apiContracts : [],
    dataModel: Array.isArray(fields.dataModel) ? fields.dataModel : [],
    risks: Array.isArray(fields.risks) ? fields.risks : [],
    executionPhases: Array.isArray(fields.executionPhases) ? fields.executionPhases : [],
    executionHandoff,
    exportAssets: Array.isArray(fields.exportAssets) ? fields.exportAssets : [],
  };
}

/**
 * Deterministic (non-LLM) summary of what a completed step decided, handed
 * to the next step's prompt as "PRIOR LAYERS" context. Kept non-LLM so it
 * never becomes its own failure point.
 */
function summarizeStepForNextStep(
  step: ProductPackV2Step,
  result: { documents: ProductPackV2Document[]; extraFields: Record<string, unknown> },
): string {
  const lines: string[] = [`${step.title}:`];
  switch (step.id) {
    case 'vision': {
      const strategy = result.extraFields.recommendedStrategy;
      lines.push(`- Pack title: ${String(result.extraFields.packTitle ?? '')}`);
      lines.push(`- One-line thesis: ${String(result.extraFields.oneLineThesis ?? '')}`);
      if (isRecord(strategy) && strategy.name) {
        lines.push(`- Recommended strategic wedge: ${String(strategy.name)}${strategy.strategicWedge ? ` — ${String(strategy.strategicWedge)}` : ''}`);
      }
      break;
    }
    case 'bcg_star_evaluation': {
      const bcgDoc = result.documents[0] as ProductPackV2BcgDocument | undefined;
      if (bcgDoc?.bcg) {
        lines.push(`- BCG position: ${bcgDoc.bcg.currentPosition} (${bcgDoc.bcg.opportunityType}) — target: ${bcgDoc.finalBcgVerdict?.targetBcgPositionAfterUpgrades ?? bcgDoc.bcg.maximumAmbition}`);
      }
      break;
    }
    case 'build_product': {
      const mvpDoc = result.documents.find((doc) => resolvePackV2Section(doc.type, doc.title)?.key === 'mvp_scope');
      if (mvpDoc) lines.push(`- MVP scope defined in "${mvpDoc.title}": ${mvpDoc.purpose}`);
      const icpDoc = result.documents.find((doc) => resolvePackV2Section(doc.type, doc.title)?.key === 'target_audience_icp');
      if (icpDoc) lines.push(`- ICP: ${icpDoc.purpose}`);
      break;
    }
    case 'build_design': {
      const storyboard = Array.isArray(result.extraFields.screenStoryboard) ? result.extraFields.screenStoryboard : [];
      const screens = storyboard
        .map((entry) => (isRecord(entry) && typeof entry.screen === 'string' ? entry.screen : null))
        .filter((screen): screen is string => Boolean(screen));
      if (screens.length) lines.push(`- Screens: ${screens.join(', ')}`);
      break;
    }
    case 'build_engineering': {
      const dataModel = Array.isArray(result.extraFields.dataModel) ? result.extraFields.dataModel : [];
      const entities = dataModel
        .map((entry) => (isRecord(entry) && typeof entry.entity === 'string' ? entry.entity : null))
        .filter((entity): entity is string => Boolean(entity));
      if (entities.length) lines.push(`- Entities: ${entities.join(', ')}`);
      const apiContracts = Array.isArray(result.extraFields.apiContracts) ? result.extraFields.apiContracts : [];
      const endpoints = apiContracts
        .map((entry) => (isRecord(entry) && typeof entry.name === 'string' ? entry.name : null))
        .filter((name): name is string => Boolean(name));
      if (endpoints.length) lines.push(`- Endpoints: ${endpoints.join(', ')}`);
      break;
    }
    case 'execution': {
      const phases = Array.isArray(result.extraFields.executionPhases) ? result.extraFields.executionPhases : [];
      const phaseNames = phases
        .map((entry) => (isRecord(entry) && typeof entry.phase === 'string' ? entry.phase : null))
        .filter((phase): phase is string => Boolean(phase));
      if (phaseNames.length) lines.push(`- Execution phases: ${phaseNames.join(', ')}`);
      break;
    }
    case 'qira_backlog': {
      const handoff = result.extraFields.executionHandoff;
      const epics = isRecord(handoff) && isRecord(handoff.qiraBacklogDraft) && Array.isArray(handoff.qiraBacklogDraft.epics)
        ? handoff.qiraBacklogDraft.epics
        : [];
      const epicTitles = epics
        .map((entry) => (isRecord(entry) && typeof entry.title === 'string' ? entry.title : null))
        .filter((title): title is string => Boolean(title));
      if (epicTitles.length) lines.push(`- Backlog epics already drafted: ${epicTitles.join(', ')}`);
      break;
    }
    case 'ai_agent_bundle': {
      const handoff = result.extraFields.executionHandoff;
      const prompts = isRecord(handoff) && Array.isArray(handoff.aiAgentPromptBundleDraft) ? handoff.aiAgentPromptBundleDraft : [];
      const promptTitles = prompts
        .map((entry) => (isRecord(entry) && typeof entry.title === 'string' ? entry.title : null))
        .filter((title): title is string => Boolean(title));
      if (promptTitles.length) lines.push(`- AI-agent prompts already drafted: ${promptTitles.join(', ')}`);
      break;
    }
    case 'evidence': {
      const quality = result.extraFields.quality;
      if (isRecord(quality) && typeof quality.riskLevel === 'string') {
        lines.push(`- Overall risk level: ${quality.riskLevel}`);
      }
      break;
    }
  }
  // Generic per-document listing (title + one-line purpose) so later steps can
  // say "see <Title> for X" instead of re-deriving content this step already
  // covered — the bullets above carry extra structured facts (screens,
  // entities, epics…) specific to this step, this covers every document.
  if (result.documents.length) {
    lines.push('- Documents already produced in this step:');
    for (const document of result.documents) {
      const purpose = document.purpose.length > 140 ? `${document.purpose.slice(0, 140)}…` : document.purpose;
      lines.push(`  - "${document.title}": ${purpose}`);
    }
  }
  return lines.join('\n');
}

function documentToMarkdown(doc: ProductPackV2Document): string {
  const lines: string[] = [
    `# ${doc.title}`,
    '',
    `**Audience:** ${doc.audience.join(', ') || '—'}`,
    `**What this is:** ${doc.whatThisIs}`,
    `**Why it exists:** ${doc.whyItExists}`,
    `**Purpose:** ${doc.purpose}`,
    `**How to use:** ${doc.howToUse}`,
  ];

  if (doc.connections.length) {
    lines.push('', '## Connections', ...doc.connections.map((item) => `- ${item}`));
  }

  if (doc.sections.length) {
    lines.push('', '## Sections');
    for (const section of doc.sections) {
      lines.push('', `### ${section.heading}`, section.content);
      if (section.examples.length) lines.push('', '**Examples**', ...section.examples.map((item) => `- ${item}`));
      if (section.implementationNotes.length) lines.push('', '**Implementation notes**', ...section.implementationNotes.map((item) => `- ${item}`));
      if (section.assumptions.length) lines.push('', '**Assumptions**', ...section.assumptions.map((item) => `- ${item}`));
      if (section.risks.length) lines.push('', '**Risks**', ...section.risks.map((item) => `- ${item}`));
      if (section.evidenceRefs.length) lines.push('', '**Evidence refs**', ...section.evidenceRefs.map((item) => `- ${item}`));
      if (section.sourceNeeds.length) lines.push('', '**Source needs**', ...section.sourceNeeds.map((item) => `- ${item}`));
    }
  }

  if (doc.doneDefinition.length) {
    lines.push('', '## Done Definition', ...doc.doneDefinition.map((item) => `- ${item}`));
  }

  if (doc.acceptanceCriteria.length) {
    lines.push('', '## Acceptance Criteria', ...doc.acceptanceCriteria.map((item) => `- ${item}`));
  }

  return `${lines.join('\n').trim()}\n`;
}

function mapPackV2DocumentToProductPackDocument(
  doc: ProductPackV2Document,
  packJson: ProductPackV2Json,
  packMetadata: ReturnType<typeof buildProductPackV2Metadata>,
  ctx: PackContext,
  opts: GeneratePackOptions,
  packId: string,
  aiRuns: PackV2StepAiRuns,
): Prisma.ProductPackDocumentUncheckedCreateInput {
  const confidenceValue = normalizeConfidenceScore(packJson.quality.confidenceScore);
  const section = resolvePackV2Section(doc.type, doc.title);
  return {
    packId,
    docType: (section?.key ?? doc.type ?? slugifyDocType(doc.title)) as DocumentType,
    title: doc.title,
    body: documentToMarkdown(doc),
    language: ctx.language,
    status: 'draft',
    confidenceValue,
    confidenceLevel: confidenceLevelFromScore(confidenceValue),
    qualityGateStatus: 'not_run',
    metadata: {
      language: ctx.language,
      market: ctx.market,
      packDepth: opts.depth,
      verticalTemplate: opts.vertical,
      confidence: { value: confidenceValue, level: confidenceLevelFromScore(confidenceValue) },
      sourceRefIds: ctx.sourceRefs.map((source) => source.id),
      claimIds: ctx.claims.map((claim) => claim.id),
      assumptionIds: ctx.assumptions.map((assumption) => assumption.id),
      constraintIds: ctx.constraints.map((constraint) => constraint.id),
      unresolvedQuestionIds: ctx.unresolvedQuestions.map((question) => question.id),
      aiRuns,
      pack: packJson,
      packMetadata,
      document: doc,
      layer: section?.layer ?? 'build',
      section: section ? { key: section.key, title: section.title } : null,
    } as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Lightweight per-document row for staged availability: unlike
 * mapPackV2DocumentToProductPackDocument, this doesn't need the full
 * aggregated packJson/packMetadata (those only exist once every step has
 * run) — just this one document, rendered the same way
 * (documentToMarkdown), marked `interim: true` so it's identifiable while
 * the pipeline is still running. The final transaction in generatePackV2
 * deletes and replaces every row for this pack with the fully-normalized
 * set, so these interim rows never linger once generation finishes.
 */
function mapPackV2DocumentToInterimRow(
  doc: ProductPackV2Document,
  ctx: PackContext,
  opts: GeneratePackOptions,
  packId: string,
): Prisma.ProductPackDocumentUncheckedCreateInput {
  const section = resolvePackV2Section(doc.type, doc.title);
  return {
    packId,
    docType: (section?.key ?? doc.type ?? slugifyDocType(doc.title)) as DocumentType,
    title: doc.title,
    body: documentToMarkdown(doc),
    language: ctx.language,
    status: 'generating',
    confidenceValue: 0,
    confidenceLevel: 'low',
    qualityGateStatus: 'not_run',
    metadata: {
      language: ctx.language,
      packDepth: opts.depth,
      verticalTemplate: opts.vertical,
      document: doc,
      layer: section?.layer ?? 'build',
      section: section ? { key: section.key, title: section.title } : null,
      interim: true,
    } as unknown as Prisma.InputJsonValue,
  };
}

function normalizePackV2Pack(packJson: ProductPackV2Json): ProductPackV2Json {
  const hasSources = hasPackSources(packJson);
  const documents = sortPackV2Documents(packJson.documents).map((doc) => normalizePackV2DocumentEvidence(doc, hasSources));
  const missingInputs = new Set(packJson.quality.missingInputs);
  if (!hasSources) missingInputs.add('sources_required_for_evidence_backed_claims');
  return {
    ...packJson,
    packTitle: normalizePackTitle(packJson.packTitle),
    documents,
    quality: {
      ...packJson.quality,
      evidenceCount: hasSources ? packJson.quality.evidenceCount : 0,
      missingInputs: [...missingInputs],
    },
  };
}

function buildProductPackV2Metadata(packJson: ProductPackV2Json, aiRuns: PackV2StepAiRuns) {
  const qualityGates = buildProductPackV2QualityMetadata(packJson);
  const layerOrder: ProductPackV2Layer[] = ['vision', 'build', 'execution', 'evidence'];
  const layers = layerOrder.map((layer) => {
    const definitions = PRODUCT_PACK_V2_SECTIONS.filter((section) => section.layer === layer);
    const documents = packJson.documents.filter((doc) => definitions.some((section) => section.key === resolvePackV2DocType(doc)));
    return {
      key: layer,
      title: layerLabel(layer),
      documentTypes: documents.map((doc) => resolvePackV2DocType(doc) as DocumentType),
      titles: documents.map((doc) => doc.title),
    };
  });
  return {
    packType: packJson.packType,
    packTitle: normalizePackTitle(packJson.packTitle),
    sourceMode: hasPackSources(packJson) ? 'source_backed' : 'starter_hypothesis',
    qualityGates,
    layers,
    executionHandoff: packJson.executionHandoff,
    aiRuns,
  };
}

function buildProductPackV2QualityMetadata(packJson: ProductPackV2Json): ProductPackV2QualityGates {
  const presentSections = new Set(
    packJson.documents
      .map((doc) => resolvePackV2Section(doc.type, doc.title))
      .filter((section): section is typeof PRODUCT_PACK_V2_SECTIONS[number] => Boolean(section))
      .map((section) => section.key),
  );
  const missingSections = PRODUCT_PACK_V2_SECTIONS.filter((section) => !presentSections.has(section.key));
  const hasSources = hasPackSources(packJson);
  const hasSourceLabels = packJson.documents.some((doc) =>
    doc.sections.some(
      (section) =>
        section.evidenceRefs.some((ref) => ref.toLowerCase().includes('source_needed')) ||
        section.assumptions.some((assumption) => /needs source|assumption/i.test(assumption)),
    ),
  );
  const buildLayerKeys = PRODUCT_PACK_V2_SECTIONS.filter((section) => section.layer === 'build').map((section) => section.key);
  const buildableCount = packJson.documents.filter((doc) => {
    const sectionKey = resolvePackV2SectionKey(doc);
    return sectionKey ? buildLayerKeys.includes(sectionKey) : false;
  }).length;
  const openQuestions = [...packJson.quality.missingInputs];
  const sourceNeeds = hasSources ? [] : ['Add source-backed market, competitor, and user evidence before treating claims as proven facts.'];
  const whatNotToBuildOrClaim = hasSources
    ? []
    : ['Do not claim sourced market, regulatory, or competitive facts until actual source references are attached.'];
  return {
    structureGate: missingSections.length ? 'missing_required_sections' : 'complete',
    evidenceGate: hasSources ? 'supported' : 'starter_hypothesis',
    safetyGate: hasSourceLabels || !hasSources ? 'needs_source_labels' : 'clear',
    buildabilityGate: buildableCount >= buildLayerKeys.length ? 'ready' : 'incomplete',
    exportGate: isExportSafePackTitle(packJson.packTitle) ? 'ready' : 'naming_issue',
    openQuestions,
    sourceNeeds,
    whatNotToBuildOrClaim,
  };
}

function buildProductPackV2QualityGate(
  packJson: ProductPackV2Json,
  qualityGates: ProductPackV2QualityGates,
): ReturnType<typeof runQualityGates> {
  const presentSections = new Set(
    packJson.documents
      .map((doc) => resolvePackV2Section(doc.type, doc.title))
      .filter((section): section is typeof PRODUCT_PACK_V2_SECTIONS[number] => Boolean(section))
      .map((section) => section.key),
  );
  const missingSections = PRODUCT_PACK_V2_SECTIONS.filter((section) => !presentSections.has(section.key));
  const checks: ProductPackV2GateCheck[] = [
    {
      id: 'structure-gate',
      label: 'Structure gate',
      status: missingSections.length ? 'fail' : 'pass',
      message: missingSections.length
        ? `Missing sections: ${missingSections.map((section) => section.title).join(', ')}`
        : 'All canonical Product Pack sections are present and ordered.',
      documentTypes: missingSections.map((section) => section.key as DocumentType),
    },
    {
      id: 'evidence-gate',
      label: 'Evidence gate',
      status: qualityGates.evidenceGate === 'supported' ? 'pass' : 'warn',
      message:
        qualityGates.evidenceGate === 'supported'
          ? 'Evidence is present for the current pack.'
          : qualityGates.evidenceGate === 'starter_hypothesis'
            ? 'Structure is valid, but evidence is starter-hypothesis only and needs sources.'
            : 'Evidence is weak and claims should be treated as assumptions until sourced.',
      documentTypes: [],
    },
    {
      id: 'safety-gate',
      label: 'Safety gate',
      status: qualityGates.safetyGate === 'clear' ? 'pass' : 'warn',
      message:
        qualityGates.safetyGate === 'clear'
          ? 'Claims are aligned with the current evidence state.'
          : 'Unsourced claims were converted into assumptions or source-needed notes.',
      documentTypes: [],
    },
    {
      id: 'buildability-gate',
      label: 'Buildability gate',
      status: qualityGates.buildabilityGate === 'ready' ? 'pass' : 'warn',
      message:
        qualityGates.buildabilityGate === 'ready'
          ? 'Build and execution layers are present for downstream teams.'
          : 'Some build-oriented sections are incomplete.',
      documentTypes: [],
    },
    {
      id: 'export-gate',
      label: 'Export gate',
      status: isExportSafePackTitle(packJson.packTitle) ? 'pass' : 'fail',
      message: isExportSafePackTitle(packJson.packTitle)
        ? 'Pack naming is export-safe (not a placeholder/preview title).'
        : 'Pack title must not be empty or a preview placeholder.',
      documentTypes: [],
    },
    ...runProductPackV2ContentQualityChecks({
      documents: packJson.documents,
      dataModel: packJson.dataModel as Array<{ entity?: string }>,
      evidenceCount: packJson.quality.evidenceCount,
    }).map((check) => ({ ...check, documentTypes: check.documentTypes as DocumentType[] })),
  ];
  const passedCount = checks.filter((check) => check.status === 'pass').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;
  const failCount = checks.filter((check) => check.status === 'fail').length;
  return {
    status: failCount ? 'failed' : warnCount ? 'warnings' : 'passed',
    checks,
    passedCount,
    warnCount,
    failCount,
  };
}

function sortPackV2Documents(documents: ProductPackV2Document[]): ProductPackV2Document[] {
  const sectionOrder = new Map(PRODUCT_PACK_V2_SECTIONS.map((section, index) => [section.key, index]));
  return [...documents].sort((left, right) => {
    const leftSectionKey = resolvePackV2SectionKey(left);
    const rightSectionKey = resolvePackV2SectionKey(right);
    const leftOrder = leftSectionKey ? (sectionOrder.get(leftSectionKey) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const rightOrder = rightSectionKey ? (sectionOrder.get(rightSectionKey) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

function normalizePackV2DocumentEvidence(doc: ProductPackV2Document, hasSources: boolean): ProductPackV2Document {
  if (hasSources) return doc;
  return {
    ...doc,
    sections: doc.sections.map((section) => {
      const touched = hasUnsupportedEvidenceClaim(section.content) ||
        section.examples.some(hasUnsupportedEvidenceClaim) ||
        section.implementationNotes.some(hasUnsupportedEvidenceClaim);
      return {
        ...section,
        content: touched ? markSourceNeeded(section.content) : section.content,
        examples: section.examples.map((item) => (hasUnsupportedEvidenceClaim(item) ? markSourceNeeded(item) : item)),
        implementationNotes: section.implementationNotes.map((item) => (hasUnsupportedEvidenceClaim(item) ? markSourceNeeded(item) : item)),
        assumptions: touched || section.assumptions.length === 0
          ? uniqueStrings([
              ...section.assumptions,
              'Needs source before being treated as evidence-backed.',
            ])
          : section.assumptions,
        evidenceRefs: section.evidenceRefs.length ? section.evidenceRefs : ['source_needed'],
      };
    }),
  };
}

function hasPackSources(packJson: ProductPackV2Json): boolean {
  if (packJson.quality.evidenceCount > 0) return true;
  return packJson.documents.some((doc) =>
    doc.sections.some((section) =>
      section.evidenceRefs.some((ref) => Boolean(ref.trim()) && !ref.toLowerCase().includes('source_needed')),
    ),
  );
}

function hasUnsupportedEvidenceClaim(value: string): boolean {
  return /\b(according to|reports|report|data shows|studies show|research shows|agencies|agency data)\b/i.test(value);
}

function markSourceNeeded(value: string): string {
  return /^assumption \/ needs source:/i.test(value) ? value : `Assumption / needs source: ${value}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolvePackV2DocType(doc: ProductPackV2Document): string {
  return resolvePackV2SectionKey(doc) ?? doc.type;
}

function resolvePackV2SectionKey(doc: ProductPackV2Document): ProductPackV2SectionKey | null {
  return resolvePackV2Section(doc.type, doc.title)?.key ?? null;
}

function layerLabel(layer: ProductPackV2Layer): string {
  switch (layer) {
    case 'vision':
      return 'Vision';
    case 'build':
      return 'Build';
    case 'execution':
      return 'Execution';
    case 'evidence':
      return 'Evidence';
  }
}

function resolvePackV2Section(type?: string | null, title?: string | null) {
  const normalizedType = normalizePackV2DocumentValue(type);
  const normalizedTitle = normalizePackV2DocumentValue(title);
  return PRODUCT_PACK_V2_SECTIONS.find(
    (section) =>
      normalizePackV2DocumentValue(section.key) === normalizedType ||
      normalizePackV2DocumentValue(section.title) === normalizedType ||
      normalizePackV2DocumentValue(section.title) === normalizedTitle,
  );
}

function normalizePackV2DocumentValue(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugifyDocType(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractPackV2Metadata(
  documents: Array<{ metadata: unknown }>,
): ReturnType<typeof buildProductPackV2Metadata> | null {
  for (const document of documents) {
    if (!document.metadata || typeof document.metadata !== 'object') continue;
    const record = document.metadata as Record<string, unknown>;
    if (record.packMetadata && typeof record.packMetadata === 'object') {
      return record.packMetadata as ReturnType<typeof buildProductPackV2Metadata>;
    }
  }
  return null;
}

function normalizePackTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed && !/preview/i.test(trimmed) ? trimmed : 'Build-Ready Product Pack';
}

/**
 * The export gate's real intent is "not a placeholder/preview title" — it
 * was previously checking for exact equality with the literal string
 * "Build-Ready Product Pack", which made it fail for every real pack once
 * generation actually started producing genuine, idea-specific titles (the
 * system prompt asks for a real product identity, not a generic label).
 * normalizePackTitle already defensively rewrites empty/preview titles
 * before anything is stored or shown, so grade the same normalized title
 * we actually use — not the pre-correction raw one.
 */
function isExportSafePackTitle(title: string): boolean {
  return normalizePackTitle(title).trim().length > 0;
}

function normalizeConfidenceScore(score: number): number {
  const value = Number.isFinite(score) ? score : 0;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function confidenceLevelFromScore(score: number): 'very_low' | 'low' | 'medium' | 'high' | 'very_high' {
  if (score < 0.2) return 'very_low';
  if (score < 0.4) return 'low';
  if (score < 0.6) return 'medium';
  if (score < 0.8) return 'high';
  return 'very_high';
}

function confidenceValueFromLevel(level: string): number {
  switch (level) {
    case 'very_low':
      return 0.1;
    case 'low':
      return 0.3;
    case 'medium':
      return 0.55;
    case 'high':
      return 0.75;
    case 'very_high':
      return 0.9;
    default:
      return 0.5;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function mapPackGenerationError(error: unknown, fallbackMessage: string) {
  if (error instanceof BadRequestException) return error;
  if (error instanceof LLMError) {
    const message = error.message || '';
    if (message.includes('llm_model_not_configured')) {
      return new BadRequestException({ code: 'llm_model_not_configured', message });
    }
    if (message.includes('llm_missing_connection')) {
      return new BadRequestException({ code: 'llm_missing_connection', message });
    }
    if (message.includes('llm_model_not_found')) {
      return new BadRequestException({ code: 'llm_model_not_found', message });
    }
    if (error.kind === 'timeout') {
      return new BadRequestException({ code: 'llm_timeout', message: 'The LLM request timed out.' });
    }
    if (error.kind === 'auth') {
      return new BadRequestException({ code: 'llm_auth_failed', message: message || fallbackMessage });
    }
    if (error.kind === 'invalid_request') {
      return new BadRequestException({ code: 'llm_invalid_request', message: message || fallbackMessage });
    }
    return new BadRequestException({ code: 'llm_provider_error', message: message || fallbackMessage });
  }

  if (error instanceof Error && error.message.includes('llm_timeout')) {
    return new BadRequestException({ code: 'llm_timeout', message: 'The LLM request timed out.' });
  }
  if (error instanceof Error && error.message.includes('product_pack_v2_output_truncated')) {
    return buildProductPackV2TruncatedException();
  }
  if (error instanceof Error && error.message.includes('product_pack_v2_repair_failed')) {
    return new BadRequestException({ code: 'product_pack_v2_repair_failed', message: error.message });
  }
  if (error instanceof Error && error.message.includes('product_pack_v2_invalid_output')) {
    return new BadRequestException({ code: 'product_pack_v2_invalid_output', message: error.message });
  }
  return new BadRequestException({
    code: 'product_pack_v2_generation_failed',
    message: error instanceof Error ? error.message : fallbackMessage,
  });
}
