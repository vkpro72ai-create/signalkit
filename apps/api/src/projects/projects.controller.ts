import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/project.dto';

@ApiTags('projects')
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'List projects in a workspace' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.projects.listForWorkspace(workspaceId);
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
}
