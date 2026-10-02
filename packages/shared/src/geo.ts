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

/** English display name for each supported locale — used to build unambiguous LLM language instructions. */
export const LOCALE_LANGUAGE_NAMES: Record<LocaleCode, string> = {
  en: 'English',
  ru: 'Russian',
  tr: 'Turkish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  hi: 'Hindi',
  id: 'Indonesian',
};

/** ISO 639-3 code used by the `franc-min` language detector for each supported locale. */
export const LOCALE_TO_ISO6393: Record<LocaleCode, string> = {
  en: 'eng',
  ru: 'rus',
  tr: 'tur',
  de: 'deu',
  es: 'spa',
  fr: 'fra',
  pt: 'por',
  ar: 'arb',
  hi: 'hin',
  id: 'ind',
};

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

/** All market scopes, in the order shown in the New Project market step. */
export const MARKET_SCOPES: readonly MarketScope[] = [
  'current_location',
  'country_of_residence',
  'manual_country',
  'manual_region',
  'multi_country',
  'global',
] as const;

/** Only the current-location scope needs geolocation consent. */
export function marketScopeRequiresConsent(scope: MarketScope): boolean {
  return scope === 'current_location';
}

/** Does this scope require a country to be known/selected? */
export function marketScopeNeedsCountry(scope: MarketScope): boolean {
  return (
    scope === 'current_location' ||
    scope === 'country_of_residence' ||
    scope === 'manual_country' ||
    scope === 'manual_region'
  );
}

/** The geo facts a resolution needs (a subset of UserSettings). */
export interface GeoFacts {
  consentStatus: GeoConsentStatus;
  locationUsageMode: LocationUsageMode;
  detectedCountry: CountryCode | null;
  detectedRegion: RegionCode | null;
  countryOfResidence: CountryCode | null;
}

export interface MarketResolutionInput {
  scope: MarketScope;
  geo: GeoFacts;
  country?: CountryCode | null;
  region?: RegionCode | null;
  countries?: CountryCode[];
  regions?: RegionCode[];
  marketLanguage: LocaleCode;
  regulatorySensitivity?: 'low' | 'medium' | 'high';
}

export type MarketResolutionFailure =
  | 'location_consent_required'
  | 'country_required'
  | 'region_required'
  | 'residence_required';

export type MarketResolution =
  | { ok: true; market: MarketProfile }
  | { ok: false; reason: MarketResolutionFailure };

/**
 * Resolve a concrete MarketProfile from a requested scope — the single place
 * consent gating lives. `current_location` is refused unless consent is granted,
 * location usage is enabled, and a country was detected. Never reads or requires
 * precise coordinates: it works entirely at country/region granularity.
 */
export function resolveMarketProfile(input: MarketResolutionInput): MarketResolution {
  const { scope, geo, marketLanguage } = input;
  const sensitivity = input.regulatorySensitivity ?? 'medium';

  const single = (
    country: CountryCode | null,
    region: RegionCode | null,
  ): MarketResolution => ({
    ok: true,
    market: {
      scope,
      targetCountry: country,
      targetRegion: region,
      targetCountries: country ? [country] : [],
      targetRegions: region ? [region] : [],
      marketLanguage,
      regulatorySensitivity: sensitivity,
    },
  });

  switch (scope) {
    case 'current_location': {
      const allowed = geo.consentStatus === 'granted' && geo.locationUsageMode !== 'off';
      if (!allowed || !geo.detectedCountry) {
        return { ok: false, reason: 'location_consent_required' };
      }
      const region = geo.locationUsageMode === 'region_only' ? geo.detectedRegion : null;
      return single(geo.detectedCountry, region);
    }
    case 'country_of_residence':
      if (!geo.countryOfResidence) return { ok: false, reason: 'residence_required' };
      return single(geo.countryOfResidence, null);
    case 'manual_country':
      if (!input.country) return { ok: false, reason: 'country_required' };
      return single(input.country, null);
    case 'manual_region':
      if (!input.region) return { ok: false, reason: 'region_required' };
      return single(input.country ?? null, input.region);
    case 'multi_country': {
      const countries = input.countries ?? [];
      if (countries.length === 0) return { ok: false, reason: 'country_required' };
      return {
        ok: true,
        market: {
          scope,
          targetCountry: null,
          targetRegion: null,
          targetCountries: countries,
          targetRegions: input.regions ?? [],
          marketLanguage,
          regulatorySensitivity: sensitivity,
        },
      };
    }
    case 'global':
      return single(null, null);
  }
}
