import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LLM_PROVIDER_TYPES, type LLMProviderType } from '@signalkit/shared';

const PROVIDERS = LLM_PROVIDER_TYPES as readonly string[];

export class ConnectProviderDto {
  @ApiProperty()
  @IsString()
  workspaceId!: string;

  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: LLMProviderType;

  @ApiProperty({ description: 'Plaintext API key — encrypted at rest, never returned.' })
  @IsString()
  @MinLength(8)
  apiKey!: string;

  @ApiProperty()
  @IsString()
  label!: string;

  @ApiPropertyOptional({ description: 'Required for openai_compatible / custom.' })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'If true, connection is scoped to the current user.' })
  @IsOptional()
  @IsBoolean()
  userScoped?: boolean;

  @ApiPropertyOptional({ description: 'Optionally select this model as the workspace default after connecting.' })
  @IsOptional()
  @IsString()
  defaultModelId?: string;
}

export class TestProviderDto {
  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: LLMProviderType;

  @ApiProperty()
  @IsString()
  apiKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseUrl?: string;
}

export class RoutingRuleDto {
  @ApiProperty()
  @IsString()
  taskType!: string;

  @ApiProperty()
  @IsString()
  modelId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fallbackModelId?: string | null;
}

export class EstimateDto {
  @ApiProperty()
  @IsString()
  workspaceId!: string;

  @ApiProperty({ description: 'LLM task type, e.g. product_vision_generation' })
  @IsString()
  taskType!: string;

  @ApiPropertyOptional({ default: 2000 })
  @IsOptional()
  estimatedInputTokens?: number;

  @ApiPropertyOptional({ default: 1500 })
  @IsOptional()
  estimatedOutputTokens?: number;
}

export class UpdateLlmSettingsDto {
  @ApiProperty()
  @IsString()
  workspaceId!: string;

  @ApiPropertyOptional({ enum: ['byok', 'platform'] })
  @IsOptional()
  @IsIn(['byok', 'platform'])
  mode?: 'byok' | 'platform';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultModelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fallbackModelId?: string;

  @ApiPropertyOptional({ type: [RoutingRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingRuleDto)
  routingRules?: RoutingRuleDto[];
}

export class LlmSmokeDto {
  @ApiProperty()
  @IsString()
  workspaceId!: string;

  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: LLMProviderType;

  @ApiProperty()
  @IsString()
  modelId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  prompt!: string;
}
