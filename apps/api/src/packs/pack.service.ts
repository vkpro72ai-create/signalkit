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
import { PrismaService } from '../prisma/prisma.service';
import { LlmRouterService } from '../llm/llm-router.service';
import { buildPackContext, type PackContext, type PackContextInput, type PackScore } from './context';
import { DEPTH_DOCUMENTS, buildDocument } from './templates';
import { buildBuildBlueprint } from './blueprint';
import { runQualityGates, type DocForGate } from './quality-gates';
import {
  buildProductPackV2Prompt,
  buildProductPackV2RepairPrompt,
  type BuildProductPackV2PromptInput,
} from './prompts/product-pack-v2.builder';
import {
  PRODUCT_PACK_V2_SECTIONS,
  type ProductPackV2Layer,
  type ProductPackV2SectionKey,
} from './prompts/product-pack-v2.sections';

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
}

interface ProductPackV2Document {
  type: string;
  title: string;
  audience: string[];
  purpose: string;
  howToUse: string;
  connections: string[];
  sections: ProductPackV2Section[];
  acceptanceCriteria: string[];
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

interface PackV2AiRun {
  primary: {
    taskType: string;
    modelId: string;
    provider: string;
    usedFallback: boolean;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    estimatedCost: number;
  };
  repair?: {
    taskType: string;
    modelId: string;
    provider: string;
    usedFallback: boolean;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    estimatedCost: number;
  };
}

const PACK_V2_TASK_TYPE: LLMTaskType = 'product_vision_generation';
const PACK_V2_TIMEOUT_MS = 300_000;

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

