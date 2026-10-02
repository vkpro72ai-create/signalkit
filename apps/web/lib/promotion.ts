/**
 * Pure promotion-eligibility guard, mirroring the backend's two-gate rule:
 * system gate (Build-Ready) AND founder gate (commitment + risk review).
 * Kept as a pure function so the UI can disable the CTA deterministically and
 * so the invariant is unit-testable without a DOM.
 */
export function canPromote(input: { buildReady: boolean; commitmentConfirmed: boolean; reviewedRisks: boolean }): boolean {
  return input.buildReady && input.commitmentConfirmed && input.reviewedRisks;
}
