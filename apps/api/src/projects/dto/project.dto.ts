import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { MARKET_SCOPES, type MarketScope } from '@signalkit/shared';

const SCOPES = MARKET_SCOPES as readonly string[];

export class CreateProjectDto {
  @ApiProperty({ example: 'WhatsApp AI sales copilot for clinics' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ enum: SCOPES })
  @IsOptional()
  @IsIn(SCOPES)
  marketScope?: MarketScope;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 (single-country scopes)' })
  @IsOptional()
  @IsString()
  targetCountry?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-2 (region scope)' })
  @IsOptional()
  @IsString()
  targetRegion?: string;

  @ApiPropertyOptional({ type: [String], description: 'Multi-market comparison' })
  @IsOptional()
  @IsArray()
  targetCountries?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  targetRegions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketLanguage?: string;
}

export class SetProjectArchivedDto {
  @ApiProperty({ description: 'true to archive (hide from the default list), false to reactivate' })
  @IsBoolean()
  archived!: boolean;
}
