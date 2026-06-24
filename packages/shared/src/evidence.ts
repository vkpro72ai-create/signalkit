/**
 * Evidence graph: claims, evidence, contradictions, confidence, assumptions,
 * constraints and unresolved questions — the trust layer of the platform.
 *
 * Hard rule: no important conclusion exists without evidence and/or an explicit
 * assumption. Unsupported claims must be marked as assumptions, never asserted.
 */
import type { Id, Timestamps, WorkspaceOwned, Confidence, GeneratedBy } from './common.js';
import type { CountryCode, RegionCode, LocaleCode } from './geo.js';

export type ClaimType =
  | 'market_demand'
  | 'competition'
  | 'willingness_to_pay'
  | 'local_fit'
  | 'regulatory_risk'
  | 'mvp_feasibility'
  | 'ai_leverage'
  | 'distribution_access'
  | 'retention_potential'
  | 'monetization'
  | 'user_pain'
  | 'timing'
  | 'technology_shift';

/** How an evidence item was obtained. */
export type EvidenceExtractionMethod =
  | 'manual'
  | 'llm_extraction'
  | 'rule_based'
  | 'imported';

export type EvidenceType =
  | 'quote'
  | 'statistic'
  | 'observation'
  | 'review'
  | 'pricing'
  | 'regulation'
  | 'competitor_fact';

export interface EvidenceItem extends Timestamps, WorkspaceOwned {
  id: Id;
  sourceRefId: Id;
  evidenceType: EvidenceType;
  /** Original-language quote/summary. */
  originalText: string;
  sourceLanguage: LocaleCode | null;
  /** Summary translated/written in the user's language. */
  summary: string;
  summaryLanguage: LocaleCode;
  country: CountryCode | null;
  region: RegionCode | null;
  relevanceScore: number;
  freshnessScore: number;
  sourceQuality: number;
  extractionMethod: EvidenceExtractionMethod;
  extractedAt: string;
}

export type ClaimReviewStatus = 'unreviewed' | 'reviewed' | 'disputed';

export interface Claim extends Timestamps, WorkspaceOwned {
  id: Id;
  text: string;
  type: ClaimType;
  confidence: Confidence;
  market: CountryCode | null;
  language: LocaleCode;
  supportingEvidenceIds: Id[];
  contradictingEvidenceIds: Id[];
  assumptionIds: Id[];
  unresolvedQuestionIds: Id[];
  generatedBy: GeneratedBy;
  reviewStatus: ClaimReviewStatus;
}

/** Link table with the role evidence plays for a claim. */
export interface ClaimEvidenceLink {
  id: Id;
  claimId: Id;
  evidenceItemId: Id;
  role: 'supports' | 'contradicts' | 'contextual';
  weight: number;
}

/** A detected conflict between evidence/claims. Never hidden. */
export interface Contradiction extends Timestamps {
  id: Id;
  claimId: Id;
  conflictingEvidenceIds: Id[];
  reason: string;
  /** Suggested research question to resolve it. */
  suggestedQuestion: string | null;
  resolved: boolean;
}

/** Explicit confidence assessment attached to any scored entity. */
export interface ConfidenceAssessment extends Timestamps {
  id: Id;
  subjectType: 'claim' | 'niche' | 'score' | 'document' | 'pack';
  subjectId: Id;
  confidence: Confidence;
  evidenceCount: number;
  contradictionCount: number;
}

export type AssumptionValidationStatus =
  | 'untested'
  | 'supported'
  | 'contradicted'
  | 'invalidated'
  | 'needs_more_data';

export interface Assumption extends Timestamps, WorkspaceOwned {
  id: Id;
  text: string;
  language: LocaleCode;
  /** Why this is an assumption rather than a supported claim. */
  rationale: string;
  validationStatus: AssumptionValidationStatus;
  impactIfWrong: 'low' | 'medium' | 'high';
}

export interface AssumptionValidation extends Timestamps {
  id: Id;
  assumptionId: Id;
  status: AssumptionValidationStatus;
  note: string;
  /** Optional research update that drove the validation. */
  researchUpdateId: Id | null;
}

export interface Constraint extends Timestamps {
  id: Id;
  text: string;
  category: 'technical' | 'legal' | 'budget' | 'time' | 'market' | 'team';
  language: LocaleCode;
}

export interface UnresolvedQuestion extends Timestamps {
  id: Id;
  text: string;
  language: LocaleCode;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'answered' | 'dismissed';
}
