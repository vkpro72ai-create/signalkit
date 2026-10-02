/**
 * Deterministic opportunity scoring engine.
 *
 * Two scores are kept strictly SEPARATE:
 *  - Opportunity score (0–100): weighted dimensions minus risk penalties.
 *  - Confidence score (0–1): how well the opportunity is evidenced.
 *
 * Dimensions with no signal data are scored from a neutral prior and flagged
 * `assumptionBased` — the caller turns those into assumptions / unresolved
 * questions. Nothing here invents TAM/revenue.
 */
import type { ConfidenceLevel } from './common.js';
import type { ScoreDimension } from './trend.js';

/** 0..1 normalized inputs derived from a project's signals + evidence. */
export interface ScoringInput {
  pain: number;
  demand: number;
  pricing: number;
  competitor: number;
  regulatory: number;
  timing: number;
  techShift: number;
  audience: number;
  distribution: number;
  marketMatch: number;
  freshness: number;
  signalDensity: number; // totalSignals normalized 0..1
  evidenceStrength: number; // avg evidence quality*relevance 0..1
  contradictionRatio: number; // 0..1
}

export interface DimensionScore {
  dimension: ScoreDimension;
  score: number; // 0..100 (favorability)
  weight: number;
  explanation: string;
  assumptionBased: boolean;
}

export interface RiskPenalty {
  reason: string;
  penalty: number;
}

export interface NicheScoreResult {
  /** 0..100, opportunity only. */
  totalScore: number;
  /** 0..1 confidence, SEPARATE from opportunity. */
  confidence: { value: number; level: ConfidenceLevel };
  breakdown: DimensionScore[];
  riskPenalties: RiskPenalty[];
  explanation: string;
}

export const DIMENSION_WEIGHTS: Record<ScoreDimension, number> = {
  problem_urgency: 0.1,
  market_momentum: 0.1,
  willingness_to_pay: 0.1,
  local_fit: 0.07,
  competition_gap: 0.08,
  mvp_feasibility: 0.07,
  ai_leverage: 0.07,
  distribution_access: 0.06,
  retention_potential: 0.05,
  defensibility: 0.05,
  regulatory_safety: 0.06,
  cac_difficulty: 0.04,
  sales_cycle_complexity: 0.03,
  data_availability: 0.03,
  localization_complexity: 0.03,
  payment_readiness: 0.06,
  founder_market_fit: 0, // optional, informational only
};

const pct = (x: number) => Math.round(clamp01(x) * 100);

/** Compute a single dimension's favorability score + whether it's assumption-based. */
function scoreDimension(d: ScoreDimension, i: ScoringInput): Omit<DimensionScore, 'weight'> {
  switch (d) {
    case 'problem_urgency':
      return mk(d, pct(i.pain), i.pain > 0, `Problem urgency from observed pain signals.`);
    case 'market_momentum':
      return mk(d, pct((i.demand + i.timing + i.freshness) / 3), i.demand + i.timing > 0, `Momentum from demand, timing and recency.`);
    case 'willingness_to_pay':
      return mk(d, pct((i.pricing + i.demand * 0.5) / 1.5), i.pricing > 0, `Inferred from pricing and demand signals.`);
    case 'local_fit':
      return mk(d, pct((i.marketMatch + i.audience) / 2), i.audience > 0 || i.marketMatch > 0, `Audience and market match.`);
    case 'competition_gap':
      return mk(d, pct(1 - i.competitor), i.competitor > 0, `Gap is lower where competitor pressure is higher.`);
    case 'distribution_access':
      return mk(d, pct(i.distribution || 0.5), i.distribution > 0, i.distribution > 0 ? `From distribution signals.` : `No distribution signal — assumption.`);
    case 'regulatory_safety':
      return mk(d, pct(1 - i.regulatory), i.regulatory > 0, `Lower where regulatory pressure is higher.`);
    case 'data_availability':
      return mk(d, pct(i.signalDensity), i.signalDensity > 0, `From the density of collected signals.`);
    case 'localization_complexity':
      return mk(d, pct(i.marketMatch || 0.5), i.marketMatch > 0, `Favorable where market match is high.`);
    case 'cac_difficulty':
      return mk(d, pct(1 - i.competitor * 0.6), i.competitor > 0, `Harder where competition is dense.`);
    case 'ai_leverage':
      return mk(d, pct(0.5 + 0.5 * i.techShift), i.techShift > 0, i.techShift > 0 ? `From technology-shift signals.` : `Neutral prior — validate AI leverage.`);
    // Neutral-prior dimensions with no direct signal → assumptions to validate.
    case 'mvp_feasibility':
      return mk(d, 60, false, `Neutral prior — confirm MVP feasibility.`);
    case 'retention_potential':
      return mk(d, 55, false, `Neutral prior — retention is unverified.`);
    case 'defensibility':
      return mk(d, 50, false, `Neutral prior — defensibility is unverified.`);
    case 'sales_cycle_complexity':
      return mk(d, 55, false, `Neutral prior — sales cycle is unverified.`);
    case 'payment_readiness':
      return mk(d, 60, false, `Neutral prior — confirm payment readiness for the market.`);
    case 'founder_market_fit':
      return mk(d, 50, false, `Optional — depends on the team.`);
  }
}

