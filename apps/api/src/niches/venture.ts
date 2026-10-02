/**
 * Deterministic Venture Thesis builder.
 *
 * Converts a strong niche + its evidence + the Venture Scale Score into a
 * structured, honest Venture Thesis. It is evidence-aware: anything not backed
 * by a claim is flagged as an assumption, and weak venture-scale dimensions
 * surface as kill reasons / what-must-be-true / unresolved questions.
 *
 * It never asserts venture scale as fact and never fabricates TAM.
 */
import {
  type VentureThesis,
  type VentureScaleScoreResult,
  type ThesisSection,
  labelOf,
} from '@signalkit/shared';

export interface VentureThesisInput {
  niche: {
    title: string;
    oneLiner: string;
    problem: string;
    whyNow: string;
    targetAudience: string;
    useCases: string[];
    competitors: string[];
    monetization: string;
  };
  market: { country: string | null; marketLanguage: string; scope: string };
  ventureScale: VentureScaleScoreResult;
  claims: { text: string; type: string; confidenceLevel: string }[];
  assumptions: { text: string }[];
  unresolvedQuestions: { text: string }[];
}

/** True when at least one claim of the given type backs a statement. */
function backedBy(claims: VentureThesisInput['claims'], types: string[]): boolean {
  return claims.some((c) => types.includes(c.type));
}

function section(text: string, assumption: boolean): ThesisSection {
  return { text, assumption };
}

export function buildVentureThesis(input: VentureThesisInput): VentureThesis {
  const { niche, ventureScale, claims, assumptions, unresolvedQuestions, market } = input;

  const macroShifts = [
    ...claims.filter((c) => c.type === 'technology_shift' || c.type === 'market_demand').map((c) => c.text),
  ];
  if (macroShifts.length === 0) macroShifts.push(`What changed in the world for "${niche.title}" — assumption pending timing evidence.`);

  // Kill reasons come from the weakest venture-scale dimensions (honest downside).
  const killReasons = ventureScale.breakdown
    .filter((b) => b.assumptionBased || b.score < 45)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((b) => `${capitalize(labelOf(b.dimension))} may not hold: ${b.reasoning}`);
  if (killReasons.length === 0) killReasons.push('No fatal weakness detected from current signals — still validate the wedge before building.');

  const aiClaimBacked = backedBy(claims, ['technology_shift']);
  const distBacked = backedBy(claims, ['distribution_access']);
  const painBacked = backedBy(claims, ['user_pain']);
  const timingBacked = backedBy(claims, ['timing', 'market_demand']);

  const firstValidationExperiments = [
    `Run ${niche.targetAudience ? niche.targetAudience.toLowerCase() : 'target user'} interviews to confirm the pain is frequent and expensive.`,
    'Stand up a landing page describing the entry wedge and measure qualified sign-ups.',
    distBacked ? 'Test the evidenced distribution channel with a small cohort.' : 'Identify and test one zero-CAC distribution channel.',
    'Price-probe willingness to pay with 5–10 prospective buyers.',
  ];

  return {
    breakoutThesis:
      `${niche.title}: ${niche.oneLiner} The breakout bet is that a narrow wedge for ${niche.targetAudience || 'the target user'} ` +
      `can expand into a larger category — potential, not a guarantee (venture-scale ${ventureScale.totalScore}/100).`,
    whyNow: section(niche.whyNow, !timingBacked),
    macroShifts,
    entryWedge: section(
      `Start with the narrowest valuable product: ${niche.useCases[0] ?? `the core workflow of ${niche.title}`}. ` +
        `It is reachable because a small team can ship it and one buyer segment (${niche.targetAudience || 'the initial ICP'}) feels the pain first.`,
      niche.useCases.length === 0,
    ),
    expansionPath: section(
      `From the wedge, expand into adjacent workflows and modules, moving from a point tool toward a platform/system of record for ${niche.targetAudience || 'this segment'}.`,
      ventureScale.breakdown.find((b) => b.dimension === 'expansion_surface')?.assumptionBased ?? true,
    ),
    targetCustomer: niche.targetAudience || 'Target customer — assumption to validate.',
    painEconomics: section(
      `Pain felt by ${niche.targetAudience || 'the user'}: ${niche.problem}. Validate frequency, cost, who pays and existing budget.`,
      !painBacked,
    ),
    alternatives: niche.competitors.length ? niche.competitors : ['Status quo / manual workarounds — competitive landscape is an assumption.'],
    aiUnlock: section(
      ventureScale.breakdown.find((b) => b.dimension === 'ai_unlock')?.reasoning ??
        'What is newly possible because of AI for this problem?',
      !aiClaimBacked,
    ),
    distributionWedge: section(
      ventureScale.breakdown.find((b) => b.dimension === 'distribution_wedge')?.reasoning ??
        'How the first users are reached.',
      !distBacked,
    ),
    dataWorkflowMoat: section(
      'Does the product get better with usage and own a recurring workflow / become a system of record? Unproven — treat as a hypothesis.',
      true,
    ),
    monetizationPath: niche.monetization || 'Monetization — assumption pending willingness-to-pay validation.',
    marketConstraints: `Scope: ${market.scope}. Primary market: ${market.country ?? 'global'} (${market.marketLanguage}). Validate localization and local regulation.`,
    ventureScaleNarrative: section(ventureScale.explanation, true),
    killReasons,
    whatMustBeTrue: ventureScale.whatMustBeTrue,
    firstValidationExperiments,
    evidenceConfidence: ventureScale.confidence,
    assumptions: assumptions.map((a) => a.text),
    unresolvedQuestions: unresolvedQuestions.map((q) => q.text),
  };
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
