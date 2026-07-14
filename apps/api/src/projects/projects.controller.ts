import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, SetProjectArchivedDto } from './dto/project.dto';

@ApiTags('projects')
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'List projects in a workspace (archived hidden by default; ?includeArchived=true for the full history)' })
  list(@Param('workspaceId') workspaceId: string, @Query('includeArchived') includeArchived?: string) {
    return this.projects.listForWorkspace(workspaceId, { includeArchived: includeArchived === 'true' });
  }

  @Post()
  @RequirePermissions('project:create')
  @ApiOperation({ summary: 'Create a project' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projects.create(workspaceId, user.sub, dto);
  }

  @Get(':id')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'Get a project' })
  get(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.projects.getById(workspaceId, id);
  }

  @Patch(':id/archive')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: 'Archive or reactivate a research project (hide/show it in the default list)' })
  setArchived(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: SetProjectArchivedDto,
  ) {
    return this.projects.setArchived(workspaceId, id, dto.archived);
  }

  @Delete(':id')
  @RequirePermissions('project:delete')
  @ApiOperation({ summary: 'Delete a research project and everything scoped under it' })
  delete(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.projects.delete(workspaceId, id);
  }
}
