import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class DiscoverNichesDto {
  @ApiPropertyOptional({ description: 'Explicit market name shown to the LLM during starter discovery.' })
  @IsOptional()
  @IsString()
  market?: string;

  @ApiPropertyOptional({ type: [String], description: 'Optional vertical hints for opportunity generation.' })
  @IsOptional()
  @IsArray()
  verticals?: string[];

  @ApiPropertyOptional({ description: 'Desired output language.' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Optional operator role/persona for the discovery request.' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: ['find_opportunities'] })
  @IsOptional()
  @IsIn(['find_opportunities'])
  mode?: 'find_opportunities';
}

export class CompareMarketsDto {
  @ApiPropertyOptional({ type: [String], description: 'ISO country codes; defaults to the niche market profile.' })
  @IsOptional()
  @IsArray()
  countries?: string[];
}
