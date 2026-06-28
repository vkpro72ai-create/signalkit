/** Adapter for Anthropic's Messages API. */
import {
  LLMError,
  type LLMAdapterInfo,
  type LLMProviderAdapter,
  type LLMRequest,
  type LLMResponse,
} from '../index.js';

export interface AnthropicConfig {
  apiKey?: string | null;
  baseUrl?: string;
  version?: string;
}

interface AnthropicResponse {
  content: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

export class AnthropicAdapter implements LLMProviderAdapter {
  readonly info: LLMAdapterInfo;
  private readonly baseUrl: string;
  private readonly version: string;

  constructor(private readonly config: AnthropicConfig) {
    this.info = { provider: 'anthropic', configured: Boolean(config.apiKey) };
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    this.version = config.version ?? '2023-06-01';
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'anthropic-version': this.version,
      ...(this.config.apiKey ? { 'x-api-key': this.config.apiKey } : {}),
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.apiKey) return { ok: false, message: 'configuration_needed' };
    // A minimal request validates auth without a real generation budget.
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      // 200 or 400 (bad model) both prove auth works; 401/403 do not.
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'unauthorized' };
      return { ok: true, message: 'connected' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'network_error' };
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      throw new LLMError('auth', 'configuration_needed', 'anthropic', false);
    }
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const startedAt = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: request.modelId,
          max_tokens: request.maxOutputTokens ?? 4096,
          temperature: request.temperature ?? 0.4,
          ...(system ? { system } : {}),
          messages,
        }),
      });
      if (!res.ok) throw this.httpError(res.status, (await res.text()).slice(0, 500));
      const data = (await res.json()) as AnthropicResponse;
      return {
        modelId: request.modelId,
        provider: 'anthropic',
        content: data.content.map((c) => c.text ?? '').join(''),
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
        finishReason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
      };
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw new LLMError('network', err instanceof Error ? err.message : 'network_error', 'anthropic', true);
    }
  }

  private httpError(status: number, body: string): LLMError {
    if (status === 401 || status === 403) return new LLMError('auth', body, 'anthropic', false);
    if (status === 429) return new LLMError('rate_limit', body, 'anthropic', true);
    if (status >= 500) return new LLMError('server', body, 'anthropic', true);
    return new LLMError('invalid_request', body, 'anthropic', false);
  }
}
