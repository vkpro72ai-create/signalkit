import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import type { ProductPackDepth, VerticalTemplate } from '@signalkit/shared';

const DEPTHS: ProductPackDepth[] = ['quick_opportunity', 'build_ready', 'investor_grade', 'agency_client', 'ai_agent_engineering'];
const VERTICALS: VerticalTemplate[] = [
  'b2b_saas', 'mobile_consumer_app', 'marketplace', 'ai_agent_product', 'api_product', 'community_content_product',
  'local_service_saas', 'compliance_saas', 'health_adjacent_product', 'fintech_adjacent_product', 'ecommerce_tool',
  'creator_economy_tool', 'internal_enterprise_tool',
];
const GENERATION_MODES = ['standard', 'strong_model'] as const;
export type GenerationModeDto = (typeof GENERATION_MODES)[number];

export class GeneratePackDto {
  @ApiProperty({ enum: DEPTHS })
  @IsIn(DEPTHS)
  depth!: ProductPackDepth;

  @ApiProperty({ enum: VERTICALS })
  @IsIn(VERTICALS)
  vertical!: VerticalTemplate;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Enhance documents via LlmRouterService (needs a configured LLM). When true, generation runs as an async job — see generation-status endpoints.' })
  @IsOptional()
  @IsBoolean()
  useLlm?: boolean;

  @ApiPropertyOptional({
    enum: GENERATION_MODES,
    description: 'standard = current reliable multi-step pipeline. strong_model is scaffolded for a future stronger-model pipeline and fails with strong_model_not_configured until one is wired up — only relevant when useLlm=true.',
  })
  @IsOptional()
  @IsIn(GENERATION_MODES)
  generationMode?: GenerationModeDto;
}
