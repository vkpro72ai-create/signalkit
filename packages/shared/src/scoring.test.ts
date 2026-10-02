import { describe, it, expect } from 'vitest';
import {
  computeNicheScore,
  computeMarketScore,
  buildScenarios,
  DIMENSION_WEIGHTS,
  type ScoringInput,
} from './index.js';

const strong: ScoringInput = {
  pain: 0.9, demand: 0.9, pricing: 0.7, competitor: 0.2, regulatory: 0.1, timing: 0.8,
  techShift: 0.7, audience: 0.8, distribution: 0.7, marketMatch: 0.9, freshness: 0.9,
  signalDensity: 0.8, evidenceStrength: 0.85, contradictionRatio: 0,
};
const weak: ScoringInput = {
  pain: 0, demand: 0, pricing: 0, competitor: 0, regulatory: 0, timing: 0, techShift: 0,
  audience: 0, distribution: 0, marketMatch: 0, freshness: 0, signalDensity: 0, evidenceStrength: 0, contradictionRatio: 0,
};

describe('scoring engine', () => {
  it('weights sum to 1 (founder_market_fit optional at 0)', () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(DIMENSION_WEIGHTS.founder_market_fit).toBe(0);
  });

  it('always produces a full 17-dimension breakdown (no score without breakdown)', () => {
    const r = computeNicheScore(strong);
    expect(r.breakdown).toHaveLength(17);
    expect(r.breakdown.every((b) => typeof b.explanation === 'string' && b.explanation.length > 0)).toBe(true);
  });

  it('keeps opportunity and confidence SEPARATE', () => {
    const highOppThinEvidence: ScoringInput = { ...strong, evidenceStrength: 0.05, signalDensity: 0.1 };
    const r = computeNicheScore(highOppThinEvidence);
    expect(r.totalScore).toBeGreaterThan(50); // opportunity still high
    expect(r.confidence.value).toBeLessThan(0.5); // but confidence low
  });

  it('applies risk penalties for high regulatory/competition', () => {
    const risky: ScoringInput = { ...strong, regulatory: 0.9, competitor: 0.9 };
    const r = computeNicheScore(risky);
    expect(r.riskPenalties.length).toBeGreaterThanOrEqual(1);
    expect(r.totalScore).toBeLessThan(computeNicheScore(strong).totalScore);
  });

  it('flags assumption-based dimensions when signals are absent', () => {
    const r = computeNicheScore(weak);
    const assumptionDims = r.breakdown.filter((b) => b.assumptionBased).map((b) => b.dimension);
    expect(assumptionDims).toContain('mvp_feasibility');
    expect(assumptionDims).toContain('problem_urgency'); // no pain signal → assumption
    expect(r.confidence.value).toBeLessThan(0.4);
  });

  it('computes a per-market score and scenarios fan out by confidence', () => {
    const m = computeMarketScore(strong);
    expect(m.overall).toBeGreaterThan(0);
    expect(m.competition).toBe(20);
    const scenarios = buildScenarios(70, 0.4);
    expect(scenarios.find((s) => s.kind === 'conservative')!.opportunity).toBeLessThan(70);
    expect(scenarios.find((s) => s.kind === 'aggressive')!.opportunity).toBeGreaterThan(70);
  });
});
