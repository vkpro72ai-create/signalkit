import {
  Body, Controller, Get, Param, Post, Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { ExportType, LocaleCode, RoleBriefType } from '@signalkit/shared';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ExportJobService } from './export-job.service';
import { CreateExportDto } from './dto/export.dto';

@ApiTags('exports')
@Controller('workspaces/:workspaceId')
export class ExportsController {
  constructor(private readonly jobs: ExportJobService) {}

  @Post('packs/:packId/exports')
  @RequirePermissions('export:create')
  @ApiOperation({ summary: 'Create an export job for a pack' })
  create(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Body() dto: CreateExportDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.jobs.create(
      ws,
      packId,
      user.id,
      dto.type as ExportType,
      (dto.language ?? 'en') as LocaleCode,
      (dto.roleBrief ?? null) as RoleBriefType | null,
      dto.applyBranding ?? false,
    );
  }

  @Get('packs/:packId/exports')
  @RequirePermissions('export:read')
  @ApiOperation({ summary: 'List exports for a pack' })
  list(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.jobs.listForPack(ws, packId);
  }

  @Get('exports/:exportId')
  @RequirePermissions('export:read')
  @ApiOperation({ summary: 'Get export job details' })
  getOne(@Param('workspaceId') ws: string, @Param('exportId') exportId: string) {
    return this.jobs.getJob(ws, exportId);
  }

  @Get('exports/:exportId/status')
  @RequirePermissions('export:read')
  @ApiOperation({ summary: 'Get export job status' })
  async status(@Param('workspaceId') ws: string, @Param('exportId') exportId: string) {
    const job = await this.jobs.getJob(ws, exportId);
    return { status: job.status, errorCode: job.errorCode, exportId: job.id, updatedAt: job.updatedAt };
  }

  @Get('exports/:exportId/download')
  @RequirePermissions('export:read')
  @ApiOperation({ summary: 'Download export artifact' })
  async download(
    @Param('workspaceId') ws: string,
    @Param('exportId') exportId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType } = await this.jobs.download(ws, exportId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return stream;
  }

  @Get('exports/:exportId/manifest')
  @RequirePermissions('export:read')
  @ApiOperation({ summary: 'Get export manifest' })
  manifest(@Param('workspaceId') ws: string, @Param('exportId') exportId: string) {
    return this.jobs.getManifest(ws, exportId);
  }
}
