import { describe, it, expect, vi } from 'vitest';
import {
  DefaultLLMRouter,
  LLMError,
  defaultRoutingRule,
  baseContract,
  validateOutput,
  ExponentialRetryPolicy,
  DefaultFallbackPolicy,
  CostLimitError,
  CatalogCostEstimator,
  type GenerationRequest,
  type AdapterProvider,
  type RuleResolver,
  type UsageSink,
  type LLMProviderAdapter,
  type LLMResponse,
} from './index.js';

function makeResponse(content: string): LLMResponse {
  return { modelId: 'm', provider: 'openai', content, inputTokens: 10, outputTokens: 20, latencyMs: 5, finishReason: 'stop' };
}

function fakeAdapter(impl: () => Promise<LLMResponse>): LLMProviderAdapter {
  return {
    info: { provider: 'openai', configured: true },
    testConnection: async () => ({ ok: true, message: 'ok' }),
    complete: impl,
  };
}

function deps(overrides: {
  adapter?: LLMProviderAdapter;
  adapterByModel?: (modelId: string) => LLMProviderAdapter;
  rule?: ReturnType<typeof defaultRoutingRule>;
  usage?: UsageSink;
}) {
  const ruleResolver: RuleResolver = {
    resolveRule: async () => overrides.rule ?? defaultRoutingRule('source_summarization'),
  };
  const adapterProvider: AdapterProvider = {
    forModel: async (modelId) => ({
      adapter: overrides.adapterByModel ? overrides.adapterByModel(modelId) : overrides.adapter!,
      provider: 'openai',
    }),
  };
  const usageSink: UsageSink = overrides.usage ?? { record: vi.fn().mockResolvedValue(undefined) };
  const costEstimator = new CatalogCostEstimator(() => ({ inputTokenPrice: 0.15, outputTokenPrice: 0.6, currency: 'USD' }));
  return { ruleResolver, adapterProvider, usageSink, costEstimator, retryPolicy: new ExponentialRetryPolicy(1, 1), fallbackPolicy: new DefaultFallbackPolicy() };
}

const request: GenerationRequest = {
  taskType: 'source_summarization',
  workspaceId: 'w1',
  contract: baseContract('en'),
  messages: [{ role: 'user', content: 'Summarize this.' }],
};

describe('DefaultLLMRouter', () => {
  it('runs the primary model and records usage', async () => {
    const usage = { record: vi.fn().mockResolvedValue(undefined) };
    const router = new DefaultLLMRouter(deps({ adapter: fakeAdapter(async () => makeResponse('done')), usage }));
    const result = await router.run(request);
    expect(result.content).toBe('done');
    expect(result.usedFallback).toBe(false);
    expect(usage.record).toHaveBeenCalledTimes(1);
    expect(usage.record.mock.calls[0]![0].status).toBe('success');
  });

  it('retries a transient error then succeeds', async () => {
    let calls = 0;
    const adapter = fakeAdapter(async () => {
      calls += 1;
      if (calls === 1) throw new LLMError('server', 'boom', 'openai', true);
      return makeResponse('ok-after-retry');
    });
    const router = new DefaultLLMRouter(deps({ adapter }));
    const result = await router.run(request);
    expect(result.content).toBe('ok-after-retry');
    expect(calls).toBe(2);
  });

  it('falls back to the secondary model when the primary fails', async () => {
    const rule = defaultRoutingRule('source_summarization'); // gpt-4o-mini → fallback gemini
    const router = new DefaultLLMRouter(
      deps({
        rule,
        adapterByModel: (modelId) =>
          modelId === rule.modelId
            ? fakeAdapter(async () => {
                throw new LLMError('rate_limit', 'slow down', 'openai', false);
              })
            : fakeAdapter(async () => makeResponse('from-fallback')),
      }),
    );
    const result = await router.run(request);
    expect(result.usedFallback).toBe(true);
    expect(result.content).toBe('from-fallback');
  });

  it('enforces the cost gate and records a failure', async () => {
    const usage = { record: vi.fn().mockResolvedValue(undefined) };
    const rule = { ...defaultRoutingRule('product_vision_generation'), maxCostPerTask: 0.0000001 };
    const router = new DefaultLLMRouter(deps({ rule, adapter: fakeAdapter(async () => makeResponse('x')), usage }));
    await expect(router.run(request)).rejects.toBeInstanceOf(CostLimitError);
    expect(usage.record.mock.calls[0]![0].errorCode).toBe('cost_limit');
  });

  it('does not fall back on a bad-prompt (invalid_request) error', async () => {
    let calls = 0;
    const adapter = fakeAdapter(async () => {
      calls += 1;
      throw new LLMError('invalid_request', 'bad', 'openai', false);
    });
    const router = new DefaultLLMRouter(deps({ adapter }));
    await expect(router.run(request)).rejects.toBeInstanceOf(LLMError);
    expect(calls).toBe(1); // no retry, no fallback
  });
});

describe('output validation', () => {
  it('flags empty output and bad JSON', () => {
    expect(validateOutput('', { contract: baseContract('en'), jsonRequired: false }).ok).toBe(false);
    expect(validateOutput('not json', { contract: baseContract('en'), jsonRequired: true }).ok).toBe(false);
    expect(validateOutput('{"a":1}', { contract: baseContract('en'), jsonRequired: true }).ok).toBe(true);
  });

  it('warns on output-language mismatch for non-latin locales', () => {
    const ru = { ...baseContract('ru'), outputLanguage: 'ru' as const };
    const outcome = validateOutput('This is English text', { contract: ru, jsonRequired: false });
    expect(outcome.issues.some((i) => i.code === 'output_language_mismatch')).toBe(true);
  });

  it('flags unsupported overconfident claims when evidence is required', () => {
    const c = { ...baseContract('en'), evidenceRequirement: 'required' as const, unsupportedClaimsPolicy: 'forbid' as const };
    const outcome = validateOutput('This is guaranteed to dominate the market.', { contract: c, jsonRequired: false });
    expect(outcome.ok).toBe(false);
    expect(outcome.issues.some((i) => i.code === 'unsupported_claims')).toBe(true);
  });
});
