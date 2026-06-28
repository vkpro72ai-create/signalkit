import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { GeoService } from './geo.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

function makeService(settings: Record<string, unknown>) {
  const prisma = {
    userSettings: {
      findUnique: vi.fn().mockResolvedValue(settings),
      create: vi.fn().mockResolvedValue(settings),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...settings, ...data })),
    },
    country: { findUnique: vi.fn().mockResolvedValue({ code: 'TR', primaryLanguage: 'tr' }) },
  } as unknown as PrismaService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  return { svc: new GeoService(prisma, audit), prisma };
}

const baseSettings = {
  geoConsentStatus: 'unknown',
  locationUsageMode: 'off',
  detectedCountry: null,
  detectedRegion: null,
  countryOfResidence: null,
  defaultDocumentLanguage: 'en',
};

describe('GeoService', () => {
  it('detects a coarse country from CDN headers (country-only)', () => {
    const { svc } = makeService(baseSettings);
    expect(svc.detectCountry({ 'cf-ipcountry': 'tr' })).toEqual({ country: 'TR' });
    expect(svc.detectCountry({})).toEqual({ country: null });
  });

  it('refuses current_location market without consent (403)', async () => {
    const { svc } = makeService(baseSettings);
    await expect(svc.resolveMarket('u1', { scope: 'current_location' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves a manual country market and derives its language', async () => {
    const { svc } = makeService(baseSettings);
    const market = await svc.resolveMarket('u1', { scope: 'manual_country', country: 'TR' });
    expect(market.targetCountry).toBe('TR');
    expect(market.marketLanguage).toBe('tr'); // from Country.primaryLanguage
  });

  it('clearing location revokes consent and nulls detected fields', async () => {
    const { svc, prisma } = makeService({ ...baseSettings, geoConsentStatus: 'granted', detectedCountry: 'TR' });
    await svc.clearLocation('u1');
    const update = (prisma.userSettings.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.geoConsentStatus).toBe('revoked');
    expect(update.data.detectedCountry).toBeNull();
    expect(update.data.locationUsageMode).toBe('off');
  });

  it('granting consent stores at most country/region', async () => {
    const { svc, prisma } = makeService(baseSettings);
    await svc.setConsent('u1', { status: 'granted', locationUsageMode: 'country_only', detectedCountry: 'DE' });
    const update = (prisma.userSettings.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.detectedCountry).toBe('DE');
    expect(update.data.detectedRegion).toBeNull(); // country_only → no region stored
  });
});
