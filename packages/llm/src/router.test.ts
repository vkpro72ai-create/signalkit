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
  type LLMRequest,
  type LLMMessage,
  type LLMResponse,
} from './index.js';

function makeResponse(content: string): LLMResponse {
  return { modelId: 'm', provider: 'openai', content, inputTokens: 10, outputTokens: 20, latencyMs: 5, finishReason: 'stop' };
}

function fakeAdapter(impl: (request: LLMRequest) => Promise<LLMResponse>): LLMProviderAdapter {
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

  it('narrows maxOutputTokens to a smaller caller-supplied estimatedOutputTokens instead of always using the task-level ceiling', async () => {
    // Regression: a multi-step pipeline asking for a small, focused response
    // (e.g. one section of a larger document) was silently getting the full
    // task-level ceiling instead, letting the model write far more than
    // budgeted and truncate mid-JSON.
    const rule = { ...defaultRoutingRule('product_vision_generation'), maxTokensPerTask: 20_000 };
    let seenMaxOutputTokens: number | undefined;
    const adapter = fakeAdapter(async (req) => {
      seenMaxOutputTokens = req.maxOutputTokens;
      return makeResponse('ok');
    });
    const router = new DefaultLLMRouter(deps({ rule, adapter }));

    await router.run({ ...request, estimatedOutputTokens: 5_000 });

    expect(seenMaxOutputTokens).toBe(5_000);
  });

  it('never lets a caller-supplied estimatedOutputTokens exceed the task-level ceiling', async () => {
    const rule = { ...defaultRoutingRule('product_vision_generation'), maxTokensPerTask: 20_000 };
    let seenMaxOutputTokens: number | undefined;
    const adapter = fakeAdapter(async (req) => {
      seenMaxOutputTokens = req.maxOutputTokens;
      return makeResponse('ok');
    });
    const router = new DefaultLLMRouter(deps({ rule, adapter }));

    await router.run({ ...request, estimatedOutputTokens: 50_000 });

    expect(seenMaxOutputTokens).toBe(20_000);
  });
});

describe('output language enforcement', () => {
  const esRequest: GenerationRequest = {
    ...request,
    contract: { ...baseContract('es'), outputLanguage: 'es' },
  };

  it('appends an unmissable language-directive system message naming the target language', async () => {
    const seenMessages: LLMMessage[][] = [];
    const adapter = fakeAdapter(async (req) => {
      seenMessages.push(req.messages);
      return makeResponse('Este es un texto en español sobre la visión del producto y por qué ahora es el momento adecuado.');
    });
    const router = new DefaultLLMRouter(deps({ adapter }));
    await router.run(esRequest);

    const directive = seenMessages[0]!.find((m) => m.role === 'system' && m.content.includes('LANGUAGE REQUIREMENT'));
    expect(directive?.content).toContain('Spanish');
  });

  it('retries once with a corrective message when the model answers in the wrong language, and keeps the corrected answer', async () => {
    let callCount = 0;
    const seenMessages: LLMMessage[][] = [];
    const adapter = fakeAdapter(async (req) => {
      callCount += 1;
      seenMessages.push(req.messages);
      if (callCount === 1) {
        return makeResponse(
          'This is a long English answer even though Spanish was requested, long enough to be confidently detected as English.',
        );
      }
      return makeResponse('Este es un texto en español que corrige correctamente la respuesta anterior sobre el producto.');
    });
    const usage = { record: vi.fn().mockResolvedValue(undefined) };
    const router = new DefaultLLMRouter(deps({ adapter, usage }));
    const result = await router.run(esRequest);

    expect(callCount).toBe(2);
    expect(result.content).toContain('español');
    expect(result.validation.issues.some((i) => i.code === 'output_language_mismatch')).toBe(false);
    // Both the wrong-language attempt and the correction are recorded for cost accuracy.
    expect(usage.record.mock.calls.filter((c) => c[0].status === 'success')).toHaveLength(2);

    const correction = seenMessages[1]!.find((m) => m.role === 'user' && m.content.includes('Rewrite'));
    expect(correction).toBeDefined();
    const replayedBadAnswer = seenMessages[1]!.find((m) => m.role === 'assistant');
    expect(replayedBadAnswer?.content).toContain('long English answer');
  });

  it('falls back to the original response when the correction retry also fails validation', async () => {
    let callCount = 0;
    const adapter = fakeAdapter(async () => {
      callCount += 1;
      return makeResponse('Still English on every attempt, long enough for confident language detection to catch it every time.');
    });
    const router = new DefaultLLMRouter(deps({ adapter }));
    const result = await router.run(esRequest);

    expect(callCount).toBe(2);
    expect(result.content).toContain('Still English');
    expect(result.validation.issues.some((i) => i.code === 'output_language_mismatch')).toBe(true);
  });
});

describe('output validation', () => {
  it('flags empty output and bad JSON', () => {
    expect(validateOutput('', { contract: baseContract('en'), jsonRequired: false }).ok).toBe(false);
    expect(validateOutput('not json', { contract: baseContract('en'), jsonRequired: true }).ok).toBe(false);
    expect(validateOutput('{"a":1}', { contract: baseContract('en'), jsonRequired: true }).ok).toBe(true);
  });

  it('fails on output-language mismatch for a non-latin locale (Russian)', () => {
    const ru = { ...baseContract('ru'), outputLanguage: 'ru' as const };
    const outcome = validateOutput(
      'This is a fairly long piece of English text that should be detected as English by the language checker, not Russian.',
      { contract: ru, jsonRequired: false },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.issues.some((i) => i.code === 'output_language_mismatch')).toBe(true);
  });

  it('fails on output-language mismatch for latin-script locales (Spanish, French, German)', () => {
    const englishBody =
      'This is a fairly long piece of English text that should be detected as English by the language checker, not the requested locale.';
    for (const locale of ['es', 'fr', 'de'] as const) {
      const contract = { ...baseContract(locale), outputLanguage: locale };
      const outcome = validateOutput(englishBody, { contract, jsonRequired: false });
      expect(outcome.ok, `expected ${locale} to be flagged`).toBe(false);
      expect(outcome.issues.some((i) => i.code === 'output_language_mismatch')).toBe(true);
    }
  });

  it('passes when the output is genuinely in the requested language', () => {
    const es = { ...baseContract('es'), outputLanguage: 'es' as const };
    const outcome = validateOutput(
      'Este es un texto en español que describe la visión del producto y explica por qué ahora es el momento adecuado para construirlo.',
      { contract: es, jsonRequired: false },
    );
    expect(outcome.issues.some((i) => i.code === 'output_language_mismatch')).toBe(false);
  });

  it('flags unsupported overconfident claims when evidence is required', () => {
    const c = { ...baseContract('en'), evidenceRequirement: 'required' as const, unsupportedClaimsPolicy: 'forbid' as const };
    const outcome = validateOutput('This is guaranteed to dominate the market.', { contract: c, jsonRequired: false });
    expect(outcome.ok).toBe(false);
    expect(outcome.issues.some((i) => i.code === 'unsupported_claims')).toBe(true);
  });
});
