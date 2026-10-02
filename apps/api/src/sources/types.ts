/**
 * Source ingestion contracts.
 *
 * Engineering law: no fake sources or evidence. Every adapter declares what it
 * legally supports, reports `configuration_needed` when credentials/inputs are
 * missing, and only ever returns content it actually fetched or the user
 * supplied. Each collected item preserves its original content, source URL,
 * language and market context so the Evidence Graph (Session 8) can trust it.
 */
import type { CountryCode, LocaleCode, SignalType, SourceAdapterType } from '@signalkit/shared';

export interface SourceAdapterDescriptor {
  type: SourceAdapterType;
  name: string;
  /** Markets this adapter can serve, or 'all'. */
  supportedCountries: CountryCode[] | 'all';
  supportedLanguages: LocaleCode[] | 'all';
  supportedSignalTypes: SignalType[];
  /** Human-readable rate-limit guidance. */
  rateLimit: string;
  /** Legal/usage notes surfaced in the UI and docs/SOURCES_LEGAL.md. */
  legalNotes: string;
  requiresApiKey: boolean;
  /** True when content originates from the user (manual upload), not scraping. */
  userProvided: boolean;
}

export interface SourceMarketContext {
  country: CountryCode | null;
  marketLanguage: LocaleCode;
}

export interface CollectInput {
  url?: string | null;
  content?: string | null;
  title?: string | null;
  query?: string | null;
  market: SourceMarketContext;
}

/** A raw item exactly as collected — no interpretation yet. */
export interface CollectedRaw {
  content: string;
  url: string | null;
  title: string | null;
  publisher: string | null;
  /** Original language if known at collection time; otherwise detected later. */
  language: LocaleCode | null;
  country: CountryCode | null;
  userProvided: boolean;
}

export type CollectFailureReason =
  | 'configuration_needed'
  | 'fetch_failed'
  | 'no_input'
  | 'unsupported';

export type CollectResult =
  | { ok: true; items: CollectedRaw[] }
  | { ok: false; reason: CollectFailureReason; message: string };

export interface SourceAdapter {
  readonly descriptor: SourceAdapterDescriptor;
  /** Whether the adapter has everything it needs to fetch real data. */
  isConfigured(): boolean;
  /** Collect raw items. Must never fabricate data; returns a clear failure instead. */
  collect(input: CollectInput): Promise<CollectResult>;
}
