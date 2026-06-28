import { Injectable } from '@nestjs/common';
import { STATIC_MODEL_CATALOG, createAdapter } from '@signalkit/llm';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LlmModelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List the model catalog. Falls back to the static seed if the DB is empty. */
  async list() {
    const rows = await this.prisma.lLMModel.findMany({ orderBy: [{ provider: 'asc' }, { displayName: 'asc' }] });
    if (rows.length > 0) return rows;
    // DB not seeded yet — surface the static catalog so cards still render.
    return STATIC_MODEL_CATALOG.map((m) => ({ ...m, id: `seed:${m.provider}:${m.modelId}`, pricingFetchedAt: null }));
  }

  async get(id: string) {
    return this.prisma.lLMModel.findUnique({ where: { id } });
  }

  /**
   * Refresh the catalog from OpenRouter's public model list. Gracefully no-ops
   * when the network/endpoint is unavailable (no fake data is written).
   */
  async refresh(): Promise<{ refreshed: number; message: string }> {
    try {
      const adapter = createAdapter({ provider: 'openrouter' });
      const models: { modelId: string; displayName: string }[] = (await adapter.listModels?.()) ?? [];
      let refreshed = 0;
      const fetchedAt = new Date();
      for (const m of models.slice(0, 200)) {
        await this.prisma.lLMModel.upsert({
          where: { provider_modelId: { provider: 'openrouter', modelId: m.modelId } },
          update: { displayName: m.displayName, pricingSource: 'openrouter', pricingFetchedAt: fetchedAt },
          create: {
            provider: 'openrouter',
            modelId: m.modelId,
            displayName: m.displayName,
            pricingSource: 'openrouter',
            pricingFetchedAt: fetchedAt,
          },
        });
        refreshed += 1;
      }
      return { refreshed, message: refreshed ? 'refreshed_from_openrouter' : 'no_models_returned' };
    } catch (err) {
      return { refreshed: 0, message: err instanceof Error ? err.message : 'refresh_unavailable' };
    }
  }

  /**
   * Return a benchmark result for a model. Persistence to a dedicated table is
   * deferred (no schema change this session); results are computed/echoed so the
   * UI speed-test action works against the live latency the caller measured.
   */
  benchmark(modelId: string, latencyMs: number) {
    return { modelId, taskType: 'critic_review' as const, latencyMs, ranAt: new Date().toISOString() };
  }
}
