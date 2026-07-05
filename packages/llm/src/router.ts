/**
 * The LLM router — the single orchestration point for every AI task.
 *
 * Flow: resolve routing rule → pre-flight cost estimate (+ cost gate) → call the
 * provider adapter with retry → fall back to the secondary model on failure →
 * validate the output → record usage. Feature modules NEVER call adapters
 * directly; they build a GenerationRequest and call `router.run()`.
 */
import {
  LOCALE_LANGUAGE_NAMES,
  type LLMCostEstimate,
  type LLMProviderType,
  type LLMRoutingRule,
  type LLMTaskType,
  type LocaleCode,
} from '@signalkit/shared';
import {
  LLMError,
  type LLMCostEstimator,
  type LLMMessage,
  type LLMProviderAdapter,
  type LLMRequest,
  type LLMResponse,
} from './index.js';
import type { GenerationRequest, GenerationResult, ValidationOutcome } from './contract.js';
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

    // A caller-supplied estimatedOutputTokens narrows the task-level ceiling
    // (rule.maxTokensPerTask) down for THIS call — e.g. a multi-step pipeline
    // asking for a small, focused response instead of the full task budget.
    // It can only shrink the cap, never exceed the task's configured ceiling.
    const maxOutputTokens =
      request.estimatedOutputTokens != null && rule.maxTokensPerTask != null
        ? Math.min(request.estimatedOutputTokens, rule.maxTokensPerTask)
        : (request.estimatedOutputTokens ?? rule.maxTokensPerTask ?? undefined);

    const llmRequest: Omit<LLMRequest, 'modelId'> = {
      taskType: request.taskType,
      messages: [...request.messages, buildLanguageDirective(request.contract.outputLanguage)],
      outputLanguage: request.contract.outputLanguage,
      maxOutputTokens,
      jsonMode: rule.jsonRequired || request.jsonMode === true,
      timeoutMs: request.timeoutMs ?? rule.timeoutMs,
    };

    // Primary model, then fallback.
    let lastError: LLMError | null = null;
    for (const [modelId, isFallback] of this.modelSequence(rule)) {
      try {
        const { response, provider } = await this.attemptModel(modelId, request, llmRequest);
        let finalResponse = response;
        let validation = validateOutput(finalResponse.content, {
          contract: request.contract,
          jsonRequired: llmRequest.jsonMode === true,
        });
        await this.deps.usageSink.record(
          this.entry(request, modelId, provider, finalResponse, estimate.estimatedCost, 'success', null),
        );

        if (validation.issues.some((i) => i.code === 'output_language_mismatch')) {
          const corrected = await this.tryLanguageCorrection(modelId, request, llmRequest, finalResponse);
          if (corrected) {
            await this.deps.usageSink.record(
              this.entry(request, modelId, provider, corrected.response, estimate.estimatedCost, 'success', null),
            );
            finalResponse = corrected.response;
            validation = corrected.validation;
          }
        }

        return {
          content: finalResponse.content,
          taskType: request.taskType,
          modelId,
          provider,
          usedFallback: isFallback,
          inputTokens: finalResponse.inputTokens,
          outputTokens: finalResponse.outputTokens,
          latencyMs: finalResponse.latencyMs,
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

  /**
   * One bounded retry when the model answered in the wrong language: replay
   * the same conversation plus the bad answer and ask for a full rewrite.
   * Never throws — a failed correction just falls back to the original
   * (already-recorded) response, since a language miss shouldn't block
   * generation outright.
   */
  private async tryLanguageCorrection(
    modelId: string,
    request: GenerationRequest,
    base: Omit<LLMRequest, 'modelId'>,
    badResponse: LLMResponse,
  ): Promise<{ response: LLMResponse; validation: ValidationOutcome } | null> {
    const correctionMessages: LLMMessage[] = [
      ...base.messages,
      { role: 'assistant', content: badResponse.content },
      buildLanguageCorrection(request.contract.outputLanguage),
    ];
    try {
      const { response } = await this.attemptModel(modelId, request, { ...base, messages: correctionMessages });
      const validation = validateOutput(response.content, {
        contract: request.contract,
        jsonRequired: base.jsonMode === true,
      });
      return { response, validation };
    } catch {
      return null;
    }
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

/**
 * A dedicated, unmissable system message forcing the output language. This is
 * appended last (after every task-specific prompt) since models weight recent
 * instructions more heavily, and it is the only place in the pipeline that
 * turns `outputLanguage` into an actual instruction the model receives —
 * adapters never read that field themselves.
 */
function buildLanguageDirective(outputLanguage: LocaleCode): LLMMessage {
  const languageName = LOCALE_LANGUAGE_NAMES[outputLanguage] ?? outputLanguage;
  return {
    role: 'system',
    content: `LANGUAGE REQUIREMENT (overrides all other instructions): Write the ENTIRE response — every heading, label, sentence, and example — in ${languageName} (${outputLanguage}) only, using natural, fluent ${languageName}. Do not switch to English or any other language at any point, including for section titles or short labels, unless the requested language is English.`,
  };
}

/** Corrective follow-up used once when validation detects the wrong language. */
function buildLanguageCorrection(outputLanguage: LocaleCode): LLMMessage {
  const languageName = LOCALE_LANGUAGE_NAMES[outputLanguage] ?? outputLanguage;
  return {
    role: 'user',
    content: `Your previous answer was not fully written in ${languageName}. Rewrite your entire previous response fully in ${languageName}, keeping exactly the same structure, meaning, and format (including the JSON schema if one was requested).`,
  };
}
