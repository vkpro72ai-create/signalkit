import { describe, it, expect } from 'vitest';
import { ManualSourceAdapter } from './adapters/manual';
import { UrlSourceAdapter } from './adapters/url';
import { SearchResultAdapter, RedditAdapter } from './adapters/external';
import { listAdapterDescriptors, createSourceAdapter } from './adapters';
import { detectLanguage } from './language';
import { extractiveSummary, extractEntities, inferSignalType, extractSignal, normalizeItem } from './normalize';
import { extractText } from './html';

const market = { country: 'TR' as const, marketLanguage: 'tr' as const };

describe('source adapters', () => {
  it('manual adapter is always configured and echoes user content (no fabrication)', async () => {
    const a = new ManualSourceAdapter();
    expect(a.isConfigured()).toBe(true);
    const res = await a.collect({ content: 'Users keep asking for offline mode.', market });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.items[0]!.content).toContain('offline mode');
      expect(res.items[0]!.userProvided).toBe(true);
    }
  });

  it('manual adapter refuses empty input', async () => {
    const res = await new ManualSourceAdapter().collect({ content: '  ', market });
    expect(res.ok).toBe(false);
  });

  it('url adapter rejects a missing/invalid url without fetching', async () => {
    const res = await new UrlSourceAdapter().collect({ url: 'not-a-url', market });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no_input');
  });

  it('external adapters report configuration_needed without a key (no fake data)', async () => {
    for (const adapter of [new SearchResultAdapter(), new RedditAdapter()]) {
      const res = await adapter.collect({ market });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('configuration_needed');
    }
  });

  it('registry exposes all nine adapters with configuration status', () => {
    const all = listAdapterDescriptors();
    expect(all).toHaveLength(9);
    expect(all.find((d) => d.type === 'manual')?.configured).toBe(true);
    expect(all.find((d) => d.type === 'reddit')?.configured).toBe(false);
    expect(createSourceAdapter('pricing_page').descriptor.supportedSignalTypes).toContain('pricing');
  });
});

describe('html extraction', () => {
  it('strips tags and pulls the title', () => {
    const { title, text } = extractText('<title>Pricing</title><body><h1>Plans</h1><script>x</script><p>From $10/mo</p></body>');
    expect(title).toBe('Pricing');
    expect(text).toContain('From $10/mo');
    expect(text).not.toContain('x');
  });
});

describe('language detection', () => {
  it('detects non-latin scripts definitively', () => {
    expect(detectLanguage('Привет, это рынок и спрос', 'en')).toBe('ru');
    expect(detectLanguage('هذا هو السوق والطلب', 'en')).toBe('ar');
  });
  it('detects latin languages by stopwords, else falls back', () => {
    expect(detectLanguage('the users want this and the team is for it', 'tr')).toBe('en');
    expect(detectLanguage('xyz', 'de')).toBe('de');
  });
});

describe('normalization & signals', () => {
  it('produces an extractive (real) summary and surfaces entities', () => {
    const summary = extractiveSummary('Clinics in Istanbul want WhatsApp automation. It saves staff time. '.repeat(20));
    expect(summary.length).toBeLessThanOrEqual(321);
    expect(extractEntities('Apple beats Google. Apple again. Microsoft.')).toContain('Apple');
  });

  it('infers signal type from adapter and keywords', () => {
    expect(inferSignalType('pricing_page', 'anything')).toBe('pricing');
    expect(inferSignalType('manual', 'users really hate the current workflow')).toBe('pain');
    expect(inferSignalType('manual', 'people want a faster tool')).toBe('demand');
  });

  it('extracts a signal carrying quality and freshness', () => {
    const raw = { content: 'Users want offline mode badly.', url: null, title: null, publisher: null, language: null, country: 'TR' as const, userProvided: true };
    const normalized = normalizeItem(raw, market);
    const signal = extractSignal('manual', raw, normalized, new Date());
    expect(signal.sourceQuality).toBeGreaterThan(0);
    expect(signal.freshnessScore).toBeGreaterThan(0.9); // freshly collected
    expect(signal.text.length).toBeGreaterThan(0);
  });
});
