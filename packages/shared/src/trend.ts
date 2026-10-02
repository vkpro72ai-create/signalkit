/**
 * Trend ingestion, signals, niches and scoring contracts.
 */
import type {
  Id,
  ProjectId,
  Timestamps,
  WorkspaceOwned,
  Confidence,
} from './common.js';
import type { CountryCode, RegionCode, LocaleCode, MarketProfile } from './geo.js';

/** Where a source came from. Adapters implement one of these. */
export type SourceAdapterType =
  | 'manual'
  | 'url'
  | 'search_result'
  | 'app_store_review'
  | 'reddit'
  | 'product_hunt'
  | 'competitor_website'
  | 'pricing_page'
  | 'regulatory_page';

/** A reference back to where a piece of evidence originated. */
export interface SourceReference extends Timestamps {
  id: Id;
  adapter: SourceAdapterType;
  url: string | null;
  title: string | null;
  publisher: string | null;
  language: LocaleCode | null;
  country: CountryCode | null;
  /** Whether the user supplied this content directly. */
  userProvided: boolean;
  collectedAt: string;
}

export type SignalType =
  | 'demand'
  | 'pain'
  | 'competitor'
  | 'pricing'
  | 'regulatory'
  | 'technology_shift'
  | 'audience'
  | 'distribution'
  | 'timing';

/** A normalized market signal extracted from one or more sources. */
export interface TrendSignal extends Timestamps, WorkspaceOwned {
  id: Id;
  projectId: ProjectId;
  signalType: SignalType;
  text: string;
  /** 0..1 scores. */
  strengthScore: number;
  freshnessScore: number;
  sourceQuality: number;
  targetMarket: MarketProfile;
  industry: string | null;
  topic: string | null;
  audience: string | null;
  sourceRefIds: Id[];
}

/** Raw, unprocessed item as collected by an adapter. */
export interface RawSourceItem extends Timestamps, WorkspaceOwned {
  id: Id;
  projectId: ProjectId;
  sourceRefId: Id;
  adapter: SourceAdapterType;
  content: string;
  url: string | null;
  language: LocaleCode | null;
  country: CountryCode | null;
  status: 'collected' | 'parsed' | 'failed' | 'excluded';
}

/** Normalized, summarized item ready for signal extraction. */
export interface NormalizedSourceItem extends Timestamps {
  id: Id;
  rawSourceItemId: Id;
  summary: string;
  extractedEntities: string[];
  detectedMarket: CountryCode | null;
  detectedLanguage: LocaleCode | null;
  relevance: number;
}

/** Coarse risk level used on niches and elsewhere. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** A discovered niche / opportunity. */
export interface Niche extends Timestamps, WorkspaceOwned {
  id: Id;
  projectId: ProjectId;
  title: string;
  oneLiner: string;
  problem: string;
  targetAudience: string;
  whyNow: string;
  useCases: string[];
  competitors: string[];
  mvpConcept: string;
  monetization: string;
  recommendedProductFormat: string;
  riskLevel: RiskLevel;
  market: MarketProfile;
  language: LocaleCode;
  /** Links into evidence/claims/assumptions live in the evidence module. */
  claimIds: Id[];
  assumptionIds: Id[];
  unresolvedQuestionIds: Id[];
  sourceRefIds: Id[];
  currentScoreId: Id | null;
}

/** Scoring algorithm version so historical scores remain interpretable. */
export interface ScoringVersion {
  id: Id;
  version: string;
  description: string;
  createdAt: string;
}

/** The individual dimensions an opportunity is scored on. */
export type ScoreDimension =
  | 'problem_urgency'
  | 'market_momentum'
  | 'willingness_to_pay'
  | 'local_fit'
  | 'competition_gap'
  | 'mvp_feasibility'
  | 'ai_leverage'
  | 'distribution_access'
  | 'retention_potential'
  | 'defensibility'
  | 'regulatory_safety'
  | 'cac_difficulty'
  | 'sales_cycle_complexity'
  | 'data_availability'
  | 'localization_complexity'
  | 'payment_readiness'
  | 'founder_market_fit';

export interface ScoringBreakdown {
  dimension: ScoreDimension;
  /** 0..100 */
  score: number;
  /** Weight applied to this dimension in the total. */
  weight: number;
  explanation: string;
  /** Evidence/claims backing this dimension. */
  claimIds: Id[];
}

export interface NicheScore extends Timestamps {
  id: Id;
  nicheId: Id;
  scoringVersionId: Id;
  /** 0..100 total opportunity score. */
  totalScore: number;
  confidence: Confidence;
  breakdown: ScoringBreakdown[];
  riskPenalties: { reason: string; penalty: number }[];
  explanation: string;
}

/** Per-market score used in multi-market comparison. */
export interface MarketScore {
  country: CountryCode;
  region: RegionCode | null;
  marketReadiness: number;
  willingnessToPay: number;
  competition: number;
  regulatoryRisk: number;
  localizationComplexity: number;
  distributionAccess: number;
}
