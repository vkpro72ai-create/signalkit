/**
 * Locale, language and geo/market targeting primitives.
 *
 * Geo is used only with explicit consent. By default SignalKit stores at most
 * country/region — never precise coordinates. See docs/PRIVACY_GEO.md (Session 6).
 */

/** Supported interface/output locales (BCP-47-ish short codes). Extend deliberately. */
export type LocaleCode =
  | 'en'
  | 'ru'
  | 'tr'
  | 'de'
  | 'es'
  | 'fr'
  | 'pt'
  | 'ar'
  | 'hi'
  | 'id';

export const SUPPORTED_LOCALES: readonly LocaleCode[] = [
  'en',
  'ru',
  'tr',
  'de',
  'es',
  'fr',
  'pt',
  'ar',
  'hi',
  'id',
] as const;

export const DEFAULT_LOCALE: LocaleCode = 'en';

/** Locales that render right-to-left. */
export const RTL_LOCALES: readonly LocaleCode[] = ['ar'] as const;

/**
 * How a document's language is decided.
 * - `follow_interface`: use the user's interface locale
 * - `follow_market`: use the dominant language of the target market
 * - `explicit`: a specific locale chosen by the user
 */
export type LanguageMode = 'follow_interface' | 'follow_market' | 'explicit';

/** ISO 3166-1 alpha-2 country code, e.g. "US", "TR", "DE". */
export type CountryCode = string;

/** ISO 3166-2 / internal region code, e.g. "US-CA", "DE-BY". */
export type RegionCode = string;

/** How the user wants opportunities scoped geographically. */
export type MarketScope =
  | 'current_location'
  | 'country_of_residence'
  | 'manual_country'
  | 'manual_region'
  | 'multi_country'
  | 'global';

/** Consent state for using the user's location. */
export type GeoConsentStatus = 'unknown' | 'granted' | 'denied' | 'revoked';

/** How precisely location may be used once consent is granted. */
export type LocationUsageMode = 'off' | 'country_only' | 'region_only';

/** Per-user geo preference. Never requires precise coordinates. */
export interface GeoPreference {
  consentStatus: GeoConsentStatus;
  locationUsageMode: LocationUsageMode;
  detectedCountry: CountryCode | null;
  detectedRegion: RegionCode | null;
  countryOfResidence: CountryCode | null;
}

/** A concrete market target attached to projects/search contexts. */
export interface MarketProfile {
  scope: MarketScope;
  /** Primary target country (single-market scopes). */
  targetCountry: CountryCode | null;
  targetRegion: RegionCode | null;
  /** For multi-market comparison. */
  targetCountries: CountryCode[];
  targetRegions: RegionCode[];
  /** Language the market research should be conducted/written in. */
  marketLanguage: LocaleCode;
  /** Coarse regulatory sensitivity for the chosen market(s). */
  regulatorySensitivity: 'low' | 'medium' | 'high';
}

/** Reference catalog rows seeded for selectors. */
export interface Country {
  code: CountryCode;
  /** Localized display names keyed by locale. */
  names: Partial<Record<LocaleCode, string>>;
  primaryLanguage: LocaleCode;
  currency: string;
}

export interface Region {
  code: RegionCode;
  countryCode: CountryCode;
  names: Partial<Record<LocaleCode, string>>;
}
