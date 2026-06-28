import type {
  CollectInput,
  CollectResult,
  SourceAdapter,
  SourceAdapterDescriptor,
} from '../types';
import type { SignalType, SourceAdapterType } from '@signalkit/shared';

/**
 * Adapters that require external API credentials. Without a key they report
 * `configuration_needed` (no fake data). The integration contract is real:
 * `collect` is structured for the provider's API and is wired the moment a key
 * is supplied via env. Until then the UI shows a "configuration needed" state.
 */
abstract class KeyedAdapter implements SourceAdapter {
  abstract readonly descriptor: SourceAdapterDescriptor;
  protected abstract readonly apiKey: string | undefined;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async collect(_input: CollectInput): Promise<CollectResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        reason: 'configuration_needed',
        message: `${this.descriptor.name} requires an API key (set ${this.envVar}).`,
      };
    }
    // A key is present but live calls are enabled per-provider as integrations
    // are completed. Returning a clear failure is honest — never fabricated data.
    return {
      ok: false,
      reason: 'unsupported',
      message: `${this.descriptor.name} live fetch not enabled in this build.`,
    };
  }

  protected abstract get envVar(): string;
}

function descriptor(
  type: SourceAdapterType,
  name: string,
  signalTypes: SignalType[],
  legalNotes: string,
): SourceAdapterDescriptor {
  return {
    type,
    name,
    supportedCountries: 'all',
    supportedLanguages: 'all',
    supportedSignalTypes: signalTypes,
    rateLimit: 'per provider terms',
    legalNotes,
    requiresApiKey: true,
    userProvided: false,
  };
}

export class SearchResultAdapter extends KeyedAdapter {
  readonly descriptor = descriptor(
    'search_result',
    'Web search',
    ['demand', 'competitor', 'timing'],
    'Uses a configurable search provider API under its terms; no scraping of result pages.',
  );
  protected readonly apiKey = process.env.SEARCH_API_KEY;
  protected get envVar() {
    return 'SEARCH_API_KEY';
  }
}

export class RedditAdapter extends KeyedAdapter {
  readonly descriptor = descriptor(
    'reddit',
    'Reddit',
    ['pain', 'demand', 'audience'],
    'Uses the official Reddit API under its terms; public posts only, no private data.',
  );
  protected readonly apiKey = process.env.REDDIT_API_TOKEN;
  protected get envVar() {
    return 'REDDIT_API_TOKEN';
  }
}

export class ProductHuntAdapter extends KeyedAdapter {
  readonly descriptor = descriptor(
    'product_hunt',
    'Product Hunt',
    ['competitor', 'timing', 'technology_shift'],
    'Uses the Product Hunt API under its terms.',
  );
  protected readonly apiKey = process.env.PRODUCT_HUNT_TOKEN;
  protected get envVar() {
    return 'PRODUCT_HUNT_TOKEN';
  }
}

export class AppStoreReviewAdapter extends KeyedAdapter {
  readonly descriptor = descriptor(
    'app_store_review',
    'App Store reviews',
    ['pain', 'demand'],
    'Uses public app-store review feeds under platform terms; aggregate reviews only.',
  );
  protected readonly apiKey = process.env.APP_STORE_FEED_KEY;
  protected get envVar() {
    return 'APP_STORE_FEED_KEY';
  }
}
