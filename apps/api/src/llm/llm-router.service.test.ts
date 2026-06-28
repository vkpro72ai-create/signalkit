import { describe, it, expect, vi } from 'vitest';
import { LlmRouterService } from './llm-router.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CryptoService } from '../crypto/crypto.service';

function makePrisma(over: {
  settings?: unknown;
  connection?: unknown;
  usageCreate?: ReturnType<typeof vi.fn>;
}) {
  return {
    workspaceLLMSettings: { findUnique: vi.fn().mockResolvedValue(over.settings ?? null) },
    userLLMConnection: { findFirst: vi.fn().mockResolvedValue(over.connection ?? null) },
    lLMModel: { findFirst: vi.fn().mockResolvedValue(null) },
    lLMUsageLog: { create: over.usageCreate ?? vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
}

const crypto = { decrypt: vi.fn().mockReturnValue('decrypted-key'), encrypt: vi.fn(), mask: vi.fn() } as unknown as CryptoService;

describe('LlmRouterService', () => {
  it('estimates cost using the resolved rule and catalog prices', async () => {
    const svc = new LlmRouterService(makePrisma({}), crypto);
    const est = await svc.estimate('w1', 'source_summarization', 10_000, 2_000);
    // gpt-4o-mini seed prices: 0.15 / 0.6 per 1M.
    expect(est.estimatedCost).toBeCloseTo((10_000 / 1e6) * 0.15 + (2_000 / 1e6) * 0.6, 6);
    expect(est.highCostWarning).toBe(false);
  });

  it('records a failure to usage when no BYOK connection exists', async () => {
    const usageCreate = vi.fn().mockResolvedValue({});
    const svc = new LlmRouterService(makePrisma({ usageCreate }), crypto);
    await expect(
      svc.run({
        taskType: 'source_summarization',
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
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toBeTruthy();
    // Usage logged for the failed attempt (no connection → auth error, no fallback connection either).
    expect(usageCreate).toHaveBeenCalled();
    expect(usageCreate.mock.calls[0]![0].data.status).toBe('error');
  });
});
