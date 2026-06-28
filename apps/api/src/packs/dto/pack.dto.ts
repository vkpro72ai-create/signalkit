import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import type { ProductPackDepth, VerticalTemplate } from '@signalkit/shared';

const DEPTHS: ProductPackDepth[] = ['quick_opportunity', 'build_ready', 'investor_grade', 'agency_client', 'ai_agent_engineering'];
const VERTICALS: VerticalTemplate[] = [
  'b2b_saas', 'mobile_consumer_app', 'marketplace', 'ai_agent_product', 'api_product', 'community_content_product',
  'local_service_saas', 'compliance_saas', 'health_adjacent_product', 'fintech_adjacent_product', 'ecommerce_tool',
  'creator_economy_tool', 'internal_enterprise_tool',
];

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

  @ApiPropertyOptional({ description: 'Enhance documents via LlmRouterService (needs a configured LLM).' })
  @IsOptional()
  @IsBoolean()
  useLlm?: boolean;
}
