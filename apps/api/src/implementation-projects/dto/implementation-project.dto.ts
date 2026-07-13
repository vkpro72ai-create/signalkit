import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const FOUNDER_DECISIONS = ['undecided', 'explore', 'generate_pack', 'postpone', 'reject', 'ready_to_commit'] as const;
const AMBITION_MODES = ['cash_flow_business', 'venture_scale', 'unicorn_ambition'] as const;
const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;

export type FounderDecisionInput = (typeof FOUNDER_DECISIONS)[number];
export type AmbitionModeInput = (typeof AMBITION_MODES)[number];

/** The committing founder's own personal verdict on an opportunity (separate from AI scoring). */
export class UpsertFounderVerdictDto {
  @ApiPropertyOptional({ description: 'Personal rating 1–5 (null clears it).', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Personal comment.' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ enum: FOUNDER_DECISIONS })
  @IsOptional()
  @IsIn(FOUNDER_DECISIONS)
  decision?: FounderDecisionInput;
}

/** Promote a Build-Ready pack into a real implementation project (explicit founder gate). */
export class PromoteToProjectDto {
  @ApiProperty({ enum: AMBITION_MODES, description: 'Founder-selected ambition mode.' })
  @IsIn(AMBITION_MODES)
  ambitionMode!: AmbitionModeInput;

  @ApiProperty({ description: 'Must be true — the explicit 6-month founder commitment.' })
  @IsBoolean()
  commitmentConfirmed!: boolean;

  @ApiProperty({ description: 'Must be true — founder confirms they have reviewed the major risks.' })
  @IsBoolean()
  reviewedRisks!: boolean;
}

export class UpdateImplementationProjectDto {
  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: (typeof PROJECT_STATUSES)[number];
}
