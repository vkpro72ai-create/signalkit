import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Studio' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional explicit slug; generated if omitted.' })
  @IsOptional()
  @IsString()
  slug?: string;
}
