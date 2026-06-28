/** Adapter for Google Generative Language (Gemini) generateContent API. */
import {
  LLMError,
  type LLMAdapterInfo,
  type LLMProviderAdapter,
  type LLMRequest,
  type LLMResponse,
} from '../index.js';

export interface GoogleConfig {
  apiKey?: string | null;
  baseUrl?: string;
}

interface GoogleResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GoogleAdapter implements LLMProviderAdapter {
  readonly info: LLMAdapterInfo;
  private readonly baseUrl: string;

  constructor(private readonly config: GoogleConfig) {
    this.info = { provider: 'google', configured: Boolean(config.apiKey) };
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.apiKey) return { ok: false, message: 'configuration_needed' };
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${this.config.apiKey}`);
      return res.ok ? { ok: true, message: 'connected' } : { ok: false, message: `http_${res.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'network_error' };
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      throw new LLMError('auth', 'configuration_needed', 'google', false);
    }
    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');

    const startedAt = Date.now();
    try {
      const url = `${this.baseUrl}/models/${request.modelId}:generateContent?key=${this.config.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: {
            temperature: request.temperature ?? 0.4,
            maxOutputTokens: request.maxOutputTokens,
            ...(request.jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      });
      if (!res.ok) throw this.httpError(res.status, (await res.text()).slice(0, 500));
      const data = (await res.json()) as GoogleResponse;
      const candidate = data.candidates?.[0];
      return {
        modelId: request.modelId,
        provider: 'google',
        content: (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - startedAt,
        finishReason: candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      };
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw new LLMError('network', err instanceof Error ? err.message : 'network_error', 'google', true);
    }
  }

  private httpError(status: number, body: string): LLMError {
    if (status === 401 || status === 403) return new LLMError('auth', body, 'google', false);
    if (status === 429) return new LLMError('rate_limit', body, 'google', true);
    if (status >= 500) return new LLMError('server', body, 'google', true);
    return new LLMError('invalid_request', body, 'google', false);
  }
}
