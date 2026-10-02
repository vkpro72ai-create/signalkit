/**
 * Breakout Opportunity Engine — Venture Thesis + Venture Scale Score.
 *
 * SignalKit must not output only narrow "trend niches". For every strong
 * opportunity it produces a Venture Thesis (wedge → expansion → venture path)
 * and a Venture Scale Score that is kept STRICTLY SEPARATE from the existing
 * Opportunity Score and Confidence Score:
 *
 *  - Opportunity Score: is this a good opportunity?           (scoring.ts)
 *  - Confidence Score:  how well supported is it?             (scoring.ts)
 *  - Venture Scale Score: can this become a large company?    (this file)
 *  - Build Readiness Score: is it ready to design/build?      (blueprint.ts)
 *
 * Hard rules enforced here:
 *  - No fake TAM. Market size is ALWAYS assumption-based unless real evidence
 *    exists; weak market size becomes an assumption / unresolved question.
 *  - No unsupported unicorn claims. The narrative never asserts venture scale
 *    as fact — it states what must be true and flags missing evidence.
 *  - Assumptions are never presented as facts.
 */
import type { ConfidenceLevel, Id } from './common.js';
import type { ScoringInput } from './scoring.js';

/** Dimensions a venture-scale opportunity is assessed on. */
export type VentureScaleDimension =
  | 'market_size_path'
  | 'pain_cost'
  | 'frequency'
  | 'budget_ownership'
  | 'distribution_wedge'
  | 'data_moat'
  | 'workflow_ownership'
  | 'expansion_surface'
  | 'incumbent_weakness'
  | 'ai_unlock'
  | 'timing_shift'
  | 'global_repeatability'
  | 'network_effects'
  | 'revenue_density'
  | 'category_creation';

export const VENTURE_SCALE_WEIGHTS: Record<VentureScaleDimension, number> = {
  market_size_path: 0.12,
  pain_cost: 0.1,
  frequency: 0.07,
  budget_ownership: 0.08,
  distribution_wedge: 0.08,
  data_moat: 0.07,
  workflow_ownership: 0.07,
  expansion_surface: 0.08,
  incumbent_weakness: 0.07,
  ai_unlock: 0.07,
  timing_shift: 0.05,
  global_repeatability: 0.05,
  network_effects: 0.03,
  revenue_density: 0.04,
  category_creation: 0.02,
};

/** One scored venture-scale dimension with full evidence/assumption breakdown. */
export interface VentureScaleDimensionScore {
  dimension: VentureScaleDimension;
  /** 0..100 favorability for venture scale. */
  score: number;
  weight: number;
  reasoning: string;
  /** True when the score rests on a neutral prior / no direct evidence. */
  assumptionBased: boolean;
  /** 0..1 confidence in THIS dimension specifically. */
  confidence: number;
  /** Backing claim ids (filled by the service from the evidence graph). */
  claimIds: Id[];
  /** Open question if this dimension is weak/unproven. */
  unresolvedQuestion: string | null;
}

export interface VentureScaleScoreResult {
  /** 0..100 venture-scale potential. SEPARATE from opportunity & confidence. */
  totalScore: number;
  /** 0..1 confidence in the venture-scale assessment (evidence coverage). */
  confidence: { value: number; level: ConfidenceLevel };
  breakdown: VentureScaleDimensionScore[];
  /** Dimensions that must be validated before believing the venture-scale story. */
  whatMustBeTrue: string[];
  /** Plain explanation; never asserts unicorn scale as fact. */
  explanation: string;
}

const pct = (x: number) => Math.round(clamp01(x) * 100);

/**
 * Score a single venture-scale dimension. `evidenceBacked` is false for any
 * dimension that has no direct signal — those are neutral priors flagged as
 * assumptions (this is how we avoid fake TAM and unicorn fantasy).
 */
