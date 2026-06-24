import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const MARKET_SCOPES = [
  'current_location',
  'country_of_residence',
  'manual_country',
  'manual_region',
  'multi_country',
  'global',
] as const;

export class CreateProjectDto {
  @ApiProperty({ example: 'WhatsApp AI sales copilot for clinics' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ enum: MARKET_SCOPES })
  @IsOptional()
  @IsIn(MARKET_SCOPES)
  marketScope?: (typeof MARKET_SCOPES)[number];

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @IsString()
  targetCountry?: string;
}
