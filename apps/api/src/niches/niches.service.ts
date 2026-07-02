import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  buildScenarios,
  computeMarketScore,
  computeNicheScore,
  computeVentureScaleScore,
  type ClaimType,
  type LocaleCode,
  type ScoreDimension,
  type ScoringInput,
  type SignalType,
  type VentureScaleDimension,
  type VentureThesis,
  type VerticalTemplate,
} from '@signalkit/shared';
import { baseContract, LLMError } from '@signalkit/llm';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import { LlmRouterService } from '../llm/llm-router.service';
import type { DiscoverNichesDto } from './dto/niche.dto';
import { buildVentureThesis } from './venture';

type SignalRow = {
  signalType: string;
  text: string;
  strengthScore: number;
  freshnessScore: number;
  sourceQuality: number;
  topic: string | null;
};

interface GeneratedOpportunityDraft {
  title: string;
  oneLineThesis: string;
  targetUser: string;
  pain: string;
  whyNow: string;
  market: string;
  vertical: string;
  opportunityScoreDraft: number;
  confidenceDraft: number;
  ventureScaleDraft: number;
  buildReadinessDraft: number;
  assumptions: string[];
  risks: string[];
  validationQuestions: string[];
}

interface DiscoveryPayload {
  opportunities: GeneratedOpportunityDraft[];
}

const DIMENSION_CLAIM: Partial<Record<ScoreDimension, ClaimType>> = {
  problem_urgency: 'user_pain',
  market_momentum: 'market_demand',
  willingness_to_pay: 'willingness_to_pay',
  local_fit: 'local_fit',
  competition_gap: 'competition',
  regulatory_safety: 'regulatory_risk',
  distribution_access: 'distribution_access',
  ai_leverage: 'technology_shift',
};

const VENTURE_DIMENSION_CLAIM: Partial<Record<VentureScaleDimension, ClaimType>> = {
  pain_cost: 'user_pain',
  budget_ownership: 'willingness_to_pay',
  revenue_density: 'willingness_to_pay',
  distribution_wedge: 'distribution_access',
  incumbent_weakness: 'competition',
  ai_unlock: 'technology_shift',
  market_size_path: 'market_demand',
  timing_shift: 'market_demand',
};

@Injectable()
export class NichesService {
  private readonly logger = new Logger(NichesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly router: LlmRouterService,
  ) {}

