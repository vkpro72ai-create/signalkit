import { Injectable } from '@nestjs/common';
import {
  DefaultLLMRouter,
  CatalogCostEstimator,
  createAdapter,
  defaultRoutingRule,
  LLMError,
  STATIC_MODEL_CATALOG,
  type AdapterContext,
  type GenerationRequest,
  type GenerationResult,
  type LLMProviderAdapter,
  type LLMUsageEntry,
  type ModelPrice,
} from '@signalkit/llm';
import type { LLMProviderType, LLMRoutingRule, LLMTaskType } from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

interface StoredRoutingRule {
  taskType: string;
  modelId: string;
  fallbackModelId?: string | null;
}

type ExplicitRoutingRequest = GenerationRequest & {
  modelId?: string;
  provider?: LLMProviderType;
};

// Live-tested against deepseek-v4-flash generating in Russian: a single rich
// step (7 documents + structured API/data-model fields) needed more than
// 28,000 output tokens. This is a safety ceiling per step, not a per-step
// target — individual step budgets (see product-pack-v2.steps.ts) stay well
// under it; it just must not become the new bottleneck.
const PRODUCT_PACK_TASK_MAX_OUTPUT_TOKENS = 60_000;
const PRODUCT_PACK_TASK_TIMEOUT_MS = 480_000;

/**
 * The single entry point for AI generation. Feature modules call `run()`; they
 * MUST NOT build adapters or call providers themselves (enforced by lint +
 * docs/AGENT_RULES.md). Backs the framework-agnostic DefaultLLMRouter with:
 *  - rule resolution from WorkspaceLLMSettings (+ task defaults),
 *  - adapter resolution from encrypted BYOK connections (decrypted here only),
 *  - usage logging to LLMUsageLog.
 */
@Injectable()
export class LlmRouterService {
  private readonly router: DefaultLLMRouter;
  private readonly priceByModel = new Map<string, ModelPrice>();
  private readonly providerByModel = new Map<string, LLMProviderType>();
  private readonly maxOutputTokensByModel = new Map<string, number>();
  private readonly costEstimator: CatalogCostEstimator;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {
    for (const m of STATIC_MODEL_CATALOG) {
      this.priceByModel.set(m.modelId, {
        inputTokenPrice: m.inputTokenPrice,
        outputTokenPrice: m.outputTokenPrice,
        currency: m.currency,
      });
      this.providerByModel.set(m.modelId, m.provider);
      if (typeof m.maxOutputTokens === 'number' && m.maxOutputTokens > 0) {
        this.maxOutputTokensByModel.set(m.modelId, m.maxOutputTokens);
      }
    }
    this.costEstimator = new CatalogCostEstimator((modelId) => this.priceByModel.get(modelId) ?? null);

    this.router = new DefaultLLMRouter({
      ruleResolver: { resolveRule: (task, ws) => this.resolveRule(task, ws) },
      adapterProvider: { forModel: (modelId, ctx) => this.forModel(modelId, ctx) },
      costEstimator: this.costEstimator,
      usageSink: { record: (entry) => this.recordUsage(entry) },
    });
  }

  /** Run a generation through the router. */
  run(request: GenerationRequest): Promise<GenerationResult> {
    const explicit = request as ExplicitRoutingRequest;
    const explicitModelId = explicit.modelId;
    if (explicitModelId) {
      return this.runWithModel(request, explicitModelId);
    }
    if (explicit.provider) {
      return this.runWithProvider(request, explicit.provider);
    }
    return this.router.run(request);
  }

  /** Run a generation against an explicitly selected model (e.g. smoke tests). */
  runWithModel(
    request: GenerationRequest,
    modelId: string,
    fallbackModelId: string | null = null,
  ): Promise<GenerationResult> {
    const router = new DefaultLLMRouter({
      ruleResolver: {
        resolveRule: async () =>
          this.withTaskRoutingOverrides({
            ...defaultRoutingRule(request.taskType),
            taskType: request.taskType,
            modelId,
            fallbackModelId,
          }),
      },
      adapterProvider: { forModel: (resolvedModelId, ctx) => this.forModel(resolvedModelId, ctx) },
      costEstimator: this.costEstimator,
      usageSink: { record: (entry) => this.recordUsage(entry) },
    });
    return router.run(request);
  }

