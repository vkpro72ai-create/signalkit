/**
 * LLM provider marketplace, model catalog, BYOK connections and routing
 * contracts. Every AI task in SignalKit flows through the router defined here;
 * feature modules must never call providers directly.
 */
import type { Id, Timestamps, WorkspaceOwned, UserId } from './common.js';
import type { LocaleCode } from './geo.js';

export type LLMProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'deepseek'
  | 'openrouter'
  | 'openai_compatible'
  | 'custom';

export const LLM_PROVIDER_TYPES: readonly LLMProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'mistral',
  'deepseek',
  'openrouter',
  'openai_compatible',
  'custom',
] as const;

export interface LLMProvider extends Timestamps {
  id: Id;
  type: LLMProviderType;
  displayName: string;
  /** Base URL for OpenAI-compatible / custom providers. */
  baseUrl: string | null;
  docsUrl: string | null;
  /** Whether SignalKit ships a built-in adapter for this provider. */
  hasAdapter: boolean;
}

/**
 * Catalog entry shown to users BEFORE they connect, so they can compare price,
 * context, ratings, speed, strengths/weaknesses and privacy.
 */
export interface LLMModel extends Timestamps {
  id: Id;
  provider: LLMProviderType;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  /** Prices are per 1M tokens in `currency`. */
  inputTokenPrice: number;
  outputTokenPrice: number;
  currency: string;
  pricingSource: string | null;
  pricingFetchedAt: string | null;
  ratingOverall: number | null;
  ratingReasoning: number | null;
  ratingResearch: number | null;
  ratingDocumentWriting: number | null;
  ratingCodingContext: number | null;
  ratingMultilingual: number | null;
  speedRating: number | null;
  privacyRating: number | null;
  strengths: string[];
  weaknesses: string[];
  bestUseCases: string[];
  supportedLanguages: LocaleCode[];
  supportsJsonMode: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  sourceUrl: string | null;
  lastBenchmarkedAt: string | null;
}

/** Every AI task type the platform routes. Stable identifiers — used in configs. */
export type LLMTaskType =
  | 'source_summarization'
  | 'signal_extraction'
  | 'signal_normalization'
  | 'niche_generation'
  | 'niche_clustering'
  | 'scoring_explanation'
  | 'market_comparison'
  | 'product_vision_generation'
  | 'market_context_generation'
  | 'icp_generation'
  | 'jtbd_generation'
  | 'problem_map_generation'
  | 'user_scenarios_generation'
  | 'feature_scope_generation'
  | 'ux_flow_generation'
  | 'screen_map_generation'
  | 'design_brd_generation'
  | 'backend_brd_generation'
  | 'data_model_generation'
  | 'api_requirements_generation'
  | 'ai_agent_instructions_generation'
  | 'acceptance_criteria_generation'
  | 'monetization_generation'
  | 'gtm_generation'
  | 'analytics_plan_generation'
  | 'risk_analysis_generation'
  | 'research_questions_generation'
  | 'roadmap_generation'
  | 'critic_review'
  | 'contradiction_check'
  | 'translation'
  | 'export_formatting';

/** A stored, encrypted-at-rest BYOK connection. Secrets are never returned. */
export interface UserLLMConnection extends Timestamps {
  id: Id;
  workspaceId: Id;
  /** Null when this is a workspace-level (not user-scoped) connection. */
  userId: UserId | null;
  provider: LLMProviderType;
  label: string;
  /** Masked display only, e.g. "sk-...AB12". The raw key is never serialized. */
  maskedKey: string;
  baseUrl: string | null;
  status: 'active' | 'invalid' | 'revoked';
  lastTestedAt: string | null;
}

/** Routing rule mapping a task to model selection + guardrails. */
export interface LLMRoutingRule {
  taskType: LLMTaskType;
  /** Catalog model id to use for this task. */
  modelId: string;
  fallbackModelId: string | null;
  maxCostPerTask: number | null;
  maxTokensPerTask: number | null;
  timeoutMs: number;
  retryCount: number;
  jsonRequired: boolean;
}

export interface WorkspaceLLMSettings extends WorkspaceOwned {
  mode: 'byok' | 'platform';
  defaultModelId: string | null;
  fallbackModelId: string | null;
  routingRules: LLMRoutingRule[];
}

export interface LLMUsageLog extends Timestamps {
  id: Id;
  workspaceId: Id;
  userId: UserId | null;
  projectId: Id | null;
  packId: Id | null;
  documentId: Id | null;
  provider: LLMProviderType;
  model: string;
  taskType: LLMTaskType;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  actualCost: number | null;
  latencyMs: number;
  status: 'success' | 'error' | 'timeout' | 'cancelled';
  errorCode: string | null;
}

export interface LLMCostEstimate {
  modelId: string;
  fallbackModelId: string | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  currency: string;
  /** Confidence of the estimate itself. */
  confidence: number;
  highCostWarning: boolean;
}

export interface LLMBenchmarkResult extends Timestamps {
  id: Id;
  modelId: string;
  taskType: LLMTaskType;
  latencyMs: number;
  qualityScore: number | null;
  unsupportedClaims: number | null;
  structureAdherence: number | null;
  multilingualQuality: number | null;
  costPerRun: number | null;
}
