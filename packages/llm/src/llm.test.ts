import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  computeCost,
  estimateProductPackCost,
  CatalogCostEstimator,
  createAdapter,
  AdapterConfigError,
  STATIC_MODEL_CATALOG,
} from './index.js';

const KEY = 'a-sufficiently-long-encryption-key';

describe('@signalkit/llm crypto', () => {
  it('round-trips a secret and never reveals plaintext in the token', () => {
    const secret = 'sk-proj-SECRET-1234567890';
    const token = encryptSecret(secret, KEY);
    expect(token.startsWith('v1:')).toBe(true);
    expect(token).not.toContain(secret);
    expect(decryptSecret(token, KEY)).toBe(secret);
  });

  it('fails to decrypt with the wrong key (GCM auth)', () => {
    const token = encryptSecret('sk-abc', KEY);
    expect(() => decryptSecret(token, 'different-key-entirely')).toThrow();
  });

  it('rejects a too-short encryption key', () => {
    expect(() => encryptSecret('x', 'short')).toThrow();
  });

  it('masks secrets to a short prefix/suffix', () => {
    expect(maskSecret('sk-proj-ABCDEFGH1234')).toBe('sk-p…1234');
    expect(maskSecret('short')).toBe('••••');
  });
});

describe('@signalkit/llm cost', () => {
  it('computes per-1M-token cost', () => {
    expect(computeCost(1_000_000, 1_000_000, { inputTokenPrice: 2, outputTokenPrice: 8, currency: 'USD' })).toBe(10);
  });

  it('estimates a pack cost and flags high cost', () => {
    const est = estimateProductPackCost('m1', { inputTokenPrice: 3, outputTokenPrice: 15, currency: 'USD' }, 'build_ready');
    expect(est.estimatedInputTokens).toBeGreaterThan(0);
    expect(est.estimatedCost).toBeGreaterThan(0);
    expect(est.highCostWarning).toBe(true);
  });

  it('uses a catalog price lookup', () => {
    const est = new CatalogCostEstimator(() => ({ inputTokenPrice: 0.1, outputTokenPrice: 0.4, currency: 'USD' }));
    const out = est.estimate({
      taskType: 'source_summarization',
      modelId: 'cheap',
      fallbackModelId: null,
      estimatedInputTokens: 10_000,
      estimatedOutputTokens: 2_000,
    });
    expect(out.estimatedCost).toBeCloseTo(0.0018, 6);
    expect(out.highCostWarning).toBe(false);
  });
});

describe('@signalkit/llm adapters', () => {
  it('builds OpenAI-compatible adapters with sane defaults', () => {
    const a = createAdapter({ provider: 'openai', apiKey: 'sk-x' });
    expect(a.info.provider).toBe('openai');
    expect(a.info.configured).toBe(true);
  });

  it('reports not-configured when no key is present', () => {
    expect(createAdapter({ provider: 'deepseek' }).info.configured).toBe(false);
    expect(createAdapter({ provider: 'anthropic' }).info.configured).toBe(false);
    expect(createAdapter({ provider: 'google' }).info.configured).toBe(false);
  });

  it('requires a base URL for custom/compatible providers', () => {
    expect(() => createAdapter({ provider: 'custom', apiKey: 'k' })).toThrow(AdapterConfigError);
    expect(createAdapter({ provider: 'openai_compatible', apiKey: 'k', baseUrl: 'https://x/v1' }).info.provider).toBe(
      'openai_compatible',
    );
  });

  it('ships a non-empty static catalog with seed pricing source', () => {
    expect(STATIC_MODEL_CATALOG.length).toBeGreaterThan(3);
    for (const m of STATIC_MODEL_CATALOG) {
      expect(m.pricingSource).toBe('signalkit-seed');
      expect(m.inputTokenPrice).toBeGreaterThanOrEqual(0);
    }
  });
});