  async resolveTaskOutputBudget(
    taskType: LLMTaskType,
    modelId: string,
    requestedOutputTokens: number,
  ): Promise<number> {
    const overrides = await this.resolveTaskRoutingOverrides(taskType, modelId);
    const taskCap = overrides.maxTokensPerTask ?? requestedOutputTokens;
    if (requestedOutputTokens <= 0) return taskCap;
    return Math.min(requestedOutputTokens, taskCap);
  }

  private async runWithProvider(
    request: GenerationRequest,
    provider: LLMProviderType,
  ): Promise<GenerationResult> {
    const modelId = await this.resolveProviderDefaultModel(provider);
    if (!modelId) {
      throw new LLMError(
        'invalid_request',
        `llm_model_not_configured: No known default model exists for provider ${provider}.`,
        provider,
        false,
      );
    }
    return this.runWithModel(request, modelId, defaultFallbackForResolvedModel(modelId));
  }

  /** Pre-flight cost estimate for the UI (before expensive actions). */
  async estimate(workspaceId: string, taskType: LLMTaskType, inputTokens: number, outputTokens: number) {
    const rule = await this.resolveRule(taskType, workspaceId);
    return this.costEstimator.estimate({
      taskType,
      modelId: rule.modelId,
      fallbackModelId: rule.fallbackModelId,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
    });
  }

