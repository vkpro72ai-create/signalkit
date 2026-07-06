import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { SettingsService } from '../settings/settings.service';
import { UpdateWorkspaceSettingsDto } from '../settings/dto/settings.dto';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/workspace.dto';

@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  list(@CurrentUser() user: JwtPayload) {
    return this.workspaces.listForUser(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create a workspace (caller becomes owner)' })
  create(@Body() dto: CreateWorkspaceDto, @CurrentUser() user: JwtPayload) {
    return this.workspaces.create(user.sub, dto);
  }

  @Get(':id')
  @RequirePermissions('workspace:read')
  @ApiOperation({ summary: 'Get a workspace' })
  get(@Param('id') id: string) {
    return this.workspaces.getById(id);
  }

  @Get(':id/settings')
  @RequirePermissions('workspace:read')
  @ApiOperation({ summary: 'Get workspace settings (creating defaults if this workspace never had a settings row)' })
  getSettings(@Param('id') id: string) {
    return this.settings.getWorkspaceSettings(id);
  }

  @Put(':id/settings')
  @RequirePermissions('workspace:update')
  @ApiOperation({ summary: 'Update workspace settings' })
  updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.settings.updateWorkspaceSettings(id, dto, user.sub);
  }
}
