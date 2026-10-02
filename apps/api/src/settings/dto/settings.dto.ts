import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_LOCALES, type LocaleCode } from '@signalkit/shared';

const LOCALES = SUPPORTED_LOCALES as readonly string[];

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  interfaceLocale?: LocaleCode;

  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  defaultDocumentLanguage?: LocaleCode;

  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  fallbackLanguage?: LocaleCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: ['unknown', 'granted', 'denied', 'revoked'] })
  @IsOptional()
  @IsIn(['unknown', 'granted', 'denied', 'revoked'])
  geoConsentStatus?: 'unknown' | 'granted' | 'denied' | 'revoked';

  @ApiPropertyOptional({ enum: ['off', 'country_only', 'region_only'] })
  @IsOptional()
  @IsIn(['off', 'country_only', 'region_only'])
  locationUsageMode?: 'off' | 'country_only' | 'region_only';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryOfResidence?: string;
}

export class UpdateWorkspaceSettingsDto {
  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  defaultLocale?: LocaleCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultMarketCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultMarketRegion?: string;

  @ApiPropertyOptional({ enum: ['byok', 'platform'] })
  @IsOptional()
  @IsIn(['byok', 'platform'])
  defaultLlmMode?: 'byok' | 'platform';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  whiteLabelEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideSignalKitBrand?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiEngineName?: string;
}