/**
 * Compute the niche score. Opportunity and confidence are independent: a high
 * opportunity with thin evidence yields high opportunity + low confidence.
 */
export function computeNicheScore(i: ScoringInput): NicheScoreResult {
  const breakdown: DimensionScore[] = (Object.keys(DIMENSION_WEIGHTS) as ScoreDimension[]).map((d) => ({
    ...scoreDimension(d, i),
    weight: DIMENSION_WEIGHTS[d],
  }));

  const weighted = breakdown.reduce((sum, b) => sum + b.score * b.weight, 0);

  const riskPenalties: RiskPenalty[] = [];
  if (i.regulatory > 0.6) riskPenalties.push({ reason: 'High regulatory pressure', penalty: Math.round(i.regulatory * 15) });
  if (i.competitor > 0.7) riskPenalties.push({ reason: 'Crowded competition', penalty: Math.round(i.competitor * 10) });
  const penaltyTotal = riskPenalties.reduce((s, p) => s + p.penalty, 0);

  const totalScore = Math.max(0, Math.min(100, Math.round(weighted - penaltyTotal)));

  // Confidence — SEPARATE from opportunity.
  const assumptionRatio = breakdown.filter((b) => b.assumptionBased).length / breakdown.length;
  const confidenceValue = clamp01(
    0.15 + 0.4 * i.evidenceStrength + 0.2 * i.signalDensity + 0.25 * (1 - assumptionRatio) - 0.2 * i.contradictionRatio,
  );

  const top = [...breakdown].sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 3).map((b) => b.dimension.replace(/_/g, ' '));
  const explanation =
    `Opportunity ${totalScore}/100 driven by ${top.join(', ')}` +
    (riskPenalties.length ? `; penalized for ${riskPenalties.map((p) => p.reason.toLowerCase()).join(' and ')}` : '') +
    `. Confidence ${(confidenceValue * 100) | 0}% reflects evidence coverage (separate from opportunity).`;

  return {
    totalScore,
    confidence: { value: round2(confidenceValue), level: bandOf(confidenceValue) },
    breakdown,
    riskPenalties,
    explanation,
  };
}

/** Per-market score for multi-market comparison (respects a market profile's country). */
export interface MarketScoreResult {
  marketReadiness: number;
  willingnessToPay: number;
  competition: number;
  regulatoryRisk: number;
  localizationComplexity: number;
  distributionAccess: number;
  overall: number;
}

export function computeMarketScore(i: ScoringInput, paymentReadiness = 0.6): MarketScoreResult {
  const marketReadiness = pct((i.demand + i.timing + i.marketMatch) / 3);
  const willingnessToPay = pct((i.pricing + paymentReadiness) / 2);
  const competition = pct(i.competitor);
  const regulatoryRisk = pct(i.regulatory);
  const localizationComplexity = pct(1 - i.marketMatch);
  const distributionAccess = pct(i.distribution || 0.5);
  const overall = Math.round(
    0.3 * marketReadiness + 0.25 * willingnessToPay + 0.2 * (100 - competition) + 0.15 * (100 - regulatoryRisk) + 0.1 * distributionAccess,
  );
  return { marketReadiness, willingnessToPay, competition, regulatoryRisk, localizationComplexity, distributionAccess, overall };
}

export interface Scenario {
  kind: 'conservative' | 'base' | 'aggressive';
  opportunity: number;
  note: string;
}

/** Scenarios fan out from the base opportunity by the (separate) confidence band. */
export function buildScenarios(totalScore: number, confidence: number): Scenario[] {
  const spread = Math.round((1 - confidence) * 25);
  return [
    { kind: 'conservative', opportunity: Math.max(0, totalScore - spread), note: 'If weak assumptions fail to validate.' },
    { kind: 'base', opportunity: totalScore, note: 'Most likely, given current evidence.' },
    { kind: 'aggressive', opportunity: Math.min(100, totalScore + spread), note: 'If key assumptions validate strongly.' },
  ];
}

function mk(dimension: ScoreDimension, score: number, evidenceBacked: boolean, explanation: string): Omit<DimensionScore, 'weight'> {
  return { dimension, score, explanation, assumptionBased: !evidenceBacked };
}
function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function bandOf(v: number): ConfidenceLevel {
  if (v < 0.2) return 'very_low';
  if (v < 0.4) return 'low';
  if (v < 0.6) return 'medium';
  if (v < 0.8) return 'high';
  return 'very_high';
}
