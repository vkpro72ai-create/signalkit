import { Injectable } from '@nestjs/common';
import { STATIC_MODEL_CATALOG, SEED_CATALOG_SOURCE, createAdapter } from '@signalkit/llm';
import type { LLMProviderType } from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

type CatalogRow = Awaited<ReturnType<PrismaService['lLMModel']['findMany']>>[number];
type AdapterListedModel = {
  modelId: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
};
type RefreshSummary = {
  refreshed: number;
  byProvider: Record<string, number>;
  failures: Record<string, string>;
  message: string;
};

@Injectable()
export class LlmModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** List the model catalog. DB rows override the static seed, not replace it. */
  async list() {
    const rows = await this.prisma.lLMModel.findMany({ orderBy: [{ provider: 'asc' }, { displayName: 'asc' }] });
    return mergeCatalog(rows);
  }

  async get(id: string) {
    return this.prisma.lLMModel.findUnique({ where: { id } });
  }

  /**
   * Refresh the catalog from OpenRouter's public model list plus any live
   * provider catalogs available through stored workspace connections.
   */
  async refresh(workspaceId?: string): Promise<RefreshSummary> {
    const fetchedAt = new Date();
    const byProvider: Record<string, number> = {};
    const failures: Record<string, string> = {};
    let refreshed = 0;

    refreshed += await this.upsertSeedCatalog(fetchedAt);

    try {
      const count = await this.refreshProviderCatalog('openrouter', { provider: 'openrouter' }, fetchedAt);
      byProvider.openrouter = count;
      refreshed += count;
    } catch (err) {
      failures.openrouter = err instanceof Error ? err.message : 'refresh_unavailable';
    }

    if (!workspaceId) {
      return {
        refreshed,
        byProvider,
        failures,
        message: refreshed > 0 ? 'refreshed_seed_and_openrouter' : 'refresh_unavailable',
      };
    }

    const connections = await this.prisma.userLLMConnection.findMany({
      where: { workspaceId, status: 'active' },
      orderBy: [{ updatedAt: 'desc' }],
    });
    const seen = new Set<string>();
    for (const connection of connections) {
      const key = `${connection.provider}:${connection.baseUrl ?? ''}`;
      if (seen.has(key) || connection.provider === 'openrouter') {
        continue;
      }
      seen.add(key);
      try {
        const count = await this.refreshProviderCatalog(
          connection.provider as LLMProviderType,
          {
            provider: connection.provider as LLMProviderType,
            apiKey: this.crypto.decrypt(connection.encryptedKey),
            baseUrl: connection.baseUrl,
          },
          fetchedAt,
        );
        byProvider[connection.provider] = (byProvider[connection.provider] ?? 0) + count;
        refreshed += count;
      } catch (err) {
        failures[connection.provider] = err instanceof Error ? err.message : 'refresh_unavailable';
      }
    }

    return {
      refreshed,
      byProvider,
      failures,
      message: refreshed > 0 ? 'refreshed_openrouter_and_connections' : 'refresh_unavailable',
    };
  }

  /**
   * Return a benchmark result for a model. Persistence to a dedicated table is
   * deferred (no schema change this session); results are computed/echoed so the
   * UI speed-test action works against the live latency the caller measured.
   */
  benchmark(modelId: string, latencyMs: number) {
    return { modelId, taskType: 'critic_review' as const, latencyMs, ranAt: new Date().toISOString() };
  }

  private async upsertSeedCatalog(fetchedAt: Date) {
    for (const model of STATIC_MODEL_CATALOG) {
      await this.prisma.lLMModel.upsert({
        where: { provider_modelId: { provider: model.provider, modelId: model.modelId } },
        update: {
          displayName: model.displayName,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          inputTokenPrice: model.inputTokenPrice,
          outputTokenPrice: model.outputTokenPrice,
          currency: model.currency,
          pricingSource: model.pricingSource,
          pricingFetchedAt: fetchedAt,
          ratingOverall: model.ratingOverall,
          ratingReasoning: model.ratingReasoning,
          ratingResearch: model.ratingResearch,
          ratingDocumentWriting: model.ratingDocumentWriting,
          ratingMultilingual: model.ratingMultilingual,
          speedRating: model.speedRating,
          privacyRating: model.privacyRating,
          strengths: model.strengths,
          weaknesses: model.weaknesses,
          bestUseCases: model.bestUseCases,
          supportedLanguages: model.supportedLanguages,
          supportsJsonMode: model.supportsJsonMode,
          supportsTools: model.supportsTools,
          supportsVision: model.supportsVision,
          supportsReasoning: model.supportsReasoning,
        },
        create: {
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          inputTokenPrice: model.inputTokenPrice,
          outputTokenPrice: model.outputTokenPrice,
          currency: model.currency,
          pricingSource: model.pricingSource,
          pricingFetchedAt: fetchedAt,
          ratingOverall: model.ratingOverall,
          ratingReasoning: model.ratingReasoning,
          ratingResearch: model.ratingResearch,
          ratingDocumentWriting: model.ratingDocumentWriting,
          ratingMultilingual: model.ratingMultilingual,
          speedRating: model.speedRating,
          privacyRating: model.privacyRating,
          strengths: model.strengths,
          weaknesses: model.weaknesses,
          bestUseCases: model.bestUseCases,
          supportedLanguages: model.supportedLanguages,
          supportsJsonMode: model.supportsJsonMode,
          supportsTools: model.supportsTools,
          supportsVision: model.supportsVision,
          supportsReasoning: model.supportsReasoning,
        },
      });
    }
    return STATIC_MODEL_CATALOG.length;
  }

  private async refreshProviderCatalog(
    provider: LLMProviderType,
    config: { provider: LLMProviderType; apiKey?: string | null; baseUrl?: string | null },
    fetchedAt: Date,
  ) {
    const adapter = createAdapter(config);
    const models = (((await adapter.listModels?.()) ?? []) as AdapterListedModel[])
      .filter((model) => shouldKeepModel(provider, model.modelId))
      .slice(0, provider === 'openrouter' ? 500 : 250);
    let refreshed = 0;

    for (const model of models) {
      await this.prisma.lLMModel.upsert({
        where: { provider_modelId: { provider, modelId: model.modelId } },
        update: {
          displayName: model.displayName,
          pricingSource: provider,
          pricingFetchedAt: fetchedAt,
          ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
          ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
        },
        create: {
          provider,
          modelId: model.modelId,
          displayName: model.displayName,
          pricingSource: provider,
          pricingFetchedAt: fetchedAt,
          contextWindow: model.contextWindow ?? 0,
          maxOutputTokens: model.maxOutputTokens ?? 0,
        },
      });
      refreshed += 1;
    }

    return refreshed;
  }
}