function scoreVentureDimension(
  d: VentureScaleDimension,
  i: ScoringInput,
): Omit<VentureScaleDimensionScore, 'weight' | 'claimIds'> {
  switch (d) {
    case 'market_size_path':
      // NEVER fabricate TAM. Market size path is always an assumption unless
      // real evidence is added later. Neutral prior, flagged, with a question.
      return mk(d, pct(0.45 + 0.2 * i.demand), false,
        'Market-size path is an assumption — SignalKit does not fabricate TAM. Validate with bottom-up sizing.',
        'What is the bottom-up market size (users × budget × frequency)? No fabricated TAM.');
    case 'pain_cost':
      return mk(d, pct(i.pain), i.pain > 0,
        i.pain > 0 ? 'Cost of the pain inferred from observed pain signals.' : 'No pain-cost signal — assumption.',
        i.pain > 0 ? null : 'How expensive is this pain, and who pays for it today?');
    case 'frequency':
      return mk(d, pct(0.5 + 0.3 * i.demand), i.demand > 0,
        i.demand > 0 ? 'Frequency inferred from demand recurrence signals.' : 'Neutral prior — frequency unverified.',
        i.demand > 0 ? null : 'How often does this pain recur (daily/weekly/one-off)?');
    case 'budget_ownership':
      return mk(d, pct(i.pricing), i.pricing > 0,
        i.pricing > 0 ? 'Existing budget inferred from pricing/willingness signals.' : 'No budget-ownership signal — assumption.',
        i.pricing > 0 ? null : 'Who owns the budget line that pays for this?');
    case 'distribution_wedge':
      return mk(d, pct(i.distribution || 0.45), i.distribution > 0,
        i.distribution > 0 ? 'A reachable distribution wedge is evidenced.' : 'No distribution signal — wedge is an assumption.',
        i.distribution > 0 ? null : 'What existing channel reaches the first users without paid CAC?');
    case 'data_moat':
      return mk(d, 50, false, 'Neutral prior — data/workflow moat is unproven.',
        'Does the product accumulate proprietary workflow data that compounds with usage?');
    case 'workflow_ownership':
      return mk(d, 52, false, 'Neutral prior — daily/weekly workflow ownership unproven.',
        'Can this own a recurring workflow and become a system of record?');
    case 'expansion_surface':
      return mk(d, pct((i.demand + i.signalDensity) / 2), i.signalDensity > 0.3,
        i.signalDensity > 0.3 ? 'Adjacent workflows suggest an expansion surface.' : 'Expansion surface is an assumption.',
        i.signalDensity > 0.3 ? null : 'What adjacent modules/workflows extend the wedge into a platform?');
    case 'incumbent_weakness':
      return mk(d, pct(1 - i.competitor), i.competitor > 0,
        i.competitor > 0 ? 'Incumbents exist; weakness inferred from gap signals.' : 'Incumbent landscape unverified.',
        i.competitor > 0 ? null : 'Why can incumbents not solve this quickly, and why now?');
    case 'ai_unlock':
      return mk(d, pct(0.45 + 0.55 * i.techShift), i.techShift > 0,
        i.techShift > 0 ? 'AI/technology shift makes a previously hard problem newly tractable.' : 'AI unlock is an assumption.',
        i.techShift > 0 ? null : 'What is newly possible because of AI that was impossible/too expensive before?');
    case 'timing_shift':
      return mk(d, pct(i.timing), i.timing > 0,
        i.timing > 0 ? 'A timing / regulation / behavior shift supports "why now".' : 'Why-now is an assumption.',
        i.timing > 0 ? null : 'What macro shift makes now the right time?');
    case 'global_repeatability':
      return mk(d, pct(i.marketMatch || 0.5), i.marketMatch > 0,
        'Repeatability across markets inferred from market match (validate localization).',
        i.marketMatch > 0 ? null : 'Does the wedge repeat across countries/languages?');
    case 'network_effects':
      return mk(d, 45, false, 'Neutral prior — network/ecosystem effects often absent; do not assume them.',
        'Are there genuine network or ecosystem effects, or is this assumed?');
    case 'revenue_density':
      return mk(d, pct((i.pricing + i.demand * 0.5) / 1.5), i.pricing > 0,
        i.pricing > 0 ? 'Revenue density inferred from pricing and demand.' : 'Revenue density is an assumption.',
        i.pricing > 0 ? null : 'What is realistic revenue per account, and is it dense enough?');
    case 'category_creation':
      return mk(d, pct((i.techShift + i.timing) / 2), false,
        'Category-creation potential is speculative — treat as an assumption, not a fact.',
        'Is this a new category or a feature of an existing one?');
  }
}

