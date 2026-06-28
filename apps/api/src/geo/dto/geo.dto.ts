import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { MARKET_SCOPES, type MarketScope } from '@signalkit/shared';

const SCOPES = MARKET_SCOPES as readonly string[];

export class SetGeoConsentDto {
  @ApiProperty({ enum: ['granted', 'denied', 'revoked'] })
  @IsIn(['granted', 'denied', 'revoked'])
  status!: 'granted' | 'denied' | 'revoked';

  @ApiPropertyOptional({ enum: ['off', 'country_only', 'region_only'] })
  @IsOptional()
  @IsIn(['off', 'country_only', 'region_only'])
  locationUsageMode?: 'off' | 'country_only' | 'region_only';

  @ApiPropertyOptional({ description: 'Country-level only — never coordinates.' })
  @IsOptional()
  @IsString()
  detectedCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detectedRegion?: string;
}

export class ResolveMarketDto {
  @ApiProperty({ enum: SCOPES })
  @IsIn(SCOPES)
  scope!: MarketScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  countries?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  regions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketLanguage?: string;
}
