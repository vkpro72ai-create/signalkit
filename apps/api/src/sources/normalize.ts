/**
 * Deterministic normalization and signal extraction.
 *
 * No fabrication: the summary is extractive (taken from the real content),
 * entities are surfaced from the text, and scores are computed from observable
 * facts (content length, market match, adapter trust, recency). When an LLM is
 * configured, the pipeline can additionally route a `signal_normalization` task
 * through LlmRouterService — but the deterministic path is always honest.
 */
import type { CountryCode, LocaleCode, SignalType, SourceAdapterType } from '@signalkit/shared';
import type { CollectedRaw, SourceMarketContext } from './types';
import { detectLanguage } from './language';

export interface NormalizedItem {
  summary: string;
  extractedEntities: string[];
  detectedMarket: CountryCode | null;
  detectedLanguage: LocaleCode;
  relevance: number;
}

export function normalizeItem(raw: CollectedRaw, market: SourceMarketContext): NormalizedItem {
  const detectedLanguage = raw.language ?? detectLanguage(raw.content, market.marketLanguage);
  const summary = extractiveSummary(raw.content);
  const extractedEntities = extractEntities(raw.content);
  const detectedMarket = raw.country ?? market.country;
  const relevance = computeRelevance(raw, market);
  return { summary, extractedEntities, detectedMarket, detectedLanguage, relevance };
}

/** First sentences up to ~320 chars — a real excerpt, never invented. */
export function extractiveSummary(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (clean.length <= 320) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 320) break;
    out += s;
  }
  return (out || clean.slice(0, 320)).trim();
}

/** Surface candidate entities: frequent capitalized tokens (length ≥ 3). */
export function extractEntities(content: string): string[] {
  const tokens = content.match(/\b[A-Z][A-Za-z0-9+]{2,}\b/g) ?? [];
  const freq = new Map<string, number>();
  for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
}

function computeRelevance(raw: CollectedRaw, market: SourceMarketContext): number {
  let score = 0.4;
  if (raw.content.length > 500) score += 0.2;
  if (raw.content.length > 2000) score += 0.1;
  if (market.country && raw.country === market.country) score += 0.2;
  if (raw.userProvided) score += 0.1; // the user vouched for it
  return Math.min(1, score);
}

/** Adapter trust → base source quality (0..1). */
const ADAPTER_QUALITY: Record<SourceAdapterType, number> = {
  manual: 0.6,
  url: 0.5,
  competitor_website: 0.6,
  pricing_page: 0.7,
  regulatory_page: 0.8,
  search_result: 0.5,
  reddit: 0.45,
  product_hunt: 0.55,
  app_store_review: 0.5,
};

export interface ExtractedSignal {
  signalType: SignalType;
  text: string;
  strengthScore: number;
  freshnessScore: number;
  sourceQuality: number;
  topic: string | null;
}

/** Infer a signal type from the adapter and content keywords. */
export function inferSignalType(adapter: SourceAdapterType, content: string): SignalType {
  if (adapter === 'pricing_page') return 'pricing';
  if (adapter === 'regulatory_page') return 'regulatory';
  if (adapter === 'competitor_website') return 'competitor';
  const lower = content.toLowerCase();
  if (/\b(price|pricing|\$|subscription|per month)\b/.test(lower)) return 'pricing';
  if (/\b(regulation|compliance|gdpr|law|legal)\b/.test(lower)) return 'regulatory';
  if (/\b(hate|frustrat|annoying|wish|problem|pain|struggle)\b/.test(lower)) return 'pain';
  if (/\b(want|need|demand|looking for|searching)\b/.test(lower)) return 'demand';
  return 'demand';
}

/**
 * Build a signal from a normalized item. `freshness` decays from collection time
 * (newly collected = ~1.0). Quality comes from the adapter trust map.
 */
export function extractSignal(
  adapter: SourceAdapterType,
  raw: CollectedRaw,
  normalized: NormalizedItem,
  collectedAt: Date = new Date(),
): ExtractedSignal {
  const ageDays = (Date.now() - collectedAt.getTime()) / 86_400_000;
  const freshnessScore = Math.max(0, 1 - ageDays / 365); // ~1.0 fresh, →0 after a year
  return {
    signalType: inferSignalType(adapter, raw.content),
    text: normalized.summary,
    strengthScore: normalized.relevance,
    freshnessScore: Math.round(freshnessScore * 100) / 100,
    sourceQuality: ADAPTER_QUALITY[adapter],
    topic: normalized.extractedEntities[0] ?? null,
  };
}
