import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { SourceAdapterType } from '@signalkit/shared';

const ADAPTER_TYPES: SourceAdapterType[] = [
  'manual',
  'url',
  'search_result',
  'app_store_review',
  'reddit',
  'product_hunt',
  'competitor_website',
  'pricing_page',
  'regulatory_page',
];

export class AddSourceDto {
  @ApiProperty({ enum: ADAPTER_TYPES })
  @IsIn(ADAPTER_TYPES)
  adapterType!: SourceAdapterType;

  @ApiPropertyOptional({ description: 'Required for URL-based adapters.' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'Required for the manual adapter.' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;
}
