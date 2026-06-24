/**
 * @signalkit/llm — provider adapter & router contracts.
 *
 * Hard architectural law (docs/AGENT_RULES.md): all AI calls flow through the
 * LLMRouter. Feature modules must never call a provider SDK directly. Session 1
 * defines the interfaces; Session 4 implements provider adapters and Session 5
 * implements the router, cost control and usage logging.
 */
import type {
  LLMProviderType,
  LLMTaskType,
  LLMCostEstimate,
  LLMRoutingRule,
  LocaleCode,
} from '@signalkit/shared';

/** A single chat message in a provider-agnostic shape. */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A normalized request handed to an adapter by the router. */
export interface LLMRequest {
  taskType: LLMTaskType;
  modelId: string;
  messages: LLMMessage[];
  /** Output language constraint — every generation declares one. */
  outputLanguage: LocaleCode;
  temperature?: number;
  maxOutputTokens?: number;
  /** Require structured JSON output. */
  jsonMode?: boolean;
  timeoutMs?: number;
}

/** Normalized response returned by an adapter. */
export interface LLMResponse {
  modelId: string;
  provider: LLMProviderType;
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Provider-reported finish reason, normalized. */
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
}

/** Normalized error categories so the router can apply retry/fallback policy. */
export type LLMErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'invalid_request'
  | 'context_length'
  | 'server'
  | 'network'
  | 'unknown';

export class LLMError extends Error {
  constructor(
    public readonly kind: LLMErrorKind,
    message: string,
    public readonly provider: LLMProviderType,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/** Static descriptor every adapter advertises. */
export interface LLMAdapterInfo {
  provider: LLMProviderType;
  /** Whether the adapter has the credentials it needs to make real calls. */
  configured: boolean;
}

/**
 * Provider adapter contract. Each provider (OpenAI, Anthropic, Google, Mistral,
 * DeepSeek, OpenRouter, OpenAI-compatible, custom) implements this.
 */
export interface LLMProviderAdapter {
  readonly info: LLMAdapterInfo;
  /** Verify the connection/credentials without performing a generation. */
  testConnection(): Promise<{ ok: boolean; message: string }>;
  /** Perform a generation. Must throw LLMError on failure. */
  complete(request: LLMRequest): Promise<LLMResponse>;
  /** Optionally list models the provider exposes (e.g. OpenRouter catalog). */
  listModels?(): Promise<{ modelId: string; displayName: string }[]>;
}

/** Cost estimator contract — used before expensive actions to warn/confirm. */
export interface LLMCostEstimator {
  estimate(input: {
    taskType: LLMTaskType;
    modelId: string;
    fallbackModelId: string | null;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
  }): LLMCostEstimate;
}

/**
 * The router contract. Resolves a task to a model via routing rules, applies
 * retry/fallback, validates output, and records usage. Implemented in Session 5.
 */
export interface LLMRouter {
  resolveRule(taskType: LLMTaskType): LLMRoutingRule;
  run(request: LLMRequest): Promise<LLMResponse>;
}

/** Output validation contract (JSON shape / required sections / language). */
export interface LLMOutputValidator<T = unknown> {
  validate(raw: string, request: LLMRequest): { ok: true; value: T } | { ok: false; reason: string };
}
