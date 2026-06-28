import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ExportType, RoleBriefType } from '@signalkit/shared';

export class CreateExportDto {
  @ApiProperty({ description: 'Export type', example: 'markdown_zip' })
  @IsString()
  type!: ExportType;

  @ApiPropertyOptional({ description: 'Output language (BCP-47)', example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Role brief type if applicable' })
  @IsOptional()
  @IsString()
  roleBrief?: RoleBriefType;

  @ApiPropertyOptional({ description: 'Apply workspace white-label branding' })
  @IsOptional()
  @IsBoolean()
  applyBranding?: boolean;
}

export class ExportJobView {
  id!: string;
  packId!: string;
  workspaceId!: string;
  type!: string;
  language!: string;
  roleBrief!: string | null;
  applyBranding!: boolean;
  status!: string;
  errorCode!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  artifact?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
  } | null;
}
