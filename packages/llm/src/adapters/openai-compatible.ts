/**
 * Adapter for any OpenAI-compatible chat-completions endpoint. OpenAI, DeepSeek,
 * Mistral, OpenRouter, "OpenAI-compatible" and "custom" providers all speak this
 * protocol and reuse this class with a different base URL.
 */
import type { LLMProviderType } from '@signalkit/shared';
import {
  LLMError,
  type LLMAdapterInfo,
  type LLMProviderAdapter,
  type LLMRequest,
  type LLMResponse,
} from '../index.js';

export interface AdapterConfig {
  provider: LLMProviderType;
  apiKey?: string | null;
  baseUrl: string;
  /** Extra headers (e.g. OpenRouter attribution). */
  headers?: Record<string, string>;
}

interface ChatCompletionResponse {
  choices: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAICompatibleAdapter implements LLMProviderAdapter {
  readonly info: LLMAdapterInfo;

  constructor(protected readonly config: AdapterConfig) {
    this.info = { provider: config.provider, configured: Boolean(config.apiKey) };
  }

  protected authHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...this.config.headers,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.apiKey) {
      return { ok: false, message: 'configuration_needed' };
    }
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, { headers: this.authHeaders() });
      return res.ok
        ? { ok: true, message: 'connected' }
        : { ok: false, message: `http_${res.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'network_error' };
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      throw new LLMError('auth', 'configuration_needed', this.config.provider, false);
    }
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 60_000);
    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.authHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          model: request.modelId,
          messages: request.messages,
          temperature: request.temperature ?? 0.4,
          max_tokens: request.maxOutputTokens,
          ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) {
        throw this.normalizeHttpError(res.status, await safeText(res));
      }
      const data = (await res.json()) as ChatCompletionResponse;
      const choice = data.choices[0];
      return {
        modelId: request.modelId,
        provider: this.config.provider,
        content: choice?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
        finishReason: mapFinishReason(choice?.finish_reason),
      };
    } catch (err) {
      throw this.toLLMError(err);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** OpenRouter (and OpenAI) expose a model list. */
  async listModels(): Promise<{ modelId: string; displayName: string }[]> {
    const res = await fetch(`${this.config.baseUrl}/models`, { headers: this.authHeaders() });
    if (!res.ok) throw this.normalizeHttpError(res.status, await safeText(res));
    const data = (await res.json()) as { data?: { id: string; name?: string }[] };
    return (data.data ?? []).map((m) => ({ modelId: m.id, displayName: m.name ?? m.id }));
  }

  protected normalizeHttpError(status: number, body: string): LLMError {
    const provider = this.config.provider;
    if (status === 401 || status === 403) return new LLMError('auth', body, provider, false);
    if (status === 429) return new LLMError('rate_limit', body, provider, true);
    if (status === 400) return new LLMError('invalid_request', body, provider, false);
    if (status >= 500) return new LLMError('server', body, provider, true);
    return new LLMError('unknown', `http_${status}: ${body}`, provider, false);
  }

  protected toLLMError(err: unknown): LLMError {
    if (err instanceof LLMError) return err;
    if (err instanceof Error && err.name === 'AbortError') {
      return new LLMError('timeout', 'request timed out', this.config.provider, true);
    }
    return new LLMError('network', err instanceof Error ? err.message : 'network_error', this.config.provider, true);
  }
}

function mapFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    case 'tool_calls':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}
