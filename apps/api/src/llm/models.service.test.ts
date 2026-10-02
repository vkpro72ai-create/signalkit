import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LlmModelsService } from './models.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CryptoService } from '../crypto/crypto.service';

const mockCreateAdapter = vi.fn();

vi.mock('@signalkit/llm', async () => {
  const actual = await vi.importActual<typeof import('@signalkit/llm')>('@signalkit/llm');
  return {
    ...actual,
    createAdapter: (...args: Parameters<typeof actual.createAdapter>) => mockCreateAdapter(...args),
  };
});

function makePrisma(overrides?: {
  rows?: Array<Record<string, unknown>>;
  connections?: Array<Record<string, unknown>>;
}) {
  return {
    lLMModel: {
      findMany: vi.fn().mockResolvedValue(overrides?.rows ?? []),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    userLLMConnection: {
      findMany: vi.fn().mockResolvedValue(overrides?.connections ?? []),
    },
  } as unknown as PrismaService;
}

const crypto = {
  decrypt: vi.fn().mockReturnValue('decrypted-key'),
} as unknown as CryptoService;

describe('LlmModelsService', () => {
  beforeEach(() => {
    mockCreateAdapter.mockReset();
    vi.mocked(crypto.decrypt).mockClear();
  });

  it('merges static catalog with partial DB rows', async () => {
    const prisma = makePrisma({
      rows: [
        {
          id: 'db-openrouter',
          provider: 'openrouter',
          modelId: 'openrouter/sonoma',
          displayName: 'OpenRouter Sonoma',
          contextWindow: 200000,
          maxOutputTokens: 8192,
          inputTokenPrice: 0,
          outputTokenPrice: 0,
          currency: 'USD',
          pricingSource: 'openrouter',
          pricingFetchedAt: new Date(),
          ratingOverall: null,
          speedRating: null,
          privacyRating: null,
          strengths: [],
          weaknesses: [],
          bestUseCases: [],
          supportedLanguages: [],
        },
      ],
    });
    const service = new LlmModelsService(prisma, crypto);

    const rows = await service.list();

    expect(rows.some((row) => row.provider === 'openrouter' && row.modelId === 'openrouter/sonoma')).toBe(true);
    expect(rows.some((row) => row.provider === 'deepseek' && row.modelId === 'deepseek-chat')).toBe(true);
    expect(rows.some((row) => row.provider === 'openai' && row.modelId === 'gpt-4o')).toBe(true);
  });

  it('refreshes openrouter and connected provider catalogs', async () => {
    const prisma = makePrisma({
      connections: [
        {
          provider: 'deepseek',
          encryptedKey: 'ciphertext',
          baseUrl: 'https://api.deepseek.com/v1',
          updatedAt: new Date(),
        },
      ],
    });
    mockCreateAdapter
      .mockReturnValueOnce({
        listModels: vi.fn().mockResolvedValue([{ modelId: 'openrouter/sonoma', displayName: 'Sonoma' }]),
      })
      .mockReturnValueOnce({
        listModels: vi.fn().mockResolvedValue([{ modelId: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner' }]),
      });

    const service = new LlmModelsService(prisma, crypto);
    const result = await service.refresh('ws-1');

    expect(result.byProvider.openrouter).toBe(1);
    expect(result.byProvider.deepseek).toBe(1);
    expect(result.refreshed).toBeGreaterThan(2);
    expect(vi.mocked(crypto.decrypt)).toHaveBeenCalledWith('ciphertext');
  });
});
