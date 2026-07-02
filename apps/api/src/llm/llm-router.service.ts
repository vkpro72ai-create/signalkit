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
    return this.router.run(request);
  }

  /** Run a generation against an explicitly selected model (e.g. smoke tests). */
  runWithModel(
    request: GenerationRequest,
    modelId: string,
    fallbackModelId: string | null = null,
  ): Promise<GenerationResult> {
    const baseRule = defaultRoutingRule(request.taskType);
    const router = new DefaultLLMRouter({
      ruleResolver: {
        resolveRule: async () => ({
          ...baseRule,
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
      return {
        ...base,
        taskType,
        modelId: taskRule.modelId,
        fallbackModelId: taskRule.fallbackModelId ?? settings?.fallbackModelId ?? null,
      };
    }

    if (settings?.defaultModelId) {
      return {
        ...base,
        taskType,
        modelId: settings.defaultModelId,
        fallbackModelId: settings.fallbackModelId ?? null,
      };
    }

    throw new LLMError(
      'invalid_request',
      `llm_model_not_configured: No model configured for task ${taskType} in workspace ${workspaceId}.`,
      'openai',
      false,
    );
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

  resolveProvider(modelId: string): Promise<LLMProviderType> {
    return this.providerForModel(modelId);
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
