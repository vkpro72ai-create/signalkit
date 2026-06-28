/** Adapter registry: build the right provider adapter from a connection config. */
import type { LLMProviderType } from '@signalkit/shared';
import type { LLMProviderAdapter } from '../index.js';
import { OpenAICompatibleAdapter } from './openai-compatible.js';
import { AnthropicAdapter } from './anthropic.js';
import { GoogleAdapter } from './google.js';

export { OpenAICompatibleAdapter } from './openai-compatible.js';
export { AnthropicAdapter } from './anthropic.js';
export { GoogleAdapter } from './google.js';

/** Default base URLs for providers that speak the OpenAI protocol. */
export const DEFAULT_BASE_URLS: Partial<Record<LLMProviderType, string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export interface ConnectionConfig {
  provider: LLMProviderType;
  apiKey?: string | null;
  /** Required for openai_compatible and custom; optional override otherwise. */
  baseUrl?: string | null;
}

export class AdapterConfigError extends Error {}

/**
 * Create an adapter for a provider. Throws AdapterConfigError when a provider
 * that needs an explicit base URL (openai_compatible / custom) lacks one.
 */
export function createAdapter(config: ConnectionConfig): LLMProviderAdapter {
  const { provider, apiKey } = config;

  if (provider === 'anthropic') {
    return new AnthropicAdapter({ apiKey, baseUrl: config.baseUrl ?? undefined });
  }
  if (provider === 'google') {
    return new GoogleAdapter({ apiKey, baseUrl: config.baseUrl ?? undefined });
  }

  // OpenAI-compatible family.
  const headers =
    provider === 'openrouter'
      ? { 'HTTP-Referer': 'https://signalkit.app', 'X-Title': 'SignalKit' }
      : undefined;

  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URLS[provider];
  if (!baseUrl) {
    throw new AdapterConfigError(`Provider "${provider}" requires an explicit base URL`);
  }

  return new OpenAICompatibleAdapter({ provider, apiKey, baseUrl, headers });
}
