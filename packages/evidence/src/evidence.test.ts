import { describe, it, expect } from 'vitest';
import type { EvidenceItem } from '@signalkit/shared';
import {
  claimGroundingStatus,
  isClaimGrounded,
  assessClaim,
  deriveClaimConfidence,
  toConfidenceLevel,
} from './index.js';

function evidence(relevance: number, quality: number): EvidenceItem {
  return {
    id: 'e', workspaceId: 'w', sourceRefId: 's', evidenceType: 'observation',
    originalText: 'x', sourceLanguage: 'en', summary: 'x', summaryLanguage: 'en',
    country: null, region: null, relevanceScore: relevance, freshnessScore: 1, sourceQuality: quality,
    extractionMethod: 'rule_based', extractedAt: '', createdAt: '', updatedAt: '',
  };
}

describe('@signalkit/evidence grounding & assessment', () => {
  it('classifies grounding: evidence > assumption > ungrounded', () => {
    expect(claimGroundingStatus({ supportingEvidenceCount: 2, assumptionCount: 0 })).toBe('evidence_backed');
    expect(claimGroundingStatus({ supportingEvidenceCount: 0, assumptionCount: 1 })).toBe('assumption_only');
    expect(claimGroundingStatus({ supportingEvidenceCount: 0, assumptionCount: 0 })).toBe('ungrounded');
    expect(isClaimGrounded({ supportingEvidenceCount: 0, assumptionCount: 0 })).toBe(false);
  });

  it('caps assumption-only claims at low confidence and marks them weak', () => {
    const a = assessClaim({ supporting: [], contradicting: [], assumptionCount: 1, hasOpenContradiction: false });
    expect(a.grounding).toBe('assumption_only');
    expect(a.confidence.value).toBeLessThan(0.3);
    expect(a.weak).toBe(true);
  });

  it('contradiction lowers confidence vs the same evidence without one', () => {
    const supporting = [evidence(0.9, 0.9), evidence(0.8, 0.9)];
    const clean = assessClaim({ supporting, contradicting: [], assumptionCount: 0, hasOpenContradiction: false });
    const conflicted = assessClaim({ supporting, contradicting: [evidence(0.8, 0.8)], assumptionCount: 0, hasOpenContradiction: true });
    expect(conflicted.confidence.value).toBeLessThan(clean.confidence.value);
    expect(conflicted.weak).toBe(true);
  });

  it('evidence-backed with strong support is not weak', () => {
    const supporting = [evidence(0.9, 0.9), evidence(0.85, 0.9), evidence(0.8, 0.8)];
    const a = assessClaim({ supporting, contradicting: [], assumptionCount: 0, hasOpenContradiction: false });
    expect(a.grounding).toBe('evidence_backed');
    expect(a.weak).toBe(false);
    expect(toConfidenceLevel(a.confidence.value)).not.toBe('very_low');
  });

  it('deriveClaimConfidence treats no-evidence as near-zero', () => {
    expect(deriveClaimConfidence({ supporting: [], contradicting: [], hasOpenContradiction: false }).value).toBeLessThan(0.2);
  });
});
