import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  resolveMarketProfile,
  type GeoFacts,
  type LocaleCode,
  type MarketProfile,
  type MarketScope,
} from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ResolveMarketDto, SetGeoConsentDto } from './dto/geo.dto';

/** Headers (set by CDNs/proxies) that carry a coarse, country-level location. */
const COUNTRY_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code', 'x-geo-country'];

@Injectable()
export class GeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCountries() {
    return this.prisma.country.findMany({ orderBy: { code: 'asc' } });
  }

  listRegions(countryCode?: string) {
    return this.prisma.region.findMany({
      where: countryCode ? { countryCode } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  /** Coarse country suggestion from request headers. Country-only, never stored here. */
  detectCountry(headers: Record<string, string | string[] | undefined>): { country: string | null } {
    for (const h of COUNTRY_HEADERS) {
      const raw = headers[h];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value && /^[A-Za-z]{2}$/.test(value)) return { country: value.toUpperCase() };
    }
    return { country: null };
  }

  /** Record geolocation consent for the current user. Stores at most country/region. */
  async setConsent(userId: string, dto: SetGeoConsentDto) {
    await this.ensureSettings(userId);
    const updated = await this.prisma.userSettings.update({
      where: { userId },
      data: {
        geoConsentStatus: dto.status,
        // Disable usage unless explicitly granted with a usage mode.
        locationUsageMode: dto.status === 'granted' ? dto.locationUsageMode ?? 'country_only' : 'off',
        detectedCountry: dto.status === 'granted' ? dto.detectedCountry ?? null : null,
        detectedRegion:
          dto.status === 'granted' && dto.locationUsageMode === 'region_only' ? dto.detectedRegion ?? null : null,
      },
    });
    return updated;
  }

  /** Forget all location data and revoke consent. */
  async clearLocation(userId: string) {
    await this.ensureSettings(userId);
    return this.prisma.userSettings.update({
      where: { userId },
      data: {
        geoConsentStatus: 'revoked',
        locationUsageMode: 'off',
        detectedCountry: null,
        detectedRegion: null,
      },
    });
  }

  /**
   * Resolve a concrete market for the user under a requested scope. Consent
   * gating happens in the pure resolver; failures map to a 403 with the reason.
   */
  async resolveMarket(userId: string, dto: ResolveMarketDto): Promise<MarketProfile> {
    const settings = await this.ensureSettings(userId);
    const geo: GeoFacts = {
      consentStatus: settings.geoConsentStatus,
      locationUsageMode: settings.locationUsageMode,
      detectedCountry: settings.detectedCountry,
      detectedRegion: settings.detectedRegion,
      countryOfResidence: settings.countryOfResidence,
    };
    const marketLanguage = await this.deriveMarketLanguage(dto, settings.defaultDocumentLanguage as LocaleCode);

    const resolution = resolveMarketProfile({
      scope: dto.scope as MarketScope,
      geo,
      country: dto.country ?? null,
      region: dto.region ?? null,
      countries: dto.countries,
      regions: dto.regions,
      marketLanguage,
    });
    if (!resolution.ok) {
      throw new ForbiddenException({ code: resolution.reason, message: `Market resolution failed: ${resolution.reason}` });
    }
    return resolution.market;
  }

  /** Market language: explicit → primary language of the chosen country → user default. */
  private async deriveMarketLanguage(dto: ResolveMarketDto, fallback: LocaleCode): Promise<LocaleCode> {
    if (dto.marketLanguage) return dto.marketLanguage as LocaleCode;
    const code = dto.country ?? dto.countries?.[0] ?? null;
    if (code) {
      const country = await this.prisma.country.findUnique({ where: { code } });
      if (country) return country.primaryLanguage as LocaleCode;
    }
    return fallback;
  }

  private async ensureSettings(userId: string) {
    const existing = await this.prisma.userSettings.findUnique({ where: { userId } });
    return existing ?? this.prisma.userSettings.create({ data: { userId } });
  }

  /** Used by callers that audit geo changes. */
  recordConsentAudit(workspaceId: string, userId: string, status: string) {
    return this.audit.record({
      workspaceId,
      action: 'user.settings_updated',
      actorId: userId,
      subjectType: 'GeoConsent',
      metadata: { geoConsentStatus: status },
    });
  }
}