function mergeCatalog(rows: CatalogRow[]) {
  const merged = new Map<string, CatalogRow | (typeof STATIC_MODEL_CATALOG)[number] & { id: string; pricingFetchedAt: null }>();

  for (const model of STATIC_MODEL_CATALOG) {
    merged.set(`${model.provider}:${model.modelId}`, {
      ...model,
      id: `seed:${model.provider}:${model.modelId}`,
      pricingFetchedAt: null,
      pricingSource: model.pricingSource ?? SEED_CATALOG_SOURCE,
    });
  }

  for (const row of rows) {
    merged.set(`${row.provider}:${row.modelId}`, row);
  }

  return [...merged.values()].sort((left, right) =>
    left.provider === right.provider
      ? left.displayName.localeCompare(right.displayName)
      : left.provider.localeCompare(right.provider),
  );
}

function shouldKeepModel(provider: LLMProviderType, modelId: string) {
  const normalized = modelId.toLowerCase();

  if (provider === 'openai') {
    return /^(gpt-|o1|o3|o4|chatgpt-)/.test(normalized);
  }
  if (provider === 'mistral') {
    return !normalized.includes('embed') && !normalized.includes('moderation');
  }
  if (provider === 'openai_compatible' || provider === 'custom') {
    return !normalized.includes('embedding') && !normalized.includes('tts') && !normalized.includes('whisper');
  }
  if (provider === 'openrouter') {
    return !normalized.includes('embedding') && !normalized.includes('moderation');
  }

  return true;
}
