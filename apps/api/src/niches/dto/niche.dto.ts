import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class DiscoverNichesDto {
  @ApiPropertyOptional({ description: 'Explicit market name shown to the LLM during starter discovery.' })
  @IsOptional()
  @IsString()
  market?: string;

  @ApiPropertyOptional({ type: [String], description: 'Market scope hints or target locations for discovery.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Optional direction hints for opportunity generation.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  directions?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Optional subtheme hints for opportunity generation.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subthemes?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Optional audience hints for opportunity generation.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audiences?: string[];

  @ApiPropertyOptional({ enum: ['consumer', 'smb', 'enterprise', 'agency', 'government', 'mixed'] })
  @IsOptional()
  @IsIn(['consumer', 'smb', 'enterprise', 'agency', 'government', 'mixed'])
  buyerType?: 'consumer' | 'smb' | 'enterprise' | 'agency' | 'government' | 'mixed';

  @ApiPropertyOptional({ type: [String], description: 'Optional product format hints for opportunity generation.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productFormats?: string[];

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  riskTolerance?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({ enum: ['2_weeks', '6_weeks', '3_months'] })
  @IsOptional()
  @IsIn(['2_weeks', '6_weeks', '3_months'])
  mvpTimeline?: '2_weeks' | '6_weeks' | '3_months';

  @ApiPropertyOptional({ enum: ['starter_hypothesis', 'source_backed', 'deep_research'] })
  @IsOptional()
  @IsIn(['starter_hypothesis', 'source_backed', 'deep_research'])
  evidenceMode?: 'starter_hypothesis' | 'source_backed' | 'deep_research';

  @ApiPropertyOptional({ type: [String], description: 'Optional vertical hints for opportunity generation.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  verticals?: string[];

  @ApiPropertyOptional({ description: 'Desired output language.' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Optional operator role/persona for the discovery request.' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Whether to include investor-radar opportunities.' })
  @IsOptional()
  @IsBoolean()
  investorLens?: boolean;

  @ApiPropertyOptional({ enum: ['find_opportunities'] })
  @IsOptional()
  @IsIn(['find_opportunities'])
  mode?: 'find_opportunities';

  @ApiPropertyOptional({ description: 'Optional market scope hint.' })
  @IsOptional()
  @IsString()
  marketScope?: string;

  @ApiPropertyOptional({
    description:
      'Must be true to re-run discovery on a project that already has opportunities — discovery replaces all existing niches (and cascades to their Product Document Packs), it does not add to them.',
  })
  @IsOptional()
  @IsBoolean()
  confirmReplace?: boolean;
}

export class CompareMarketsDto {
  @ApiPropertyOptional({ type: [String], description: 'ISO country codes; defaults to the niche market profile.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];
}

export class CreateOpportunityFromIdeaDto {
  @ApiPropertyOptional({ description: "Full founder idea text (required, min 40 characters — enforced in the service for a specific error code)." })
  @IsString()
  founderIdea!: string;

  @ApiPropertyOptional({ description: 'Target market hint.' })
  @IsOptional()
  @IsString()
  targetMarket?: string;

  @ApiPropertyOptional({ description: 'Target audience hint.' })
  @IsOptional()
  @IsString()
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'Product format hint.' })
  @IsOptional()
  @IsString()
  productFormat?: string;

  @ApiPropertyOptional({ description: 'Desired output language.' })
  @IsOptional()
  @IsString()
  outputLanguage?: string;

  @ApiPropertyOptional({ enum: ['starter_hypothesis', 'source_backed', 'deep_research'], description: 'Evidence mode.' })
  @IsOptional()
  @IsIn(['starter_hypothesis', 'source_backed', 'deep_research'])
  evidenceMode?: 'starter_hypothesis' | 'source_backed' | 'deep_research';

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'], description: 'Risk tolerance.' })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  riskTolerance?: 'low' | 'medium' | 'high';
}