  private async generatePackV2(
    workspaceId: string,
    nicheId: string,
    opts: GeneratePackOptions,
    ctx: PackContext,
    _requiredDocs: readonly DocumentType[],
  ) {
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

    try {
      const prompt = buildProductPackV2Prompt(this.buildProductPackV2Input(ctx, opts));
      const firstRun = await this.runPackPrompt(workspaceId, pack.id, projectId, ctx.language, prompt, PACK_V2_TASK_TYPE, 'generate');
      const firstText = extractLlmText(firstRun);

      let packJson = this.parsePackV2Json(firstText);
      let aiRun: PackV2AiRun = { primary: this.aiRunFromResult(firstRun) };

      if (!packJson) {
        const repairPrompt = buildProductPackV2RepairPrompt(firstText);
        const repairRun = await this.runPackPrompt(workspaceId, pack.id, projectId, ctx.language, repairPrompt, PACK_V2_TASK_TYPE, 'repair');
        const repairText = extractLlmText(repairRun);
        const repaired = this.parsePackV2Json(repairText);
        if (!repaired) {
          throw new BadRequestException({ code: 'product_pack_v2_repair_failed', message: 'Product Pack JSON repair failed.' });
        }
        packJson = repaired;
        aiRun = { primary: this.aiRunFromResult(firstRun), repair: this.aiRunFromResult(repairRun) };
      }

      if (!packJson) {
        throw new BadRequestException({ code: 'product_pack_v2_invalid_output', message: 'Product Pack JSON could not be parsed.' });
      }

      packJson = normalizePackV2Pack(packJson);
      const quality = packJson.quality;
      const finalTitle = normalizePackTitle(packJson.packTitle);
      const confidenceValue = normalizeConfidenceScore(quality.confidenceScore);
      const confidenceLevel = confidenceLevelFromScore(confidenceValue);
      const packMetadata = buildProductPackV2Metadata(packJson, ctx, opts, aiRun);
      const docRows = packJson.documents.map((doc) =>
        mapPackV2DocumentToProductPackDocument(doc, packJson, packMetadata, ctx, opts, pack.id, aiRun),
      );
      const gate = buildProductPackV2QualityGate(packJson, packMetadata.qualityGates);

      const saved = await this.prisma.$transaction(async (tx) => {
        await tx.productPackDocument.deleteMany({ where: { packId: pack.id } });
        for (const row of docRows) {
          await tx.productPackDocument.create({ data: row });
        }
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
      });

      if (ctx.buildBlueprint) {
        await this.persistBlueprint(workspaceId, pack.id, nicheId, projectId, ctx.buildBlueprint);
      }

      return {
        pack: { ...saved.updatedPack, metadata: packMetadata },
        documentCount: docRows.length,
        qualityGate: saved.qualityGate,
      };
    } catch (error) {
      await this.prisma.productDocumentPack.update({ where: { id: pack.id }, data: { status: 'failed' } });
      this.logger.warn(`Product Pack v2 generation failed for niche ${nicheId}: ${String(error)}`);
      throw mapPackGenerationError(error, 'Build-Ready Product Pack generation failed.');
    }
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
      founderRequest: [ctx.niche.title, ctx.niche.oneLiner, ctx.niche.problem].filter(Boolean).join('\n'),
      existingPackNotes: undefined,
    };
  }

  private async runPackPrompt(
    workspaceId: string,
    packId: string,
    projectId: string,
    language: LocaleCode,
    prompt: { system: string; user: string },
    taskType: LLMTaskType,
    stage: 'generate' | 'repair',
  ) {
    const request = this.router.run({
      taskType,
      workspaceId,
      projectId,
      packId,
      jsonMode: true,
      estimatedOutputTokens: stage === 'generate' ? 9000 : 2500,
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

  private aiRunFromResult(result: Awaited<ReturnType<LlmRouterService['run']>>): PackV2AiRun['primary'] {
    return {
      taskType: result.taskType,
      modelId: result.modelId,
      provider: result.provider,
      usedFallback: result.usedFallback,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      estimatedCost: result.estimatedCost,
    };
  }

  private parsePackV2Json(raw: string): ProductPackV2Json | null {
    try {
      const parsed = parseJsonLike(raw) as Partial<ProductPackV2Json>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.packType !== 'build_ready_product_pack') return null;
      if (typeof parsed.packTitle !== 'string' || !parsed.packTitle.trim()) return null;
      if (typeof parsed.oneLineThesis !== 'string' || typeof parsed.language !== 'string') return null;
      if (!parsed.ideaAmplification || typeof parsed.ideaAmplification !== 'object') return null;
      if (!parsed.recommendedStrategy || typeof parsed.recommendedStrategy !== 'object') return null;
      if (!parsed.quality || typeof parsed.quality !== 'object') return null;
      if (
        typeof parsed.quality.completenessScore !== 'number' ||
        typeof parsed.quality.confidenceScore !== 'number' ||
        typeof parsed.quality.assumptionCount !== 'number' ||
        typeof parsed.quality.evidenceCount !== 'number' ||
        typeof parsed.quality.riskLevel !== 'string' ||
        !Array.isArray(parsed.quality.missingInputs)
      ) {
        return null;
      }
      if (!Array.isArray(parsed.documents) || parsed.documents.length === 0) return null;
      if (
        parsed.documents.some(
          (doc) =>
            !doc ||
            typeof doc !== 'object' ||
            typeof doc.type !== 'string' ||
            typeof doc.title !== 'string' ||
            !Array.isArray(doc.audience) ||
            typeof doc.purpose !== 'string' ||
            typeof doc.howToUse !== 'string' ||
            !Array.isArray(doc.connections) ||
            !Array.isArray(doc.sections) ||
            !Array.isArray(doc.acceptanceCriteria) ||
            doc.sections.some(
              (section) =>
                !section ||
                typeof section !== 'object' ||
                typeof section.heading !== 'string' ||
                typeof section.content !== 'string' ||
                !Array.isArray(section.examples) ||
                !Array.isArray(section.implementationNotes) ||
                !Array.isArray(section.assumptions) ||
                !Array.isArray(section.risks) ||
                !Array.isArray(section.evidenceRefs),
            ),
        )
      ) {
        return null;
      }

      const matchedSections = new Set(
        parsed.documents
          .map((doc) => resolvePackV2Section(doc?.type, doc?.title))
          .filter((section): section is typeof PRODUCT_PACK_V2_SECTIONS[number] => Boolean(section))
          .map((section) => section.key),
      );
      if (PRODUCT_PACK_V2_SECTIONS.some((section) => !matchedSections.has(section.key))) return null;

      return parsed as ProductPackV2Json;
    } catch {
      return null;
    }
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

  listForNiche(workspaceId: string, nicheId: string) {
    return this.prisma.productDocumentPack.findMany({ where: { workspaceId, nicheId }, orderBy: { createdAt: 'desc' } });
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
    const language = (opts.language ?? (project?.marketLanguage as LocaleCode) ?? 'en') as LocaleCode;

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
      if (objectStart >= 0 && objectEnd > objectStart) {
        return JSON.parse(fenced.slice(objectStart, objectEnd + 1));
      }
      throw new Error('invalid_json');
    }
  }
}

function documentToMarkdown(doc: ProductPackV2Document): string {
  const lines: string[] = [`# ${doc.title}`, '', `**Audience:** ${doc.audience.join(', ') || '—'}`, `**Purpose:** ${doc.purpose}`, `**How to use:** ${doc.howToUse}`];

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
    }
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
  aiRun: PackV2AiRun,
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
      aiRun,
      pack: packJson,
      packMetadata,
      document: doc,
      layer: section?.layer ?? 'build',
      section: section ? { key: section.key, title: section.title } : null,
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

function buildProductPackV2Metadata(
  packJson: ProductPackV2Json,
  ctx: PackContext,
  opts: GeneratePackOptions,
  aiRun: PackV2AiRun,
) {
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
    executionHandoff: buildExecutionHandoff(packJson, ctx, opts),
    aiRun,
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
    exportGate: normalizePackTitle(packJson.packTitle) === 'Build-Ready Product Pack' ? 'ready' : 'naming_issue',
    openQuestions,
    sourceNeeds,
    whatNotToBuildOrClaim,
  };
}

