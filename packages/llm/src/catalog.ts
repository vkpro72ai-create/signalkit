/**
 * Static seed catalog shown before a user connects any provider.
 *
 * Prices/ratings are seed values with an explicit `pricingSource` and
 * `pricingFetchedAt` — they are starting points for display, NOT authoritative
 * facts. Live values are refreshed from provider APIs (e.g. OpenRouter) when a
 * key is present. Prices are USD per 1M tokens.
 */
import type { LLMProviderType, LocaleCode } from '@signalkit/shared';

export interface CatalogModel {
  provider: LLMProviderType;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputTokenPrice: number;
  outputTokenPrice: number;
  currency: string;
  pricingSource: string;
  ratingOverall: number;
  ratingReasoning: number;
  ratingResearch: number;
  ratingDocumentWriting: number;
  ratingMultilingual: number;
  speedRating: number;
  privacyRating: number;
  strengths: string[];
  weaknesses: string[];
  bestUseCases: string[];
  supportedLanguages: LocaleCode[];
  supportsJsonMode: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
}

const ALL_LANGS: LocaleCode[] = ['en', 'ru', 'tr', 'de', 'es', 'fr', 'pt', 'ar', 'hi', 'id'];

export const SEED_CATALOG_SOURCE = 'signalkit-seed';

export const STATIC_MODEL_CATALOG: CatalogModel[] = [
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputTokenPrice: 2.5,
    outputTokenPrice: 10,
    currency: 'USD',
    pricingSource: SEED_CATALOG_SOURCE,
    ratingOverall: 8.8,
    ratingReasoning: 8.7,
    ratingResearch: 8.5,
    ratingDocumentWriting: 8.9,
    ratingMultilingual: 8.8,
    speedRating: 8.5,
    privacyRating: 6.5,
    strengths: ['Strong general reasoning', 'Excellent multilingual', 'Reliable JSON'],
    weaknesses: ['Mid-tier cost', 'Not the cheapest for long packs'],
    bestUseCases: ['Product document generation', 'Critic review'],
    supportedLanguages: ALL_LANGS,
    supportsJsonMode: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputTokenPrice: 0.15,
    outputTokenPrice: 0.6,
    currency: 'USD',
    pricingSource: SEED_CATALOG_SOURCE,
    ratingOverall: 7.8,
    ratingReasoning: 7.4,
    ratingResearch: 7.2,
    ratingDocumentWriting: 7.6,
    ratingMultilingual: 7.9,
    speedRating: 9.2,
    privacyRating: 6.5,
    strengths: ['Very cheap', 'Fast', 'Good for summarization'],
    weaknesses: ['Weaker deep reasoning'],
    bestUseCases: ['Source summarization', 'Signal extraction', 'Translation'],
    supportedLanguages: ALL_LANGS,
    supportsJsonMode: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    inputTokenPrice: 3,
    outputTokenPrice: 15,
    currency: 'USD',
    pricingSource: SEED_CATALOG_SOURCE,
    ratingOverall: 9.1,
    ratingReasoning: 9.2,
    ratingResearch: 9,
    ratingDocumentWriting: 9.3,
    ratingMultilingual: 8.9,
    speedRating: 8,
    privacyRating: 7.5,
    strengths: ['Excellent long-form writing', 'Strong structure adherence', 'Large context'],
    weaknesses: ['Higher output cost'],
    bestUseCases: ['Product document generation', 'AI agent instructions'],
    supportedLanguages: ALL_LANGS,
    supportsJsonMode: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
  },
  {
    provider: 'google',
    modelId: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    inputTokenPrice: 0.1,
    outputTokenPrice: 0.4,
    currency: 'USD',
    pricingSource: SEED_CATALOG_SOURCE,
    ratingOverall: 8,
    ratingReasoning: 7.8,
    ratingResearch: 8.2,
    ratingDocumentWriting: 7.9,
    ratingMultilingual: 8.4,
    speedRating: 9.4,
    privacyRating: 6,
    strengths: ['Huge context window', 'Very fast', 'Cheap'],
    weaknesses: ['Less consistent structure'],
    bestUseCases: ['Source ingestion at scale', 'Market comparison'],
    supportedLanguages: ALL_LANGS,
    supportsJsonMode: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    displayName: 'DeepSeek V3',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    inputTokenPrice: 0.27,
    outputTokenPrice: 1.1,
    currency: 'USD',
    pricingSource: SEED_CATALOG_SOURCE,
    ratingOverall: 7.9,
    ratingReasoning: 8,
    ratingResearch: 7.6,
    ratingDocumentWriting: 7.7,
    ratingMultilingual: 7.5,
    speedRating: 8,
    privacyRating: 5,
    strengths: ['Strong reasoning per dollar', 'Cheap'],
    weaknesses: ['Smaller context', 'Privacy considerations'],
    bestUseCases: ['Scoring explanation', 'Niche generation'],
    supportedLanguages: ['en', 'ru', 'es', 'fr', 'de', 'pt'],
    supportsJsonMode: true,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
  },
  {
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    displayName: 'Mistral Large',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputTokenPrice: 2,
    outputTokenPrice: 6,
    currency: 'USD',
    pricingSource: SEED_CATALOG_SOURCE,
    ratingOverall: 8,
    ratingReasoning: 7.9,
    ratingResearch: 7.7,
    ratingDocumentWriting: 8,
    ratingMultilingual: 8.5,
    speedRating: 8.3,
    privacyRating: 8,
    strengths: ['EU-hosted option', 'Strong European languages'],
    weaknesses: ['Smaller ecosystem'],
    bestUseCases: ['EU-market documents', 'Localization'],
    supportedLanguages: ['en', 'fr', 'de', 'es', 'pt', 'ru'],
    supportsJsonMode: true,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
  },
];
