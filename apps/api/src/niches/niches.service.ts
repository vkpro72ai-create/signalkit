import { Injectable, NotFoundException } from '@nestjs/common';
import {
  computeNicheScore,
  computeMarketScore,
  computeVentureScaleScore,
  buildScenarios,
  type ClaimType,
  type ScoreDimension,
  type ScoringInput,
  type SignalType,
  type VentureScaleDimension,
} from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import { buildVentureThesis } from './venture';

type SignalRow = {
  signalType: string;
  text: string;
  strengthScore: number;
  freshnessScore: number;
  sourceQuality: number;
  topic: string | null;
};

/** Which claim type backs each scored dimension (for evidence-linked explanations). */
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

/** Which claim type backs each venture-scale dimension (for evidence links). */
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /**
   * Discover niches from the project's REAL signals + evidence graph. Never
   * invents ideas: if there are no signals, no niches are created.
   */
  async discover(workspaceId: string, projectId: string) {
    const project = await this.requireProject(workspaceId, projectId);
    const signals = await this.prisma.trendSignal.findMany({ where: { workspaceId, projectId } });
    if (signals.length === 0) {
      return { niches: 0, message: 'no_signals' };
    }

    // Ensure the evidence graph is built from these signals (traceable claims).
    await this.evidence.synthesize(workspaceId, projectId);

    // Replace prior auto-discovered niches for idempotency.
    await this.prisma.niche.deleteMany({ where: { projectId } });

    const clusters = clusterByTopic(signals);
    let created = 0;
    for (const [topic, group] of clusters) {
      const niche = await this.prisma.niche.create({
        data: {
          workspaceId,
          projectId,
          title: niceTitle(topic, group),
          oneLiner: `${group.length} signal${group.length === 1 ? '' : 's'} point to an opportunity around ${topic}.`,
          problem: pickText(group, 'pain') ?? 'Problem inferred from collected signals; validate with users.',
          targetAudience: project.targetCountry ? `Buyers in ${project.targetCountry}` : 'Target audience — assumption to validate.',
          whyNow: pickText(group, 'timing') ?? 'Why-now is an assumption pending stronger timing signals.',
          useCases: group.slice(0, 4).map((s) => s.text.slice(0, 120)),
          competitors: group.filter((s) => s.signalType === 'competitor').map((s) => s.text.slice(0, 80)),
          mvpConcept: 'MVP concept — assumption pending feasibility validation.',
          monetization: 'Monetization — assumption pending willingness-to-pay validation.',
          recommendedProductFormat: 'b2b_saas',
          riskLevel: riskLevelFor(group),
          language: project.marketLanguage,
        },
      });
      await this.score(workspaceId, niche.id);
      created += 1;
    }
    return { niches: created };
  }

  /** Score (or rescore) a niche. Always persists a full breakdown + explanation. */
  async score(workspaceId: string, nicheId: string) {
    const niche = await this.requireNiche(workspaceId, nicheId);
    const signals = await this.prisma.trendSignal.findMany({ where: { projectId: niche.projectId } });
    const input = await this.buildInput(workspaceId, niche.projectId, signals);
    const result = computeNicheScore(input);

    // Link each dimension to the backing claim (evidence-linked explanation).
    const claims = await this.prisma.claim.findMany({ where: { projectId: niche.projectId } });
    const claimByType = new Map(claims.map((c) => [c.type, c.id] as const));
    const breakdown = result.breakdown.map((b) => ({
      ...b,
      claimIds: DIMENSION_CLAIM[b.dimension] && claimByType.has(DIMENSION_CLAIM[b.dimension]!)
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

    // Weak (assumption-based) dimensions → unresolved questions (never faked claims).
    await this.recordAssumptionQuestions(workspaceId, niche.projectId, result.breakdown);

    // Breakout Opportunity Engine: (re)compute the Venture Thesis + Venture
    // Scale Score for this niche, kept SEPARATE from opportunity/confidence.
    await this.computeVenture(workspaceId, nicheId, input);
    return score;
  }

  /**
   * Compute (and persist) the Venture Scale Score + Venture Thesis for a niche.
   * Separate from opportunity & confidence. Never fabricates TAM; weak market
   * size is an assumption. `input` may be passed to avoid recomputation.
   */
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

    // Link venture-scale dimensions to backing claims (evidence-linked).
    const claimByType = new Map(claims.map((c) => [c.type, c.id] as const));
    ventureScale.breakdown = ventureScale.breakdown.map((b) => ({
      ...b,
      claimIds: VENTURE_DIMENSION_CLAIM[b.dimension] && claimByType.has(VENTURE_DIMENSION_CLAIM[b.dimension]!)
        ? [claimByType.get(VENTURE_DIMENSION_CLAIM[b.dimension]!)!]
        : [],
    }));

    const thesis = buildVentureThesis({
      niche: {
        title: niche.title, oneLiner: niche.oneLiner ?? '', problem: niche.problem ?? '', whyNow: niche.whyNow ?? '',
        targetAudience: niche.targetAudience ?? '', useCases: niche.useCases ?? [], competitors: niche.competitors ?? [], monetization: niche.monetization ?? '',
      },
      market: { country: project?.targetCountry ?? null, marketLanguage: project?.marketLanguage ?? 'en', scope: project?.marketScope ?? 'global' },
      ventureScale,
      claims: claims.map((c) => ({ text: c.text, type: c.type, confidenceLevel: c.confidenceLevel })),
      assumptions: assumptions.map((a) => ({ text: a.text })),
      unresolvedQuestions: questions.map((q) => ({ text: q.text })),
    });

    // Replace prior thesis for this niche (latest wins, idempotent).
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

  /** Get the latest Venture Thesis + Venture Scale Score for a niche. */
  async ventureThesis(workspaceId: string, nicheId: string) {
    await this.requireNiche(workspaceId, nicheId);
    const vt = await this.prisma.ventureThesis.findFirst({ where: { nicheId }, orderBy: { createdAt: 'desc' } });
    if (!vt) return this.computeVenture(workspaceId, nicheId);
    return vt;
  }

  /** Recompute the Venture Thesis on demand. */
  async regenerateVenture(workspaceId: string, nicheId: string) {
    return this.computeVenture(workspaceId, nicheId);
  }

  async rescore(workspaceId: string, nicheId: string) {
    return this.score(workspaceId, nicheId);
  }

  /** Multi-market comparison respecting the requested/profile countries. */
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

  // ── internals ───────────────────────────────────────────────────────────

  private async buildInput(
    workspaceId: string,
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

    // Signals aren't geo-tagged individually; market relevance is strongest for
    // the project's own target market and weaker for other compared markets.
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

  private async recordAssumptionQuestions(workspaceId: string, projectId: string, breakdown: { dimension: string; assumptionBased: boolean }[]) {
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

function clusterByTopic(signals: SignalRow[]): [string, SignalRow[]][] {
  const map = new Map<string, SignalRow[]>();
  for (const s of signals) {
    const key = s.topic?.trim() || 'General opportunity';
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
}

function niceTitle(topic: string, group: SignalRow[]): string {
  if (topic !== 'General opportunity') return topic;
  return group[0]?.text.split(/\s+/).slice(0, 6).join(' ') ?? 'Opportunity';
}

function pickText(group: SignalRow[], type: SignalType): string | null {
  const s = group.find((g) => g.signalType === type);
  return s ? s.text.slice(0, 240) : null;
}

function riskLevelFor(group: SignalRow[]): 'low' | 'medium' | 'high' {
  const reg = group.filter((s) => s.signalType === 'regulatory').length;
  const comp = group.filter((s) => s.signalType === 'competitor').length;
  if (reg >= 2 || comp >= 3) return 'high';
  if (reg >= 1 || comp >= 1) return 'medium';
  return 'low';
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
