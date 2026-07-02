/**
 * Default task → model routing. Used when a workspace has no explicit rule for a
 * task, so every task always resolves to a model. Workspace settings override.
 */
import type { LLMProviderType, LLMRoutingRule, LLMTaskType } from '@signalkit/shared';

// Catalog model ids (see catalog.ts).
const MINI = 'gpt-4o-mini';
const GPT4O = 'gpt-4o';
const SONNET = 'claude-sonnet-4-6';
const DEEPSEEK = 'deepseek-chat';
const GEMINI = 'gemini-2.0-flash';

/** Document-generation tasks default to a strong long-form writer. */
const DOC = SONNET;

export const DEFAULT_TASK_MODELS: Record<LLMTaskType, string> = {
  llm_smoke_test: DEEPSEEK,
  source_summarization: MINI,
  signal_extraction: MINI,
  signal_normalization: MINI,
  niche_generation: GPT4O,
  niche_clustering: GPT4O,
  scoring_explanation: DEEPSEEK,
  market_comparison: DEEPSEEK,
  product_vision_generation: DOC,
  market_context_generation: DOC,
  icp_generation: DOC,
  jtbd_generation: DOC,
  problem_map_generation: DOC,
  user_scenarios_generation: DOC,
  feature_scope_generation: DOC,
  ux_flow_generation: DOC,
  screen_map_generation: DOC,
  design_brd_generation: DOC,
  backend_brd_generation: DOC,
  data_model_generation: DOC,
  api_requirements_generation: DOC,
  ai_agent_instructions_generation: DOC,
  acceptance_criteria_generation: DOC,
  monetization_generation: DOC,
  gtm_generation: DOC,
  analytics_plan_generation: DOC,
  risk_analysis_generation: DOC,
  research_questions_generation: DOC,
  roadmap_generation: DOC,
  critic_review: GPT4O,
  contradiction_check: GPT4O,
  translation: MINI,
  export_formatting: MINI,
};

/** Tasks whose output must be valid JSON. */
export const JSON_TASKS: ReadonlySet<LLMTaskType> = new Set<LLMTaskType>([
  'signal_extraction',
  'signal_normalization',
  'niche_clustering',
  'contradiction_check',
]);

const PACK_TASKS = new Set<LLMTaskType>(['product_vision_generation']);

/** Preferred provider-level defaults used when a workspace has a connection but no explicit model. */
export const DEFAULT_PROVIDER_MODELS: Partial<Record<LLMProviderType, string | null>> = {
  openai: MINI,
  anthropic: SONNET,
  google: GEMINI,
  deepseek: DEEPSEEK,
  mistral: 'mistral-large-latest',
  openrouter: null,
};

export function defaultModelForProvider(provider: LLMProviderType): string | null {
  return DEFAULT_PROVIDER_MODELS[provider] ?? null;
}

/** Pick a sensible fallback model that differs from the primary. */
export function defaultFallback(modelId: string): string {
  if (modelId === MINI) return GEMINI;
  if (modelId === SONNET) return GPT4O;
  return MINI;
}

/** Build a default routing rule for a task. */
export function defaultRoutingRule(taskType: LLMTaskType): LLMRoutingRule {
  const modelId = DEFAULT_TASK_MODELS[taskType];
  return {
    taskType,
    modelId,
    fallbackModelId: defaultFallback(modelId),
    maxCostPerTask: null,
    maxTokensPerTask: PACK_TASKS.has(taskType) ? 16_000 : null,
    timeoutMs: PACK_TASKS.has(taskType) ? 300_000 : 60_000,
    retryCount: PACK_TASKS.has(taskType) ? 0 : 2,
    jsonRequired: JSON_TASKS.has(taskType),
  };
}