  /** Resolve a task's routing rule: task-specific rule → workspace default → configured error. */
  private async resolveRule(taskType: LLMTaskType, workspaceId: string): Promise<LLMRoutingRule> {
    const settings = await this.prisma.workspaceLLMSettings.findUnique({ where: { workspaceId } });
    const base = defaultRoutingRule(taskType);
    const rules = Array.isArray(settings?.routingRules)
      ? (settings.routingRules as unknown as StoredRoutingRule[])
      : [];
    const taskRule = rules.find((r) => r.taskType === taskType);

    if (taskRule?.modelId) {
      return this.withTaskRoutingOverrides({
        ...base,
        taskType,
        modelId: taskRule.modelId,
        fallbackModelId: taskRule.fallbackModelId ?? settings?.fallbackModelId ?? null,
      });
    }

    if (settings?.defaultModelId) {
      return this.withTaskRoutingOverrides({
        ...base,
        taskType,
        modelId: settings.defaultModelId,
        fallbackModelId: settings.fallbackModelId ?? null,
      });
    }

    const activeConnections = await this.prisma.userLLMConnection.findMany({
      where: { workspaceId, status: 'active' },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (activeConnections.length === 0) {
      throw new LLMError(
        'invalid_request',
        `llm_missing_connection: No active AI provider connection configured for workspace ${workspaceId}.`,
        'openai',
        false,
      );
    }

    if (activeConnections.length > 1) {
      throw new LLMError(
        'invalid_request',
        'llm_model_not_configured: Multiple active AI provider connections exist. Please choose a default AI engine/model in workspace LLM settings.',
        'openai',
        false,
      );
    }

    const connection = activeConnections[0] as { provider: LLMProviderType; defaultModelId?: string | null };
    const provider = connection.provider;
    const providerModel = connection.defaultModelId ?? await this.resolveProviderDefaultModel(provider);
    if (!providerModel) {
      throw new LLMError(
        'invalid_request',
        `llm_model_not_configured: No known default model exists for provider ${provider}.`,
        provider,
        false,
      );
    }

    return this.withTaskRoutingOverrides({
      ...base,
      taskType,
      modelId: providerModel,
      fallbackModelId: defaultFallbackForResolvedModel(providerModel),
    });
  }

  private async withTaskRoutingOverrides(rule: LLMRoutingRule): Promise<LLMRoutingRule> {
    return {
      ...rule,
      ...(await this.resolveTaskRoutingOverrides(rule.taskType, rule.modelId)),
    };
  }

  private async resolveTaskRoutingOverrides(
    taskType: LLMTaskType,
    modelId: string,
  ): Promise<Partial<Pick<LLMRoutingRule, 'maxTokensPerTask' | 'timeoutMs' | 'retryCount'>>> {
    if (taskType !== 'product_vision_generation') {
      return {};
    }
    const modelMaxOutputTokens = await this.resolveModelMaxOutputTokens(modelId);
    return {
      maxTokensPerTask: modelMaxOutputTokens
        ? Math.min(modelMaxOutputTokens, PRODUCT_PACK_TASK_MAX_OUTPUT_TOKENS)
        : PRODUCT_PACK_TASK_MAX_OUTPUT_TOKENS,
      timeoutMs: PRODUCT_PACK_TASK_TIMEOUT_MS,
      retryCount: 0,
    };
  }

  private async providerForModel(modelId: string): Promise<LLMProviderType> {
    const cached = this.providerByModel.get(modelId);
    if (cached) return cached;
    const row = await this.prisma.lLMModel.findFirst({ where: { modelId }, select: { provider: true } });
    if (row?.provider) return row.provider as LLMProviderType;
    throw new LLMError(
      'invalid_request',
      `llm_model_not_found: Model ${modelId} is not registered in the catalog.`,
      'openai',
      false,
    );
  }

  private async resolveModelMaxOutputTokens(modelId: string): Promise<number | null> {
    const cached = this.maxOutputTokensByModel.get(modelId);
    if (typeof cached === 'number' && cached > 0) {
      return cached;
    }
    const row = await this.prisma.lLMModel.findFirst({
      where: { modelId },
      select: { maxOutputTokens: true },
    });
    if (typeof row?.maxOutputTokens === 'number' && row.maxOutputTokens > 0) {
      this.maxOutputTokensByModel.set(modelId, row.maxOutputTokens);
      return row.maxOutputTokens;
    }
    return null;
  }

  resolveProvider(modelId: string): Promise<LLMProviderType> {
    return this.providerForModel(modelId);
  }

  private async resolveProviderDefaultModel(provider: LLMProviderType): Promise<string | null> {
    const seedDefault = providerDefaultModel(provider);
    if (seedDefault) return seedDefault;

    const row = await this.prisma.lLMModel.findFirst({
      where: { provider },
      orderBy: [{ ratingOverall: 'desc' }, { displayName: 'asc' }],
      select: { modelId: true },
    });
    return row?.modelId ?? null;
  }

  /** Resolve a configured adapter for a model from BYOK connections. */
  private async forModel(
    modelId: string,
    ctx: AdapterContext,
  ): Promise<{ adapter: LLMProviderAdapter; provider: LLMProviderType }> {
    const provider = await this.providerForModel(modelId);
    // Prefer a user-scoped connection, then a workspace-level one.
    const conn = await this.prisma.userLLMConnection.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        provider,
        status: 'active',
        OR: [{ userId: ctx.userId ?? undefined }, { userId: null }],
      },
      orderBy: { userId: 'desc' }, // non-null (user) before null (workspace)
    });
    if (!conn) {
      throw new LLMError(
        'auth',
        `llm_missing_connection: No active ${provider} connection configured for workspace ${ctx.workspaceId}.`,
        provider,
        false,
      );
    }
    const apiKey = this.crypto.decrypt(conn.encryptedKey);
    return {
      adapter: createAdapter({ provider, apiKey, baseUrl: conn.baseUrl }),
      provider,
    };
  }

  private async recordUsage(entry: LLMUsageEntry): Promise<void> {
    await this.prisma.lLMUsageLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        projectId: entry.projectId,
        packId: entry.packId,
        documentId: entry.documentId,
        provider: entry.provider,
        model: entry.model,
        taskType: entry.taskType,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        estimatedCost: entry.estimatedCost,
        actualCost: entry.actualCost,
        latencyMs: entry.latencyMs,
        status: entry.status,
        errorCode: entry.errorCode,
      },
    });
  }
}

function providerDefaultModel(provider: LLMProviderType): string | null {
  switch (provider) {
    case 'deepseek':
      return 'deepseek-chat';
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-sonnet-4-6';
    case 'google':
      return 'gemini-2.0-flash';
    case 'mistral':
      return 'mistral-large-latest';
    default:
      return null;
  }
}

function defaultFallbackForResolvedModel(modelId: string): string {
  if (modelId === 'gpt-4o-mini') return 'gemini-2.0-flash';
  if (modelId === 'claude-sonnet-4-6') return 'gpt-4o';
  if (modelId === 'deepseek-chat') return 'gpt-4o-mini';
  if (modelId === 'gemini-2.0-flash') return 'gpt-4o-mini';
  if (modelId === 'mistral-large-latest') return 'gpt-4o-mini';
  return 'gpt-4o-mini';
}
