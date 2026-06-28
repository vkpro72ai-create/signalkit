import type { CollectInput, CollectResult, SourceAdapter, SourceAdapterDescriptor } from '../types';

/** User-provided content. Always available; never scrapes anything. */
export class ManualSourceAdapter implements SourceAdapter {
  readonly descriptor: SourceAdapterDescriptor = {
    type: 'manual',
    name: 'Manual upload',
    supportedCountries: 'all',
    supportedLanguages: 'all',
    supportedSignalTypes: ['demand', 'pain', 'competitor', 'pricing', 'regulatory', 'audience'],
    rateLimit: 'none',
    legalNotes: 'Content is provided by the user; no scraping or third-party data collection.',
    requiresApiKey: false,
    userProvided: true,
  };

  isConfigured(): boolean {
    return true;
  }

  async collect(input: CollectInput): Promise<CollectResult> {
    const content = input.content?.trim();
    if (!content) {
      return { ok: false, reason: 'no_input', message: 'No content provided' };
    }
    return {
      ok: true,
      items: [
        {
          content,
          url: input.url ?? null,
          title: input.title ?? null,
          publisher: null,
          language: null, // detected in the pipeline
          country: input.market.country,
          userProvided: true,
        },
      ],
    };
  }
}
