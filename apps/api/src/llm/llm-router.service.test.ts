import { describe, it, expect, vi } from 'vitest';
import { LlmRouterService } from './llm-router.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CryptoService } from '../crypto/crypto.service';

function makePrisma(over: {
  settings?: unknown;
  connections?: unknown[];
  usageCreate?: ReturnType<typeof vi.fn>;
  modelFindFirst?: ReturnType<typeof vi.fn>;
}) {
  return {
    workspaceLLMSettings: { findUnique: vi.fn().mockResolvedValue(over.settings ?? null) },
    userLLMConnection: {
      findFirst: vi.fn().mockResolvedValue(over.connections?.[0] ?? null),
      findMany: vi.fn().mockResolvedValue(over.connections ?? []),
    },
    lLMModel: { findFirst: over.modelFindFirst ?? vi.fn().mockResolvedValue(null) },
    lLMUsageLog: { create: over.usageCreate ?? vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
}

const crypto = { decrypt: vi.fn().mockReturnValue('decrypted-key'), encrypt: vi.fn(), mask: vi.fn() } as unknown as CryptoService;

function makeRunRequest() {
  return {
    taskType: 'source_summarization' as const,
    workspaceId: 'w1',
    contract: {
      interfaceLanguage: 'en',
      outputLanguage: 'en',
      marketLanguage: 'en',
      targetCountry: null,
      targetRegion: null,
      evidenceRequirement: 'preferred',
      unsupportedClaimsPolicy: 'mark_as_assumption',
    },
    messages: [{ role: 'user' as const, content: 'hi' }],
  };
}

describe('LlmRouterService', () => {
  it('estimates cost using the resolved rule and catalog prices', async () => {
    const svc = new LlmRouterService(
      makePrisma({ settings: { defaultModelId: 'gpt-4o-mini', fallbackModelId: null, routingRules: [] } }),
      crypto,
    );
    const est = await svc.estimate('w1', 'source_summarization', 10_000, 2_000);
    // gpt-4o-mini seed prices: 0.15 / 0.6 per 1M.
    expect(est.estimatedCost).toBeCloseTo((10_000 / 1e6) * 0.15 + (2_000 / 1e6) * 0.6, 6);
    expect(est.highCostWarning).toBe(false);
  });

  it('records a failure to usage when no BYOK connection exists', async () => {
    const usageCreate = vi.fn().mockResolvedValue({});
    const svc = new LlmRouterService(
      makePrisma({
        settings: { defaultModelId: 'gpt-4o-mini', fallbackModelId: null, routingRules: [] },
        usageCreate,
      }),
      crypto,
    );
    await expect(svc.run(makeRunRequest())).rejects.toBeTruthy();
    // Usage logged for the failed attempt (no connection → auth error, no fallback connection either).
    expect(usageCreate).toHaveBeenCalled();
    expect(usageCreate.mock.calls[0]![0].data.status).toBe('error');
  });

  it('resolves deepseek-chat when DeepSeek is the only active connection and no default model is set', async () => {
    const svc = new LlmRouterService(
      makePrisma({
        settings: { defaultModelId: null, fallbackModelId: null, routingRules: [] },
        connections: [{ provider: 'deepseek', status: 'active', createdAt: new Date() }],
      }),
      crypto,
    );
    const est = await svc.estimate('w1', 'source_summarization', 1000, 1000);
    expect(est.modelId).toBe('deepseek-chat');
  });

  it('uses the active connection default model before provider fallback', async () => {
    const svc = new LlmRouterService(
      makePrisma({
        settings: { defaultModelId: null, fallbackModelId: null, routingRules: [] },
        connections: [{ provider: 'deepseek', defaultModelId: 'deepseek-reasoner', status: 'active', createdAt: new Date() }],
      }),
      crypto,
    );
    const est = await svc.estimate('w1', 'source_summarization', 1000, 1000);
    expect(est.modelId).toBe('deepseek-reasoner');
  });

  it('throws llm_missing_connection when no active connection exists', async () => {
    const svc = new LlmRouterService(makePrisma({ settings: null, connections: [] }), crypto);
    await expect(svc.run(makeRunRequest())).rejects.toMatchObject({
      message: expect.stringContaining('llm_missing_connection'),
    });
  });

  it('throws llm_model_not_found for unknown models', async () => {
    const svc = new LlmRouterService(makePrisma({}), crypto);
    await expect(svc.resolveProvider('not-a-real-model')).rejects.toMatchObject({
      message: expect.stringContaining('llm_model_not_found'),
    });
  });

  it('throws llm_missing_connection when the provider connection is missing', async () => {
    const svc = new LlmRouterService(
      makePrisma({
        settings: { defaultModelId: 'gpt-4o-mini', fallbackModelId: null, routingRules: [] },
        connections: [],
      }),
      crypto,
    );
    await expect(svc.run(makeRunRequest())).rejects.toMatchObject({
      message: expect.stringContaining('llm_missing_connection'),
    });
  });

  it('asks to choose a default AI engine when multiple active connections exist', async () => {
    const svc = new LlmRouterService(
      makePrisma({
        settings: { defaultModelId: null, fallbackModelId: null, routingRules: [] },
        connections: [
          { provider: 'deepseek', status: 'active', createdAt: new Date('2026-01-01') },
          { provider: 'openai', status: 'active', createdAt: new Date('2026-01-02') },
        ],
      }),
      crypto,
    );
    await expect(svc.estimate('w1', 'source_summarization', 1000, 1000)).rejects.toMatchObject({
      message: expect.stringContaining('choose a default AI engine'),
    });
  });

  it('uses the configured workspace default model', async () => {
    const svc = new LlmRouterService(
      makePrisma({ settings: { defaultModelId: 'gpt-4o-mini', fallbackModelId: null, routingRules: [] } }),
      crypto,
    );
    const rule = await (
      svc as unknown as {
        resolveRule: (taskType: string, workspaceId: string) => Promise<{ modelId: string }>;
      }
    ).resolveRule('source_summarization', 'w1');
    expect(rule.modelId).toBe('gpt-4o-mini');
  });

  it('uses a product-pack-specific output cap instead of the generic 16000 when model metadata allows it', async () => {
    const svc = new LlmRouterService(
      makePrisma({
        settings: { defaultModelId: 'deepseek-v4-pro', fallbackModelId: null, routingRules: [] },
        modelFindFirst: vi.fn().mockResolvedValue({ maxOutputTokens: 64_000 }),
      }),
      crypto,
    );
    const rule = await (
      svc as unknown as {
        resolveRule: (taskType: string, workspaceId: string) => Promise<{ maxTokensPerTask: number; timeoutMs: number }>;
      }
    ).resolveRule('product_vision_generation', 'w1');
    expect(rule.maxTokensPerTask).toBe(60_000);
    expect(rule.timeoutMs).toBe(480_000);
  });

  it('falls back to the product-pack default output cap when model metadata is missing', async () => {
    const svc = new LlmRouterService(
      makePrisma({
        settings: { defaultModelId: 'deepseek-v4-pro', fallbackModelId: null, routingRules: [] },
        modelFindFirst: vi.fn().mockResolvedValue(null),
      }),
      crypto,
    );
    const rule = await (
      svc as unknown as {
        resolveRule: (taskType: string, workspaceId: string) => Promise<{ maxTokensPerTask: number }>;
      }
    ).resolveRule('product_vision_generation', 'w1');
    expect(rule.maxTokensPerTask).toBe(60_000);
  });

  it('clamps requested product-pack output budget to the resolved model limit', async () => {
    const svc = new LlmRouterService(
      makePrisma({
        modelFindFirst: vi.fn().mockResolvedValue({ maxOutputTokens: 32_000 }),
      }),
      crypto,
    );
    const budget = await svc.resolveTaskOutputBudget('product_vision_generation', 'deepseek-v4-pro', 48_000);
    expect(budget).toBe(32_000);
  });
});