function buildExecutionHandoff(
  packJson: ProductPackV2Json,
  ctx: PackContext,
  opts: GeneratePackOptions,
) {
  const layerSections = groupDocumentsByLayer(packJson.documents);
  const executionTitles = layerSections.execution.map((doc) => doc.title);
  const buildTitles = layerSections.build.map((doc) => doc.title);
  const phaseNames = Array.isArray(packJson.executionPhases)
    ? packJson.executionPhases
        .map((phase) => (phase && typeof phase === 'object' && typeof (phase as { phase?: unknown }).phase === 'string'
          ? (phase as { phase: string }).phase
          : null))
        .filter((phase): phase is string => Boolean(phase))
    : [];
  const roleSections = new Map<string, string[]>([
    ['designer', ['UX Storyboard', 'Navigation & Information Architecture', 'Designer Pack', 'Design BRD']],
    ['frontend_ai_agent', ['Frontend Developer Pack', 'Frontend BRD', 'API Requirements', 'Screen Map']],
    ['backend_ai_agent', ['Backend Developer Pack', 'Backend BRD', 'Data Model', 'API Requirements', 'AI Agent Pack']],
    ['qa_ai_agent', ['QA & Acceptance Pack', 'Acceptance Criteria', 'Execution Phasing']],
  ]);
  return {
    mode: 'team_studio_and_ai_agent',
    qiraBacklogDraft: {
      projectTitle: normalizePackTitle(packJson.packTitle),
      projectDescription: `${packJson.oneLineThesis}\n\nDepth: ${opts.depth}\nVision preserved before MVP/phasing.`,
      epics: [
        { title: 'Vision Layer Alignment', relatedSections: layerSections.vision.map((doc) => doc.title) },
        { title: 'Build Layer Delivery', relatedSections: buildTitles },
        { title: 'Execution Layer Rollout', relatedSections: executionTitles },
      ],
      sprints: [
        { title: phaseNames[0] ?? 'Sprint 1', focus: 'Prove the core wedge without losing the full vision.' },
        { title: phaseNames[1] ?? 'Sprint 2', focus: 'Deliver the primary build layer for the launchable product.' },
        { title: phaseNames[2] ?? 'Sprint 3', focus: 'Operationalize handoff, QA, and expansion hooks.' },
      ],
      tasks: packJson.documents.slice(0, 16).map((doc, index) => ({
        title: doc.title,
        description: doc.purpose,
        ownerRole: inferOwnerRole(doc),
        phase: index < 8 ? 'Vision' : index < 14 ? 'Build' : 'Execution',
        acceptanceCriteria: doc.acceptanceCriteria,
        relatedSections: [doc.title],
      })),
      dependencies: [
        { from: 'Vision Layer Alignment', to: 'Build Layer Delivery' },
        { from: 'Build Layer Delivery', to: 'Execution Layer Rollout' },
      ],
      ownerRoles: ['founder', 'designer', 'frontend', 'backend', 'aiEngineer', 'qa', 'growth', 'legalPrivacy'],
      labels: ['build-ready-product-pack', opts.vertical, opts.depth, ctx.language],
      acceptanceCriteria: [
        'Vision Layer is preserved before MVP scope.',
        'Build Layer documents remain available to design and engineering.',
        'Execution phases are sequenced without replacing the full product idea.',
      ],
      doneDefinition: [
        'Vision, Build, Execution, and Evidence layers are all represented.',
        'No Preview wording remains in the pack title.',
        'Unsourced claims are labeled as assumptions, source needs, or research questions.',
      ],
    },
    aiAgentPromptBundleDraft: Array.from(roleSections.entries()).map(([targetAgent, relatedSections]) => ({
      title: `${targetAgent.replace(/_/g, ' ')} implementation prompt`,
      targetAgent,
      purpose: `Execute the ${targetAgent.replace(/_/g, ' ')} slice of the Build-Ready Product Pack without relying on prior chat context.`,
      promptBody: buildSelfContainedAgentPrompt(ctx.niche.title, packJson.oneLineThesis, targetAgent, relatedSections),
      relatedSections,
      expectedFiles: ['Inspect only the smallest relevant files first.'],
      tests: ['Run targeted tests only for the touched implementation area.'],
      finalReportFormat: ['files changed', 'behavior changed', 'tests run', 'blockers'],
    })),
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
      status: normalizePackTitle(packJson.packTitle) === 'Build-Ready Product Pack' ? 'pass' : 'fail',
      message:
        normalizePackTitle(packJson.packTitle) === 'Build-Ready Product Pack'
          ? 'Pack naming is export-safe and uses Build-Ready Product Pack.'
          : 'Pack title must be Build-Ready Product Pack.',
      documentTypes: [],
    },
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

function groupDocumentsByLayer(documents: ProductPackV2Document[]): Record<ProductPackV2Layer, ProductPackV2Document[]> {
  return {
    vision: documents.filter((doc) => resolvePackV2Section(doc.type, doc.title)?.layer === 'vision'),
    build: documents.filter((doc) => resolvePackV2Section(doc.type, doc.title)?.layer === 'build'),
    execution: documents.filter((doc) => resolvePackV2Section(doc.type, doc.title)?.layer === 'execution'),
    evidence: documents.filter((doc) => resolvePackV2Section(doc.type, doc.title)?.layer === 'evidence'),
  };
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

function inferOwnerRole(doc: ProductPackV2Document): string {
  const audience = doc.audience.join(' ').toLowerCase();
  if (audience.includes('designer')) return 'designer';
  if (audience.includes('frontend')) return 'frontend';
  if (audience.includes('backend')) return 'backend';
  if (audience.includes('qa')) return 'qa';
  if (audience.includes('growth')) return 'growth';
  if (audience.includes('investor')) return 'founder';
  if (audience.includes('ai')) return 'aiEngineer';
  return 'founder';
}

function buildSelfContainedAgentPrompt(
  productTitle: string,
  oneLineThesis: string,
  targetAgent: string,
  relatedSections: string[],
): string {
  return [
    'Context:',
    `- Product: ${productTitle}`,
    `- Why this task exists: implement the ${targetAgent.replace(/_/g, ' ')} slice of the Build-Ready Product Pack while preserving the full product idea.`,
    `- Source Product Pack sections: ${relatedSections.join(', ')}`,
    '',
    'Scope:',
    `- Cover only the ${targetAgent.replace(/_/g, ' ')} responsibilities needed to deliver: ${oneLineThesis}`,
    '',
    'Open only:',
    '- inspect only the smallest relevant files first',
    '',
    'Do not:',
    '- do not scan whole workspace',
    '- do not rewrite unrelated code',
    '- do not deploy unless this prompt explicitly says deploy',
    '- do not change product philosophy',
    '',
    'Task:',
    `- Implement the work implied by ${relatedSections.join(', ')} for the ${targetAgent.replace(/_/g, ' ')} slice.`,
    '',
    'Acceptance:',
    '- measurable done criteria must be satisfied for the touched scope',
    '- preserve the full vision before MVP-only simplification',
    '',
    'Tests:',
    '- targeted tests only',
    '',
    'Final report:',
    '- files changed',
    '- behavior changed',
    '- tests run',
    '- blockers',
  ].join('\n');
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
      return new BadRequestException({ code: 'llm_model_not_found', message: message || fallbackMessage });
    }
    return new BadRequestException({ code: 'llm_provider_error', message: message || fallbackMessage });
  }

  if (error instanceof Error && error.message.includes('llm_timeout')) {
    return new BadRequestException({ code: 'llm_timeout', message: 'The LLM request timed out.' });
  }
  if (error instanceof Error && error.message.includes('product_pack_v2_repair_failed')) {
    return new BadRequestException({ code: 'product_pack_v2_repair_failed', message: 'Product Pack JSON repair failed.' });
  }
  if (error instanceof Error && error.message.includes('product_pack_v2_invalid_output')) {
    return new BadRequestException({ code: 'product_pack_v2_invalid_output', message: error.message });
  }
  return new BadRequestException({
    code: 'product_pack_v2_generation_failed',
    message: error instanceof Error ? error.message : fallbackMessage,
  });
}
