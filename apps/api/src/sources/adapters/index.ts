import type { SourceAdapterType } from '@signalkit/shared';
import type { SourceAdapter, SourceAdapterDescriptor } from '../types';
import { ManualSourceAdapter } from './manual';
import {
  UrlSourceAdapter,
  CompetitorWebsiteAdapter,
  PricingPageAdapter,
  RegulatoryPageAdapter,
} from './url';
import {
  SearchResultAdapter,
  RedditAdapter,
  ProductHuntAdapter,
  AppStoreReviewAdapter,
} from './external';

/** Factory functions keep adapters stateless and cheap to construct per request. */
const REGISTRY: Record<SourceAdapterType, () => SourceAdapter> = {
  manual: () => new ManualSourceAdapter(),
  url: () => new UrlSourceAdapter(),
  competitor_website: () => new CompetitorWebsiteAdapter(),
  pricing_page: () => new PricingPageAdapter(),
  regulatory_page: () => new RegulatoryPageAdapter(),
  search_result: () => new SearchResultAdapter(),
  reddit: () => new RedditAdapter(),
  product_hunt: () => new ProductHuntAdapter(),
  app_store_review: () => new AppStoreReviewAdapter(),
};

export function createSourceAdapter(type: SourceAdapterType): SourceAdapter {
  return REGISTRY[type]();
}

/** Descriptors for every adapter, with live configuration status (for the UI). */
export function listAdapterDescriptors(): (SourceAdapterDescriptor & { configured: boolean })[] {
  return (Object.keys(REGISTRY) as SourceAdapterType[]).map((type) => {
    const adapter = REGISTRY[type]();
    return { ...adapter.descriptor, configured: adapter.isConfigured() };
  });
}

export { ManualSourceAdapter } from './manual';
export {
  UrlSourceAdapter,
  CompetitorWebsiteAdapter,
  PricingPageAdapter,
  RegulatoryPageAdapter,
} from './url';
