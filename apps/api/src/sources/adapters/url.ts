import type {
  CollectInput,
  CollectResult,
  CollectedRaw,
  SourceAdapter,
  SourceAdapterDescriptor,
} from '../types';
import type { SignalType, SourceAdapterType } from '@signalkit/shared';
import { extractText } from '../html';

const UA = 'SignalKitBot/0.1 (+https://signalkit.app/bot; respects robots & site terms)';

/**
 * Fetches a single public URL and extracts readable text. Specialized adapters
 * (competitor/pricing/regulatory) subclass this with a different signal focus.
 * Only public pages; site terms/robots awareness is documented in
 * docs/SOURCES_LEGAL.md.
 */
export class UrlSourceAdapter implements SourceAdapter {
  readonly descriptor: SourceAdapterDescriptor;

  constructor(
    type: SourceAdapterType = 'url',
    name = 'Public URL',
    signalTypes: SignalType[] = ['demand', 'pain', 'competitor', 'pricing', 'regulatory'],
    legalNotes = 'Fetches public web pages only. Respects site terms and robots; no authentication-walled or private content.',
  ) {
    this.descriptor = {
      type,
      name,
      supportedCountries: 'all',
      supportedLanguages: 'all',
      supportedSignalTypes: signalTypes,
      rateLimit: '~1 request/second per host',
      legalNotes,
      requiresApiKey: false,
      userProvided: false,
    };
  }

  isConfigured(): boolean {
    return true;
  }

  async collect(input: CollectInput): Promise<CollectResult> {
    const url = input.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return { ok: false, reason: 'no_input', message: 'A valid http(s) URL is required' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: controller.signal });
      if (!res.ok) {
        return { ok: false, reason: 'fetch_failed', message: `HTTP ${res.status}` };
      }
      const html = await res.text();
      const { title, text } = extractText(html);
      if (text.length === 0) {
        return { ok: false, reason: 'fetch_failed', message: 'No readable content extracted' };
      }
      const item: CollectedRaw = {
        content: text.slice(0, 20_000),
        url,
        title,
        publisher: safeHostname(url),
        language: null,
        country: input.market.country,
        userProvided: false,
      };
      return { ok: true, items: [item] };
    } catch (err) {
      return {
        ok: false,
        reason: 'fetch_failed',
        message: err instanceof Error ? err.message : 'network error',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class CompetitorWebsiteAdapter extends UrlSourceAdapter {
  constructor() {
    super('competitor_website', 'Competitor website', ['competitor', 'pricing'], 'Public competitor pages only.');
  }
}
export class PricingPageAdapter extends UrlSourceAdapter {
  constructor() {
    super('pricing_page', 'Pricing page', ['pricing', 'competitor'], 'Public pricing pages only.');
  }
}
export class RegulatoryPageAdapter extends UrlSourceAdapter {
  constructor() {
    super('regulatory_page', 'Regulatory page', ['regulatory'], 'Public regulatory/government pages only.');
  }
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
