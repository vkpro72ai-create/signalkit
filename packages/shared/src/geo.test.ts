import { describe, it, expect } from 'vitest';
import {
  resolveMarketProfile,
  marketScopeRequiresConsent,
  marketScopeNeedsCountry,
  MARKET_SCOPES,
  type GeoFacts,
} from './index.js';

const noGeo: GeoFacts = {
  consentStatus: 'unknown',
  locationUsageMode: 'off',
  detectedCountry: null,
  detectedRegion: null,
  countryOfResidence: null,
};

describe('market resolution & consent gating', () => {
  it('lists six scopes; only current_location needs consent', () => {
    expect(MARKET_SCOPES).toHaveLength(6);
    expect(marketScopeRequiresConsent('current_location')).toBe(true);
    expect(marketScopeRequiresConsent('global')).toBe(false);
    expect(marketScopeNeedsCountry('global')).toBe(false);
    expect(marketScopeNeedsCountry('manual_country')).toBe(true);
  });

  it('REFUSES current_location without consent (no location without consent)', () => {
    const res = resolveMarketProfile({ scope: 'current_location', geo: noGeo, marketLanguage: 'en' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('location_consent_required');
  });

  it('refuses current_location when consent granted but usage is off', () => {
    const geo: GeoFacts = { ...noGeo, consentStatus: 'granted', detectedCountry: 'TR', locationUsageMode: 'off' };
    expect(resolveMarketProfile({ scope: 'current_location', geo, marketLanguage: 'tr' }).ok).toBe(false);
  });

  it('allows current_location with consent + detected country (country-only, no coords)', () => {
    const geo: GeoFacts = {
      consentStatus: 'granted',
      locationUsageMode: 'country_only',
      detectedCountry: 'TR',
      detectedRegion: 'TR-34',
      countryOfResidence: 'RU',
    };
    const res = resolveMarketProfile({ scope: 'current_location', geo, marketLanguage: 'tr' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.market.targetCountry).toBe('TR');
      expect(res.market.targetRegion).toBeNull(); // country_only → no region
    }
  });

  it('uses country of residence', () => {
    const geo: GeoFacts = { ...noGeo, countryOfResidence: 'RU' };
    const res = resolveMarketProfile({ scope: 'country_of_residence', geo, marketLanguage: 'ru' });
    expect(res.ok && res.market.targetCountry).toBe('RU');
  });

  it('builds a single manual-country market', () => {
    const res = resolveMarketProfile({ scope: 'manual_country', geo: noGeo, country: 'US', marketLanguage: 'en' });
    expect(res.ok && res.market.targetCountries).toEqual(['US']);
  });

  it('builds a multi-country comparison market', () => {
    const res = resolveMarketProfile({
      scope: 'multi_country',
      geo: noGeo,
      countries: ['DE', 'AE'],
      marketLanguage: 'en',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.market.targetCountry).toBeNull();
      expect(res.market.targetCountries).toEqual(['DE', 'AE']);
    }
  });

  it('supports global with no country (refusing geo entirely still works)', () => {
    const res = resolveMarketProfile({ scope: 'global', geo: noGeo, marketLanguage: 'en' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.market.targetCountry).toBeNull();
  });

  it('requires a selection for manual scopes', () => {
    expect(resolveMarketProfile({ scope: 'manual_country', geo: noGeo, marketLanguage: 'en' }).ok).toBe(false);
    expect(resolveMarketProfile({ scope: 'multi_country', geo: noGeo, countries: [], marketLanguage: 'en' }).ok).toBe(
      false,
    );
  });
});
