import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { SourcesService } from './sources.service';
import { AddSourceDto } from './dto/source.dto';

@ApiTags('sources')
@Controller()
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get('sources/adapters')
  @ApiOperation({ summary: 'List source adapters with configuration status' })
  adapters() {
    return this.sources.adapters();
  }

  @Get('workspaces/:workspaceId/projects/:projectId/sources')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'List sources for a project (status/quality/freshness)' })
  list(@Param('workspaceId') workspaceId: string, @Param('projectId') projectId: string) {
    return this.sources.list(workspaceId, projectId);
  }

  @Post('workspaces/:workspaceId/projects/:projectId/sources')
  @RequirePermissions('source:manage')
  @ApiOperation({ summary: 'Add a source and run ingestion' })
  add(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: AddSourceDto,
  ) {
    return this.sources.add(workspaceId, projectId, dto);
  }

  @Get('workspaces/:workspaceId/projects/:projectId/signals')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'List extracted trend signals for a project' })
  signals(@Param('workspaceId') workspaceId: string, @Param('projectId') projectId: string) {
    return this.sources.signals(workspaceId, projectId);
  }

  @Post('workspaces/:workspaceId/sources/:sourceId/retry')
  @RequirePermissions('source:manage')
  @ApiOperation({ summary: 'Retry ingestion for a source' })
  retry(@Param('workspaceId') workspaceId: string, @Param('sourceId') sourceId: string) {
    return this.sources.retry(workspaceId, sourceId);
  }

  @Post('workspaces/:workspaceId/sources/:sourceId/exclude')
  @RequirePermissions('source:manage')
  @ApiOperation({ summary: 'Exclude a source from the project' })
  exclude(@Param('workspaceId') workspaceId: string, @Param('sourceId') sourceId: string) {
    return this.sources.exclude(workspaceId, sourceId);
  }
}
