import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RecordGeneratedDto {
  @IsString()
  branchName!: string;

  @IsString()
  commitSha!: string;
}

const MIGRATION_SAFETY_CLASSES = ['none', 'safe_additive_candidate', 'manual_review_required', 'destructive_blocked'] as const;

export class RecordTestResultDto {
  @IsBoolean()
  testsPassed!: boolean;

  @IsIn(MIGRATION_SAFETY_CLASSES)
  migrationSafety!: (typeof MIGRATION_SAFETY_CLASSES)[number];
}

export class ReviewFindingDto {
  @IsString()
  file!: string;

  @IsOptional()
  @IsInt()
  line?: number;

  @IsString()
  summary!: string;

  @IsString()
  category!: string;

  @IsIn(['CONFIRMED', 'PLAUSIBLE'])
  verdict!: 'CONFIRMED' | 'PLAUSIBLE';

  @IsOptional()
  @IsBoolean()
  requiresHumanReview?: boolean;
}

export class RecordReviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewFindingDto)
  findings!: ReviewFindingDto[];
}

export class RecordPullRequestDto {
  @IsInt()
  prNumber!: number;

  @IsString()
  prUrl!: string;
}

export class RecordFailureDto {
  @IsString()
  stage!: string;

  @IsString()
  reason!: string;
}