  async discover(
    workspaceId: string,
    projectId: string,
    dto: DiscoverNichesDto = {},
    userId?: string,
  ) {
    const project = await this.requireProject(workspaceId, projectId);
    const signals = await this.prisma.trendSignal.findMany({ where: { workspaceId, projectId } });
    const language = normalizeLocale(dto.language ?? project.defaultOutputLanguage ?? project.marketLanguage ?? 'en');
    const market = dto.market ?? project.targetCountry ?? (project.marketScope === 'global' ? 'Global' : 'Selected market');
    const verticals = dto.verticals?.map((value) => value.trim()).filter(Boolean) ?? [];

    if (signals.length > 0) {
      await this.evidence.synthesize(workspaceId, projectId);
    }

    let llmResult;
    try {
      llmResult = await this.router.run({
        taskType: 'niche_generation',
        workspaceId,
        userId: userId ?? null,
        projectId,
        jsonMode: true,
        estimatedOutputTokens: 2200,
        contract: {
          ...baseContract(language),
          outputLanguage: language,
          marketLanguage: language,
          evidenceRequirement: signals.length > 0 ? 'required' : 'preferred',
          unsupportedClaimsPolicy: 'mark_as_assumption',
        },
        messages: [
          {
            role: 'system',
            content:
              'You generate 3 to 5 market opportunities for SignalKit. Return strict JSON only: ' +
              '{"opportunities":[{"title":"","oneLineThesis":"","targetUser":"","pain":"","whyNow":"","market":"","vertical":"","opportunityScoreDraft":0,"confidenceDraft":0,"ventureScaleDraft":0,"buildReadinessDraft":0,"assumptions":[],"risks":[],"validationQuestions":[]}]} ' +
              'Rules: keep the requested language, never fabricate TAM or revenue numbers, mark weak evidence as assumptions, and use integer draft scores from 0 to 100.',
          },
          {
            role: 'user',
            content: buildDiscoveryPrompt({
              projectName: project.name,
              projectGoal: project.goal,
              market,
              language,
              verticals,
              role: dto.role ?? 'internal product scout',
              signals,
            }),
          },
        ],
      });
    } catch (error) {
      throw new BadRequestException(
        mapLlmError(
          error,
          signals.length > 0
            ? 'Signal-backed discovery could not run because the configured LLM failed.'
            : 'Starter discovery needs a configured LLM connection and selected model.',
        ),
      );
    }

    const payload = safeParseDiscoveryPayload(llmResult.content);
    if (payload.opportunities.length === 0) {
      throw new BadRequestException({
        code: 'llm_provider_error',
        message: 'The LLM returned no opportunities. Adjust the workspace model or discovery inputs and try again.',
      });
    }

    await this.prisma.niche.deleteMany({ where: { projectId } });

    const scoringVersion = await this.currentScoringVersion();
    const evidenceCount = await this.prisma.evidenceItem.count({ where: { projectId } });
    const generatedAt = new Date().toISOString();
    const opportunities = [];

    for (const draft of payload.opportunities) {
      const niche = await this.prisma.niche.create({
        data: {
          workspaceId,
          projectId,
          title: draft.title,
          oneLiner: draft.oneLineThesis,
          problem: draft.pain,
          targetAudience: draft.targetUser,
          whyNow: draft.whyNow,
          useCases: draft.validationQuestions.slice(0, 4),
          competitors: draft.risks.slice(0, 4),
          mvpConcept: `Starter hypothesis for ${draft.title}. Validate before committing build scope.`,
          monetization: 'Validate pricing and packaging with target buyers.',
          recommendedProductFormat: recommendFormat(draft.vertical),
          riskLevel: draftRiskLevel(draft),
          language,
        },
      });

      await this.prisma.nicheScore.create({
        data: {
          nicheId: niche.id,
          scoringVersionId: scoringVersion.id,
          totalScore: clampScore(draft.opportunityScoreDraft),
          confidenceValue: clampConfidence(draft.confidenceDraft),
          confidenceLevel: confidenceLevelForDraft(draft.confidenceDraft),
          breakdown: buildDraftBreakdown(draft) as unknown as object,
          riskPenalties: draft.risks.slice(0, 3).map((reason) => ({ reason, penalty: 4 })) as unknown as object,
          explanation:
            signals.length > 0
              ? 'LLM-assisted opportunity draft synthesized from project signals and evidence. Validate assumptions before treating the score as final.'
              : 'LLM-assisted starter discovery draft. This is a hypothesis set, not verified market fact.',
        },
      });

      await this.persistDiscoveryAssumptions(workspaceId, projectId, language, draft.assumptions);
      await this.persistDiscoveryQuestions(workspaceId, projectId, language, draft.validationQuestions);

      await this.prisma.ventureThesis.deleteMany({ where: { nicheId: niche.id } });
      await this.prisma.ventureThesis.create({
        data: {
          workspaceId,
          nicheId: niche.id,
          projectId,
          thesis: buildDraftVentureThesis(niche.title, draft, language) as unknown as object,
          ventureScaleScore: clampScore(draft.ventureScaleDraft),
          ventureScaleConfidence: clampConfidence(draft.confidenceDraft),
          ventureScaleLevel: confidenceLevelForDraft(draft.confidenceDraft),
          ventureScaleBreakdown: [] as unknown as object,
          whatMustBeTrue: draft.validationQuestions as unknown as object,
        },
      });

      opportunities.push({
        id: niche.id,
        name: niche.title,
        oneLiner: niche.oneLiner,
        riskLevel: niche.riskLevel,
        projectId,
        targetMarket: draft.market,
        evidenceCount,
        opportunityScore: clampScore(draft.opportunityScoreDraft),
        confidence: {
          level: confidenceLevelForDraft(draft.confidenceDraft),
          value: clampConfidence(draft.confidenceDraft),
        },
        ventureScaleScore: clampScore(draft.ventureScaleDraft),
        buildReadinessScore: clampScore(draft.buildReadinessDraft),
        assumptions: draft.assumptions,
        risks: draft.risks,
        validationQuestions: draft.validationQuestions,
        generationMetadata: {
          provider: llmResult.provider,
          model: llmResult.modelId,
          task: llmResult.taskType,
          status: 'success',
          durationMs: llmResult.latencyMs,
          inputTokens: llmResult.inputTokens,
          outputTokens: llmResult.outputTokens,
          estimatedCost: llmResult.estimatedCost,
          generatedAt,
          mode: signals.length > 0 ? 'signal_backed' : 'starter_discovery',
        },
      });
    }

    const usage = await this.prisma.lLMUsageLog.findFirst({
      where: { workspaceId, projectId, taskType: 'niche_generation' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      niches: opportunities.length,
      opportunities,
      generation: {
        provider: llmResult.provider,
        model: llmResult.modelId,
        task: llmResult.taskType,
        status: 'success',
        durationMs: llmResult.latencyMs,
        inputTokens: llmResult.inputTokens,
        outputTokens: llmResult.outputTokens,
        estimatedCost: llmResult.estimatedCost,
        generatedAt: usage?.createdAt.toISOString() ?? generatedAt,
        usageLogId: usage?.id ?? null,
        mode: signals.length > 0 ? 'signal_backed' : 'starter_discovery',
      },
    };
  }

  async score(workspaceId: string, nicheId: string) {
    const niche = await this.requireNiche(workspaceId, nicheId);
    const signals = await this.prisma.trendSignal.findMany({ where: { projectId: niche.projectId } });
    const input = await this.buildInput(workspaceId, niche.projectId, signals);
    const result = computeNicheScore(input);

    const claims = await this.prisma.claim.findMany({ where: { projectId: niche.projectId } });
    const claimByType = new Map(claims.map((c) => [c.type, c.id] as const));
    const breakdown = result.breakdown.map((b) => ({
      ...b,
      claimIds:
        DIMENSION_CLAIM[b.dimension] && claimByType.has(DIMENSION_CLAIM[b.dimension]!)
          ? [claimByType.get(DIMENSION_CLAIM[b.dimension]!)!]
          : [],
    }));

    const version = await this.currentScoringVersion();
    const score = await this.prisma.nicheScore.create({
      data: {
        nicheId,
        scoringVersionId: version.id,
        totalScore: result.totalScore,
        confidenceValue: result.confidence.value,
        confidenceLevel: result.confidence.level,
        breakdown: breakdown as unknown as object,
        riskPenalties: result.riskPenalties as unknown as object,
        explanation: result.explanation,
      },
    });

    await this.recordAssumptionQuestions(workspaceId, niche.projectId, result.breakdown);
    await this.computeVenture(workspaceId, nicheId, input);
    return score;
  }

  async computeVenture(workspaceId: string, nicheId: string, input?: ScoringInput) {
    const niche = await this.requireNiche(workspaceId, nicheId);
    const signals = await this.prisma.trendSignal.findMany({ where: { projectId: niche.projectId } });
    const scoringInput = input ?? (await this.buildInput(workspaceId, niche.projectId, signals));
    const ventureScale = computeVentureScaleScore(scoringInput);

    const project = await this.prisma.project.findUnique({ where: { id: niche.projectId } });
    const [claims, assumptions, questions] = await Promise.all([
      this.prisma.claim.findMany({ where: { projectId: niche.projectId } }),
      this.prisma.assumption.findMany({ where: { projectId: niche.projectId } }),
      this.prisma.unresolvedQuestion.findMany({ where: { projectId: niche.projectId } }),
    ]);

    const claimByType = new Map(claims.map((c) => [c.type, c.id] as const));
    ventureScale.breakdown = ventureScale.breakdown.map((b) => ({
      ...b,
      claimIds:
        VENTURE_DIMENSION_CLAIM[b.dimension] && claimByType.has(VENTURE_DIMENSION_CLAIM[b.dimension]!)
          ? [claimByType.get(VENTURE_DIMENSION_CLAIM[b.dimension]!)!]
          : [],
    }));

    const thesis = buildVentureThesis({
      niche: {
        title: niche.title,
        oneLiner: niche.oneLiner ?? '',
        problem: niche.problem ?? '',
        whyNow: niche.whyNow ?? '',
        targetAudience: niche.targetAudience ?? '',
        useCases: niche.useCases ?? [],
        competitors: niche.competitors ?? [],
        monetization: niche.monetization ?? '',
      },
      market: { country: project?.targetCountry ?? null, marketLanguage: project?.marketLanguage ?? 'en', scope: project?.marketScope ?? 'global' },
      ventureScale,
      claims: claims.map((c) => ({ text: c.text, type: c.type, confidenceLevel: c.confidenceLevel })),
      assumptions: assumptions.map((a) => ({ text: a.text })),
      unresolvedQuestions: questions.map((q) => ({ text: q.text })),
    });

    await this.prisma.ventureThesis.deleteMany({ where: { nicheId } });
    return this.prisma.ventureThesis.create({
      data: {
        workspaceId,
        nicheId,
        projectId: niche.projectId,
        thesis: thesis as unknown as object,
        ventureScaleScore: ventureScale.totalScore,
        ventureScaleConfidence: ventureScale.confidence.value,
        ventureScaleLevel: ventureScale.confidence.level,
        ventureScaleBreakdown: ventureScale.breakdown as unknown as object,
        whatMustBeTrue: ventureScale.whatMustBeTrue as unknown as object,
      },
    });
  }

  async ventureThesis(workspaceId: string, nicheId: string) {
    await this.requireNiche(workspaceId, nicheId);
    const vt = await this.prisma.ventureThesis.findFirst({ where: { nicheId }, orderBy: { createdAt: 'desc' } });
    if (!vt) return this.computeVenture(workspaceId, nicheId);
    return vt;
  }

  async regenerateVenture(workspaceId: string, nicheId: string) {
    const niche = await this.requireNiche(workspaceId, nicheId);
    const project = await this.prisma.project.findUnique({ where: { id: niche.projectId } });
    const base = await this.computeVenture(workspaceId, nicheId);
    const baseline = base.thesis as unknown as VentureThesis;
    const language = normalizeLocale(niche.language || project?.defaultOutputLanguage || project?.marketLanguage || 'en');

    try {
      const result = await this.router.run({
        taskType: 'product_vision_generation',
        workspaceId,
        projectId: niche.projectId,
        jsonMode: true,
        estimatedOutputTokens: 1800,
        contract: {
          ...baseContract(language),
          outputLanguage: language,
          marketLanguage: language,
          evidenceRequirement: 'required',
          unsupportedClaimsPolicy: 'mark_as_assumption',
        },
        messages: [
          {
            role: 'system',
            content:
              'Rewrite the venture thesis as strict JSON with this exact shape: ' +
              '{"breakoutThesis":"","whyNow":{"text":"","assumption":true},"macroShifts":[],"entryWedge":{"text":"","assumption":true},' +
              '"expansionPath":{"text":"","assumption":true},"targetCustomer":"","painEconomics":{"text":"","assumption":true},"alternatives":[],' +
              '"aiUnlock":{"text":"","assumption":true},"distributionWedge":{"text":"","assumption":true},"dataWorkflowMoat":{"text":"","assumption":true},' +
              '"monetizationPath":"","marketConstraints":"","ventureScaleNarrative":{"text":"","assumption":true},"killReasons":[],"whatMustBeTrue":[],' +
              '"firstValidationExperiments":[],"evidenceConfidence":{"value":0,"level":"low"},"assumptions":[],"unresolvedQuestions":[]}. ' +
              'Keep the language requested, never invent evidence, and keep unsupported statements marked as assumptions.',
          },
          {
            role: 'user',
            content:
              `Language: ${language}\n` +
              `Niche title: ${niche.title}\n` +
              `Baseline venture thesis JSON:\n${JSON.stringify(baseline, null, 2)}\n\n` +
              'Improve clarity and specificity while preserving honesty and structure.',
          },
        ],
      });

      const thesis = safeParseVentureThesis(result.content, baseline);
      await this.prisma.ventureThesis.update({
        where: { id: base.id },
        data: {
          thesis: thesis as unknown as object,
          ventureScaleConfidence: thesis.evidenceConfidence.value,
          ventureScaleLevel: thesis.evidenceConfidence.level,
        },
      });
      return this.ventureThesis(workspaceId, nicheId);
    } catch (error) {
      this.logger.warn(`LLM venture thesis regeneration failed for niche ${nicheId}: ${String(error)}`);
      throw new BadRequestException(
        mapLlmError(error, 'Venture Thesis generation needs a working LLM connection and selected model.'),
      );
    }
  }

  async rescore(workspaceId: string, nicheId: string) {
    return this.score(workspaceId, nicheId);
  }

  async compareMarkets(workspaceId: string, nicheId: string, countries: string[]) {
    const niche = await this.requireNiche(workspaceId, nicheId);
    const project = await this.prisma.project.findUnique({ where: { id: niche.projectId } });
    const profileCountries = project?.targetCountries?.length
      ? project.targetCountries
      : project?.targetCountry
        ? [project.targetCountry]
        : [];
    const targets: string[] = countries.length ? countries : profileCountries;
    const signals = await this.prisma.trendSignal.findMany({ where: { projectId: niche.projectId } });

    const results = await Promise.all(
      targets.map(async (country: string) => {
        const country_ = await this.prisma.country.findUnique({ where: { code: country } });
        const input = await this.buildInput(workspaceId, niche.projectId, signals, country);
        const score = computeMarketScore(input);
        return { country, primaryLanguage: country_?.primaryLanguage ?? null, ...score };
      }),
    );
    const sorted = [...results].sort((a, b) => b.overall - a.overall);
    return {
      markets: results,
      firstMarketRecommendation: sorted[0]?.country ?? null,
      marketToAvoid: sorted.length > 1 ? sorted[sorted.length - 1]!.country : null,
    };
  }

  async scenarios(workspaceId: string, nicheId: string) {
    const niche = await this.requireNiche(workspaceId, nicheId);
    const score = await this.prisma.nicheScore.findFirst({ where: { nicheId }, orderBy: { createdAt: 'desc' } });
    if (!score) throw new NotFoundException('Niche not scored yet');
    const questions = await this.prisma.unresolvedQuestion.findMany({ where: { projectId: niche.projectId }, take: 8 });
    return {
      scenarios: buildScenarios(score.totalScore, score.confidenceValue),
      whatMustBeTrue: (score.breakdown as unknown as { dimension: string; assumptionBased: boolean }[])
        .filter((b) => b.assumptionBased)
        .map((b) => `${b.dimension.replace(/_/g, ' ')} must hold`),
      goNoGoQuestions: questions.map((q) => q.text),
    };
  }

  list(workspaceId: string, projectId: string) {
    return this.prisma.niche.findMany({
      where: { workspaceId, projectId },
      include: { scores: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll(workspaceId: string) {
    const niches = await this.prisma.niche.findMany({
      where: { workspaceId },
      include: {
        scores: { orderBy: { createdAt: 'desc' }, take: 1 },
        ventureTheses: { orderBy: { createdAt: 'desc' }, take: 1 },
        project: { select: { targetCountry: true, marketScope: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const [evidenceCounts, blueprints] = await Promise.all([
      this.prisma.evidenceItem.groupBy({
        by: ['projectId'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.buildBlueprint.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const evidenceByProject = new Map(evidenceCounts.map((e) => [e.projectId, e._count._all]));
    const blueprintByNiche = new Map<string, number>();
    for (const row of blueprints) {
      if (!blueprintByNiche.has(row.nicheId)) {
        blueprintByNiche.set(row.nicheId, row.buildReadinessScore);
      }
    }

    return niches.map((n) => {
      const score = n.scores[0];
      const vt = n.ventureTheses?.[0];
      return {
        id: n.id,
        name: n.title,
        oneLiner: n.oneLiner,
        riskLevel: n.riskLevel,
        projectId: n.projectId,
        targetMarket: n.project?.targetCountry ?? (n.project?.marketScope === 'global' ? 'Global' : null),
        evidenceCount: evidenceByProject.get(n.projectId) ?? 0,
        opportunityScore: score?.totalScore ?? 0,
        confidence: {
          level: score?.confidenceLevel ?? 'low',
          value: score?.confidenceValue ?? 0,
        },
        ventureScaleScore: vt?.ventureScaleScore ?? null,
        buildReadinessScore: blueprintByNiche.get(n.id) ?? null,
      };
    });
  }

  async get(workspaceId: string, nicheId: string) {
    const niche = await this.prisma.niche.findFirst({
      where: { id: nicheId, workspaceId },
      include: { scores: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!niche) throw new NotFoundException('Niche not found');
    return niche;
  }

  async scoring(workspaceId: string, nicheId: string) {
    await this.requireNiche(workspaceId, nicheId);
    const score = await this.prisma.nicheScore.findFirst({ where: { nicheId }, orderBy: { createdAt: 'desc' } });
    if (!score) throw new NotFoundException('Niche not scored yet');
    return score;
  }

  async evidenceForNiche(workspaceId: string, nicheId: string) {
    const niche = await this.requireNiche(workspaceId, nicheId);
    return this.evidence.graph(workspaceId, niche.projectId);
  }

  private async buildInput(
    _workspaceId: string,
    projectId: string,
    signals: SignalRow[],
    marketCountry?: string,
  ): Promise<ScoringInput> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    const country = marketCountry ?? project?.targetCountry ?? null;
    const byType = (t: SignalType) => signals.filter((s) => s.signalType === t);
    const avgStrength = (t: SignalType) => avg(byType(t).map((s) => s.strengthScore));

    const evidence = await this.prisma.evidenceItem.findMany({ where: { projectId } });
    const evidenceStrength = avg(evidence.map((e) => e.relevanceScore * e.sourceQuality));
    const claimCount = await this.prisma.claim.count({ where: { projectId } });
    const openContradictions = await this.prisma.contradiction.count({ where: { claim: { projectId }, resolved: false } });

    const marketMatch = !country ? 0.6 : country === project?.targetCountry ? 0.8 : 0.55;

    return {
      pain: avgStrength('pain'),
      demand: avgStrength('demand'),
      pricing: avgStrength('pricing'),
      competitor: avgStrength('competitor'),
      regulatory: avgStrength('regulatory'),
      timing: avgStrength('timing'),
      techShift: avgStrength('technology_shift'),
      audience: avgStrength('audience'),
      distribution: avgStrength('distribution'),
      marketMatch,
      freshness: avg(signals.map((s) => s.freshnessScore)),
      signalDensity: Math.min(1, signals.length / 20),
      evidenceStrength,
      contradictionRatio: claimCount ? Math.min(1, openContradictions / claimCount) : 0,
    };
  }

  private async recordAssumptionQuestions(
    workspaceId: string,
    projectId: string,
    breakdown: { dimension: string; assumptionBased: boolean }[],
  ) {
    const existing = await this.prisma.unresolvedQuestion.findMany({ where: { projectId }, select: { text: true } });
    const have = new Set(existing.map((q) => q.text));
    const weak = breakdown.filter((b) => b.assumptionBased).slice(0, 3);
    for (const b of weak) {
      const text = `Validate ${b.dimension.replace(/_/g, ' ')} (currently an assumption).`;
      if (!have.has(text)) {
        await this.prisma.unresolvedQuestion.create({ data: { workspaceId, projectId, text, priority: 'medium' } });
      }
    }
  }

  private async persistDiscoveryAssumptions(
    workspaceId: string,
    projectId: string,
    language: string,
    assumptions: string[],
  ) {
    if (assumptions.length === 0) return;
    const existing = await this.prisma.assumption.findMany({ where: { projectId }, select: { text: true } });
    const have = new Set(existing.map((row) => row.text));
    for (const text of assumptions) {
      if (have.has(text)) continue;
      await this.prisma.assumption.create({
        data: {
          workspaceId,
          projectId,
          text,
          language,
          rationale: 'LLM-assisted discovery surfaced this as an assumption/hypothesis.',
        },
      });
    }
  }

  private async persistDiscoveryQuestions(
    workspaceId: string,
    projectId: string,
    language: string,
    questions: string[],
  ) {
    if (questions.length === 0) return;
    const existing = await this.prisma.unresolvedQuestion.findMany({ where: { projectId }, select: { text: true } });
    const have = new Set(existing.map((row) => row.text));
    for (const text of questions) {
      if (have.has(text)) continue;
      await this.prisma.unresolvedQuestion.create({
        data: {
          workspaceId,
          projectId,
          text,
          language,
          priority: 'medium',
        },
      });
    }
  }

  private async currentScoringVersion() {
    const existing = await this.prisma.scoringVersion.findFirst({ orderBy: { createdAt: 'desc' } });
    return existing ?? this.prisma.scoringVersion.create({ data: { version: 'v1', description: 'Initial 17-dimension model' } });
  }

  private async requireProject(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async requireNiche(workspaceId: string, nicheId: string) {
    const niche = await this.prisma.niche.findFirst({ where: { id: nicheId, workspaceId } });
    if (!niche) throw new NotFoundException('Niche not found');
    return niche;
  }
}

function buildDiscoveryPrompt(input: {
  projectName: string;
  projectGoal: string;
  market: string;
  language: LocaleCode;
  verticals: string[];
  role: string;
  signals: SignalRow[];
}): string {
  const signalLines = input.signals.slice(0, 18).map(
    (signal, index) =>
      `${index + 1}. [${signal.signalType}] topic=${signal.topic ?? 'general'} strength=${signal.strengthScore.toFixed(2)} freshness=${signal.freshnessScore.toFixed(2)} :: ${signal.text}`,
  );
  return [
    `Role: ${input.role}.`,
    `Project: ${input.projectName}.`,
    `Goal: ${input.projectGoal || 'Discover strong product opportunities.'}`,
    `Target market: ${input.market}.`,
    `Output language: ${input.language}.`,
    `Preferred verticals: ${input.verticals.length ? input.verticals.join(', ') : 'Not specified'}.`,
    input.signals.length
      ? 'Use the project signals below as primary evidence. If evidence is weak, move the point into assumptions instead of stating it as fact.'
      : 'No project signals are available. Produce a clearly labeled LLM-assisted starter discovery and keep unverified claims in assumptions.',
    signalLines.length ? `Signals:\n${signalLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function safeParseDiscoveryPayload(raw: string): DiscoveryPayload {
  try {
    const parsed = JSON.parse(raw) as Partial<DiscoveryPayload>;
    const opportunities = Array.isArray(parsed.opportunities) ? parsed.opportunities : [];
    return {
      opportunities: opportunities
        .slice(0, 5)
        .map((item) => normalizeOpportunity(item))
        .filter((item): item is GeneratedOpportunityDraft => Boolean(item)),
    };
  } catch {
    return { opportunities: [] };
  }
}

function normalizeOpportunity(input: unknown): GeneratedOpportunityDraft | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const title = textValue(row.title);
  const oneLineThesis = textValue(row.oneLineThesis);
  if (!title || !oneLineThesis) return null;
  return {
    title,
    oneLineThesis,
    targetUser: textValue(row.targetUser) || 'Target user — assumption to validate.',
    pain: textValue(row.pain) || 'Pain hypothesis pending validation.',
    whyNow: textValue(row.whyNow) || 'Why-now hypothesis pending validation.',
    market: textValue(row.market) || 'Selected market',
    vertical: textValue(row.vertical) || 'General',
    opportunityScoreDraft: numberValue(row.opportunityScoreDraft, 55),
    confidenceDraft: numberValue(row.confidenceDraft, 40),
    ventureScaleDraft: numberValue(row.ventureScaleDraft, 50),
    buildReadinessDraft: numberValue(row.buildReadinessDraft, 45),
    assumptions: arrayOfStrings(row.assumptions),
    risks: arrayOfStrings(row.risks),
    validationQuestions: arrayOfStrings(row.validationQuestions),
  };
}

function buildDraftBreakdown(draft: GeneratedOpportunityDraft) {
  return [
    {
      dimension: 'problem_urgency',
      score: clampScore(draft.opportunityScoreDraft),
      weight: 0.35,
      explanation: draft.pain,
      assumptionBased: draft.assumptions.length > 0,
    },
    {
      dimension: 'market_momentum',
      score: clampScore(draft.ventureScaleDraft),
      weight: 0.25,
      explanation: draft.whyNow,
      assumptionBased: draft.assumptions.length > 0,
    },
    {
      dimension: 'distribution_access',
      score: clampScore(draft.buildReadinessDraft),
      weight: 0.2,
      explanation: draft.validationQuestions[0] ?? 'Distribution remains to be validated.',
      assumptionBased: true,
    },
    {
      dimension: 'competition_gap',
      score: Math.max(0, 100 - draft.risks.length * 12),
      weight: 0.2,
      explanation: draft.risks[0] ?? 'Competitive gap still needs validation.',
      assumptionBased: draft.risks.length > 0,
    },
  ];
}

function buildDraftVentureThesis(title: string, draft: GeneratedOpportunityDraft, language: string): VentureThesis {
  return {
    breakoutThesis: `${title}: ${draft.oneLineThesis}`,
    whyNow: { text: draft.whyNow, assumption: draft.assumptions.length > 0 },
    macroShifts: draft.risks.length ? [`Risk context: ${draft.risks[0]}`] : [`Market: ${draft.market}`],
    entryWedge: { text: draft.oneLineThesis, assumption: draft.assumptions.length > 0 },
    expansionPath: { text: `Expand from the ${draft.vertical} wedge into adjacent workflows after validating the first buyer segment.`, assumption: true },
    targetCustomer: draft.targetUser,
    painEconomics: { text: draft.pain, assumption: draft.assumptions.length > 0 },
    alternatives: draft.risks.length ? draft.risks : ['Alternative workflows and incumbents require more validation.'],
    aiUnlock: { text: `Assess whether AI creates a decisive advantage for ${title}.`, assumption: true },
    distributionWedge: { text: draft.validationQuestions[0] ?? 'Find one repeatable acquisition path.', assumption: true },
    dataWorkflowMoat: { text: 'Data/workflow moat is still a starter hypothesis.', assumption: true },
    monetizationPath: 'Validate willingness to pay before locking a pricing model.',
    marketConstraints: `Language ${language}; market ${draft.market}. Do not treat TAM or revenue as proven without evidence.`,
    ventureScaleNarrative: { text: `Draft venture-scale outlook ${clampScore(draft.ventureScaleDraft)}/100. Validate assumptions before scaling the thesis.`, assumption: true },
    killReasons: draft.risks,
    whatMustBeTrue: draft.validationQuestions,
    firstValidationExperiments: draft.validationQuestions,
    evidenceConfidence: { value: clampConfidence(draft.confidenceDraft), level: confidenceLevelForDraft(draft.confidenceDraft) },
    assumptions: draft.assumptions,
    unresolvedQuestions: draft.validationQuestions,
  };
}

function safeParseVentureThesis(raw: string, fallback: VentureThesis): VentureThesis {
  try {
    const parsed = JSON.parse(raw) as Partial<VentureThesis>;
    return {
      breakoutThesis: parsed.breakoutThesis ?? fallback.breakoutThesis,
      whyNow: normalizeSection(parsed.whyNow, fallback.whyNow),
      macroShifts: parsed.macroShifts?.filter(Boolean) ?? fallback.macroShifts,
      entryWedge: normalizeSection(parsed.entryWedge, fallback.entryWedge),
      expansionPath: normalizeSection(parsed.expansionPath, fallback.expansionPath),
      targetCustomer: parsed.targetCustomer ?? fallback.targetCustomer,
      painEconomics: normalizeSection(parsed.painEconomics, fallback.painEconomics),
      alternatives: parsed.alternatives?.filter(Boolean) ?? fallback.alternatives,
      aiUnlock: normalizeSection(parsed.aiUnlock, fallback.aiUnlock),
      distributionWedge: normalizeSection(parsed.distributionWedge, fallback.distributionWedge),
      dataWorkflowMoat: normalizeSection(parsed.dataWorkflowMoat, fallback.dataWorkflowMoat),
      monetizationPath: parsed.monetizationPath ?? fallback.monetizationPath,
      marketConstraints: parsed.marketConstraints ?? fallback.marketConstraints,
      ventureScaleNarrative: normalizeSection(parsed.ventureScaleNarrative, fallback.ventureScaleNarrative),
      killReasons: parsed.killReasons?.filter(Boolean) ?? fallback.killReasons,
      whatMustBeTrue: parsed.whatMustBeTrue?.filter(Boolean) ?? fallback.whatMustBeTrue,
      firstValidationExperiments: parsed.firstValidationExperiments?.filter(Boolean) ?? fallback.firstValidationExperiments,
      evidenceConfidence: {
        value: clampConfidence(parsed.evidenceConfidence?.value ?? fallback.evidenceConfidence.value),
        level: parsed.evidenceConfidence?.level ?? fallback.evidenceConfidence.level,
      },
      assumptions: parsed.assumptions?.filter(Boolean) ?? fallback.assumptions,
      unresolvedQuestions: parsed.unresolvedQuestions?.filter(Boolean) ?? fallback.unresolvedQuestions,
    };
  } catch {
    return fallback;
  }
}

function normalizeSection(
  input: VentureThesis['whyNow'] | undefined,
  fallback: VentureThesis['whyNow'],
): VentureThesis['whyNow'] {
  if (!input) return fallback;
  return {
    text: input.text || fallback.text,
    assumption: typeof input.assumption === 'boolean' ? input.assumption : fallback.assumption,
  };
}

function normalizeLocale(value: string): LocaleCode {
  return (value || 'en') as LocaleCode;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampConfidence(value: number): number {
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function confidenceLevelForDraft(value: number): 'very_low' | 'low' | 'medium' | 'high' | 'very_high' {
  const normalized = clampConfidence(value);
  if (normalized < 0.2) return 'very_low';
  if (normalized < 0.4) return 'low';
  if (normalized < 0.6) return 'medium';
  if (normalized < 0.8) return 'high';
  return 'very_high';
}

function draftRiskLevel(draft: GeneratedOpportunityDraft): 'low' | 'medium' | 'high' {
  if (draft.risks.length >= 3 || draft.assumptions.length >= 4) return 'high';
  if (draft.risks.length >= 1 || draft.assumptions.length >= 1) return 'medium';
  return 'low';
}

function recommendFormat(vertical: string): VerticalTemplate {
  const normalized = vertical.toLowerCase();
  if (normalized.includes('market')) return 'marketplace';
  if (normalized.includes('consumer') || normalized.includes('mobile')) return 'mobile_consumer_app';
  if (normalized.includes('agent') || normalized.includes('ai')) return 'ai_agent_product';
  if (normalized.includes('api')) return 'api_product';
  return 'b2b_saas';
}

function mapLlmError(error: unknown, fallbackMessage: string) {
  if (error instanceof LLMError) {
    if (error.message.includes('no_connection_for_')) {
      return {
        code: 'llm_missing_connection',
        message: 'No active LLM connection exists for the selected workspace/model. Open AI Engine and select a connected provider/model first.',
      };
    }
    if (error.kind === 'auth') return { code: 'llm_auth_failed', message: error.message || fallbackMessage };
    if (error.kind === 'timeout') return { code: 'llm_timeout', message: 'The LLM request timed out.' };
    if (error.kind === 'invalid_request') return { code: 'llm_model_not_found', message: error.message || fallbackMessage };
    return { code: 'llm_provider_error', message: error.message || fallbackMessage };
  }
  return { code: 'llm_provider_error', message: error instanceof Error ? error.message : fallbackMessage };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
