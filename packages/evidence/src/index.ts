/**
 * @signalkit/evidence — trust-layer helpers over the evidence graph.
 *
 * Trust law (docs/AGENT_RULES.md): no important conclusion without evidence
 * and/or an explicit assumption; contradictions lower confidence and are never
 * hidden. Session 1 ships the deterministic helpers these rules depend on; the
 * full graph + detectors are built in Session 8.
 */
import type {
  Claim,
  Confidence,
  ConfidenceLevel,
  EvidenceItem,
  Contradiction,
} from '@signalkit/shared';

/** Map a 0..1 confidence value to a coarse band for UI badges. */
export function toConfidenceLevel(value: number): ConfidenceLevel {
  const v = clamp01(value);
  if (v < 0.2) return 'very_low';
  if (v < 0.4) return 'low';
  if (v < 0.6) return 'medium';
  if (v < 0.8) return 'high';
  return 'very_high';
}

/** Build a Confidence object from a raw value. */
export function makeConfidence(value: number, rationale?: string): Confidence {
  const v = clamp01(value);
  return rationale === undefined
    ? { value: v, level: toConfidenceLevel(v) }
    : { value: v, level: toConfidenceLevel(v), rationale };
}

/**
 * Derive a claim's confidence from its supporting/contradicting evidence and
 * average source quality. Contradictions always reduce confidence — never zero
 * it silently, but they must be visible.
 */
export function deriveClaimConfidence(input: {
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
  hasOpenContradiction: boolean;
}): Confidence {
  const { supporting, contradicting, hasOpenContradiction } = input;

  if (supporting.length === 0) {
    // No supporting evidence => this is at most an assumption, not a claim.
    return makeConfidence(0.1, 'No supporting evidence; treat as an assumption.');
  }

  const support = avg(supporting.map((e) => e.relevanceScore * e.sourceQuality));
  const counter = contradicting.length === 0 ? 0 : avg(contradicting.map((e) => e.relevanceScore));

  let value = support * (1 - 0.5 * counter);
  if (hasOpenContradiction) value *= 0.6;

  const rationale =
    contradicting.length > 0 || hasOpenContradiction
      ? 'Confidence reduced by contradicting evidence.'
      : `Backed by ${supporting.length} evidence item(s).`;

  return makeConfidence(value, rationale);
}

/**
 * A claim is "supported" only if it has at least one supporting evidence item.
 * Used by the unsupported-claim detector and quality gates.
 */
export function isSupportedClaim(claim: Pick<Claim, 'supportingEvidenceIds'>): boolean {
  return claim.supportingEvidenceIds.length > 0;
}

/** Are there any unresolved contradictions in the set? */
export function hasUnresolvedContradiction(contradictions: Contradiction[]): boolean {
  return contradictions.some((c) => !c.resolved);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
