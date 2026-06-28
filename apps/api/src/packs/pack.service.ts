import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { baseContract } from '@signalkit/llm';
import { PrismaService } from '../prisma/prisma.service';
import { LlmRouterService } from '../llm/llm-router.service';
import { buildPackContext, type PackContext, type PackContextInput, type PackScore } from './context';
import { DEPTH_DOCUMENTS, buildDocument } from './templates';
import { buildBuildBlueprint } from './blueprint';
import { runQualityGates, type DocForGate } from './quality-gates';

export interface GeneratePackOptions {
  depth: ProductPackDepth;
  vertical: VerticalTemplate;
  language?: LocaleCode;
  /** Use LlmRouterService to enhance documents (requires a configured LLM). */
  useLlm?: boolean;
}

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
    return { ...pack, qualityGate: gate };
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
