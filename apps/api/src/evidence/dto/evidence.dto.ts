import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { ClaimType } from '@signalkit/shared';

const CLAIM_TYPES: ClaimType[] = [
  'market_demand', 'competition', 'willingness_to_pay', 'local_fit', 'regulatory_risk',
  'mvp_feasibility', 'ai_leverage', 'distribution_access', 'retention_potential',
  'monetization', 'user_pain', 'timing', 'technology_shift',
];

export class CreateClaimDto {
  // Set from the route param by the controller.
  projectId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  text!: string;

  @ApiProperty({ enum: CLAIM_TYPES })
  @IsIn(CLAIM_TYPES)
  type!: ClaimType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  market?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  supportingEvidenceIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  contradictingEvidenceIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  assumptionIds?: string[];

  @ApiPropertyOptional({ enum: ['human', 'llm', 'system', 'imported'] })
  @IsOptional()
  @IsIn(['human', 'llm', 'system', 'imported'])
  generatedBy?: string;
}

export class LinkEvidenceDto {
  @ApiProperty()
  @IsString()
  claimId!: string;

  @ApiProperty()
  @IsString()
  evidenceItemId!: string;

  @ApiProperty({ enum: ['supports', 'contradicts', 'contextual'] })
  @IsIn(['supports', 'contradicts', 'contextual'])
  role!: string;
}

export class CreateAssumptionDto {
  projectId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  claimId?: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  impactIfWrong?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;
}

export class CreateQuestionDto {
  projectId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  claimId?: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;
}
