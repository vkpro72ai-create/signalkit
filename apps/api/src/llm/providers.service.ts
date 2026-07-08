import { Injectable } from '@nestjs/common';
import { LLM_PROVIDER_TYPES, type LLMProviderType } from '@signalkit/shared';
import { DEFAULT_BASE_URLS } from '@signalkit/llm';

const DISPLAY: Record<LLMProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  openai_compatible: 'OpenAI-compatible endpoint',
  custom: 'Custom provider',
};

@Injectable()
export class LlmProvidersService {
  /** Static descriptor of every supported provider (shown before connecting). */
  list() {
    return LLM_PROVIDER_TYPES.map((type) => ({
      type,
      displayName: DISPLAY[type],
      defaultBaseUrl: DEFAULT_BASE_URLS[type] ?? null,
      requiresBaseUrl: type === 'openai_compatible' || type === 'custom',
      hasAdapter: true,
    }));
  }
}
