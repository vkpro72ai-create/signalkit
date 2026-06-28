import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional } from 'class-validator';

export class CompareMarketsDto {
  @ApiPropertyOptional({ type: [String], description: 'ISO country codes; defaults to the niche market profile.' })
  @IsOptional()
  @IsArray()
  countries?: string[];
}
