import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type ResearchUpdateType =
  | 'customer_interview'
  | 'competitor_note'
  | 'landing_result'
  | 'survey_result'
  | 'pricing_feedback'
  | 'legal_note'
  | 'local_market_note'
  | 'investor_feedback'
  | 'internal_team_note'
  | 'ai_agent_implementation_feedback';

export type AssumptionValidationStatus =
  | 'untested'
  | 'supported'
  | 'contradicted'
  | 'invalidated'
  | 'needs_more_data';

export type ReviewAction = 'request_review' | 'approve' | 'request_changes' | 'lock' | 'archive';

const RESEARCH_UPDATE_TYPES: ResearchUpdateType[] = [
  'customer_interview', 'competitor_note', 'landing_result', 'survey_result',
  'pricing_feedback', 'legal_note', 'local_market_note', 'investor_feedback',
  'internal_team_note', 'ai_agent_implementation_feedback',
];

export class SaveDocumentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  changeSummary?: string;
}

export class RestoreVersionDto {
  @ApiProperty()
  @IsString()
  versionId!: string;
}

export class CreateResearchUpdateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ enum: RESEARCH_UPDATE_TYPES })
  @IsEnum(RESEARCH_UPDATE_TYPES)
  type!: ResearchUpdateType;

  @ApiProperty()
  @IsString()
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketContext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  sourceRefs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedDocumentIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedClaimIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedAssumptionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedQuestionIds?: string[];

  @ApiPropertyOptional({ enum: ['positive', 'negative', 'neutral'] })
  @IsOptional()
  @IsString()
  confidenceImpact?: 'positive' | 'negative' | 'neutral';
}

export class UpdateResearchUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedDocumentIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedClaimIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedAssumptionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedQuestionIds?: string[];

  @ApiPropertyOptional({ enum: ['positive', 'negative', 'neutral'] })
  @IsOptional()
  @IsString()
  confidenceImpact?: 'positive' | 'negative' | 'neutral';
}

export class ValidateAssumptionDto {
  @ApiProperty({ enum: ['untested', 'supported', 'contradicted', 'invalidated', 'needs_more_data'] })
  @IsString()
  status!: AssumptionValidationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  linkedEvidenceIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedResearchUpdateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;
}

export class RegenerateAffectedDto {
  @ApiProperty()
  @IsString()
  researchUpdateId!: string;
}