/**
 * Compute the Venture Scale Score. Independent of opportunity & confidence.
 * Returns full per-dimension reasoning, assumption flags and the explicit
 * "what must be true" list (every weak/assumption dimension surfaces a question).
 */
export function computeVentureScaleScore(i: ScoringInput): VentureScaleScoreResult {
  const breakdown: VentureScaleDimensionScore[] = (
    Object.keys(VENTURE_SCALE_WEIGHTS) as VentureScaleDimension[]
  ).map((d) => ({
    ...scoreVentureDimension(d, i),
    weight: VENTURE_SCALE_WEIGHTS[d],
    claimIds: [],
  }));

  const totalScore = Math.max(
    0,
    Math.min(100, Math.round(breakdown.reduce((s, b) => s + b.score * b.weight, 0))),
  );

  // Confidence is driven by how much of the venture story is actually evidenced
  // (not assumption-based) plus evidence strength — kept separate from the score.
  const assumptionRatio = breakdown.filter((b) => b.assumptionBased).length / breakdown.length;
  const confidenceValue = clamp01(
    0.1 + 0.45 * i.evidenceStrength + 0.15 * i.signalDensity + 0.3 * (1 - assumptionRatio) - 0.15 * i.contradictionRatio,
  );

  const whatMustBeTrue = breakdown
    .filter((b) => b.assumptionBased || b.score < 55)
    .map((b) => b.unresolvedQuestion ?? `${labelOf(b.dimension)} must hold`)
    .filter((q): q is string => Boolean(q));

  const top = [...breakdown]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((b) => labelOf(b.dimension));

  const explanation =
    `Venture-scale potential ${totalScore}/100, strongest on ${top.join(', ')}. ` +
    `This is potential, not a guarantee — ${breakdown.filter((b) => b.assumptionBased).length} of ${breakdown.length} ` +
    `dimensions rest on assumptions (market size is never fabricated). ` +
    `Confidence ${(confidenceValue * 100) | 0}% reflects evidence coverage (separate from the score).`;

  return {
    totalScore,
    confidence: { value: round2(confidenceValue), level: bandOf(confidenceValue) },
    breakdown,
    whatMustBeTrue: dedupe(whatMustBeTrue),
    explanation,
  };
}

function mk(
  dimension: VentureScaleDimension,
  score: number,
  evidenceBacked: boolean,
  reasoning: string,
  unresolvedQuestion: string | null,
): Omit<VentureScaleDimensionScore, 'weight' | 'claimIds'> {
  return {
    dimension,
    score,
    reasoning,
    assumptionBased: !evidenceBacked,
    // Per-dimension confidence: evidenced dimensions start higher.
    confidence: evidenceBacked ? 0.6 : 0.25,
    unresolvedQuestion: evidenceBacked ? null : unresolvedQuestion,
  };
}

export function labelOf(d: VentureScaleDimension): string {
  return d.replace(/_/g, ' ');
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
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

// ─── Venture Thesis (structured narrative) ───────────────────────────────────

/** A single evidence-aware section of the venture thesis. */
export interface ThesisSection {
  /** The substantive content. */
  text: string;
  /** True when this section is an unvalidated hypothesis, not a fact. */
  assumption: boolean;
}

/**
 * The Venture Thesis: a structured, evidence-aware narrative for a strong
 * opportunity. Every field is honest about whether it is evidenced or assumed.
 */
export interface VentureThesis {
  breakoutThesis: string;
  whyNow: ThesisSection;
  macroShifts: string[];
  entryWedge: ThesisSection;
  expansionPath: ThesisSection;
  targetCustomer: string;
  painEconomics: ThesisSection;
  alternatives: string[];
  aiUnlock: ThesisSection;
  distributionWedge: ThesisSection;
  dataWorkflowMoat: ThesisSection;
  monetizationPath: string;
  marketConstraints: string;
  ventureScaleNarrative: ThesisSection;
  killReasons: string[];
  whatMustBeTrue: string[];
  firstValidationExperiments: string[];
  evidenceConfidence: { value: number; level: ConfidenceLevel };
  assumptions: string[];
  unresolvedQuestions: string[];
}
