/**
 * The LLM router — the single orchestration point for every AI task.
 *
 * Flow: resolve routing rule → pre-flight cost estimate (+ cost gate) → call the
 * provider adapter with retry → fall back to the secondary model on failure →
 * validate the output → record usage. Feature modules NEVER call adapters
 * directly; they build a GenerationRequest and call `router.run()`.
 */
import type {
  LLMCostEstimate,
  LLMProviderType,
  LLMRoutingRule,
  LLMTaskType,
} from '@signalkit/shared';
import {
  LLMError,
  type LLMCostEstimator,
  type LLMProviderAdapter,
  type LLMRequest,
  type LLMResponse,
} from './index.js';
import type { GenerationRequest, GenerationResult } from './contract.js';
import { validateOutput } from './validators.js';
import {
  DefaultFallbackPolicy,
  ExponentialRetryPolicy,
  CostLimitError,
  type FallbackPolicy,
  type RetryPolicy,
} from './policies.js';

/** Resolves the routing rule for a task in a workspace. */
export interface RuleResolver {
  resolveRule(taskType: LLMTaskType, workspaceId: string): Promise<LLMRoutingRule>;
}

/** Resolves a configured adapter for a model in a workspace context. */
export interface AdapterContext {
  workspaceId: string;
  userId?: string | null;
}
export interface AdapterProvider {
  forModel(
    modelId: string,
    ctx: AdapterContext,
  ): Promise<{ adapter: LLMProviderAdapter; provider: LLMProviderType }>;
}

/** A usage record written for every attempt (success or failure). */
export interface LLMUsageEntry {
  workspaceId: string;
  userId: string | null;
  projectId: string | null;
  packId: string | null;
  documentId: string | null;
  provider: string;
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
export interface UsageSink {
  record(entry: LLMUsageEntry): Promise<void>;
}

export interface RouterDeps {
  ruleResolver: RuleResolver;
  adapterProvider: AdapterProvider;
  costEstimator: LLMCostEstimator;
  usageSink: UsageSink;
  retryPolicy?: RetryPolicy;
  fallbackPolicy?: FallbackPolicy;
}

/** Rough token estimate from text length (≈4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class DefaultLLMRouter {
  private readonly retry: RetryPolicy;
  private readonly fallback: FallbackPolicy;

  constructor(private readonly deps: RouterDeps) {
    this.retry = deps.retryPolicy ?? new ExponentialRetryPolicy();
    this.fallback = deps.fallbackPolicy ?? new DefaultFallbackPolicy();
  }

  async run(request: GenerationRequest): Promise<GenerationResult> {
    const rule = await this.deps.ruleResolver.resolveRule(request.taskType, request.workspaceId);

    const estimatedInputTokens = request.messages.reduce((n, m) => n + estimateTokens(m.content), 0);
    const estimatedOutputTokens = request.estimatedOutputTokens ?? rule.maxTokensPerTask ?? 1500;
    const estimate = this.deps.costEstimator.estimate({
      taskType: request.taskType,
      modelId: rule.modelId,
      fallbackModelId: rule.fallbackModelId,
      estimatedInputTokens,
      estimatedOutputTokens,
    });

    // Cost gate.
    if (rule.maxCostPerTask != null && estimate.estimatedCost > rule.maxCostPerTask) {
      await this.recordFailure(request, rule.modelId, 'unknown', estimatedInputTokens, estimate, 'cost_limit');
      throw new CostLimitError(estimate.estimatedCost, rule.maxCostPerTask);
    }

    const llmRequest: Omit<LLMRequest, 'modelId'> = {
      taskType: request.taskType,
      messages: request.messages,
      outputLanguage: request.contract.outputLanguage,
      maxOutputTokens: rule.maxTokensPerTask ?? undefined,
      jsonMode: rule.jsonRequired || request.jsonMode === true,
      timeoutMs: rule.timeoutMs,
    };

    // Primary model, then fallback.
    let lastError: LLMError | null = null;
    for (const [modelId, isFallback] of this.modelSequence(rule)) {
      try {
        const { response, provider } = await this.attemptModel(modelId, request, llmRequest);
        const validation = validateOutput(response.content, {
          contract: request.contract,
          jsonRequired: llmRequest.jsonMode === true,
        });
        await this.deps.usageSink.record(
          this.entry(request, modelId, provider, response, estimate.estimatedCost, 'success', null),
        );
        return {
          content: response.content,
          taskType: request.taskType,
          modelId,
          provider,
          usedFallback: isFallback,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          latencyMs: response.latencyMs,
          estimatedCost: estimate.estimatedCost,
          validation,
        };
      } catch (err) {
        lastError = err instanceof LLMError ? err : new LLMError('unknown', String(err), 'custom', false);
        if (!isFallback && !this.fallback.shouldFallback(lastError)) break;
      }
    }

    await this.recordFailure(
      request,
      rule.modelId,
      'unknown',
      estimatedInputTokens,
      estimate,
      lastError?.kind ?? 'unknown',
    );
    throw lastError ?? new LLMError('unknown', 'generation failed', 'custom', false);
  }

  /** Yields [modelId, isFallback] — primary first, then distinct fallback. */
  private modelSequence(rule: LLMRoutingRule): [string, boolean][] {
    const seq: [string, boolean][] = [[rule.modelId, false]];
    if (rule.fallbackModelId && rule.fallbackModelId !== rule.modelId) {
      seq.push([rule.fallbackModelId, true]);
    }
    return seq;
  }

  /** Run one model with the retry policy. Throws the last LLMError on exhaustion. */
  private async attemptModel(
    modelId: string,
    request: GenerationRequest,
    base: Omit<LLMRequest, 'modelId'>,
  ): Promise<{ response: LLMResponse; provider: LLMProviderType }> {
    const { adapter, provider } = await this.deps.adapterProvider.forModel(modelId, {
      workspaceId: request.workspaceId,
      userId: request.userId ?? null,
    });
    let attempt = 0;
    for (;;) {
      try {
        const response = await adapter.complete({ ...base, modelId });
        return { response, provider };
      } catch (err) {
        const error = err instanceof LLMError ? err : new LLMError('unknown', String(err), provider, false);
        if (this.retry.shouldRetry(error, attempt)) {
          await sleep(this.retry.delayMs(attempt));
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private entry(
    request: GenerationRequest,
    model: string,
    provider: string,
    response: LLMResponse | null,
    estimatedCost: number,
    status: LLMUsageEntry['status'],
    errorCode: string | null,
  ): LLMUsageEntry {
    return {
      workspaceId: request.workspaceId,
      userId: request.userId ?? null,
      projectId: request.projectId ?? null,
      packId: request.packId ?? null,
      documentId: request.documentId ?? null,
      provider,
      model,
      taskType: request.taskType,
      inputTokens: response?.inputTokens ?? 0,
      outputTokens: response?.outputTokens ?? 0,
      estimatedCost,
      actualCost: null,
      latencyMs: response?.latencyMs ?? 0,
      status,
      errorCode,
    };
  }

  private recordFailure(
    request: GenerationRequest,
    model: string,
    provider: string,
    _inputTokens: number,
    estimate: LLMCostEstimate,
    errorCode: string,
  ): Promise<void> {
    return this.deps.usageSink.record(
      this.entry(request, model, provider, null, estimate.estimatedCost, 'error', errorCode),
    );
  }
}

/** The router contract feature modules depend on. */
export interface LLMRouter {
  run(request: GenerationRequest): Promise<GenerationResult>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
