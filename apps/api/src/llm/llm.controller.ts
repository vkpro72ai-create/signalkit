import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { LlmProvidersService } from './providers.service';
import { LlmModelsService } from './models.service';
import { LlmConnectionsService } from './connections.service';
import { LlmSettingsService } from './settings.service';
import { LlmUsageService } from './usage.service';
import { LlmRouterService } from './llm-router.service';
import type { LLMTaskType } from '@signalkit/shared';
import { ConnectProviderDto, TestProviderDto, UpdateLlmSettingsDto, EstimateDto } from './dto/llm.dto';

@ApiTags('llm')
@Controller('llm')
export class LlmController {
  constructor(
    private readonly providers: LlmProvidersService,
    private readonly models: LlmModelsService,
    private readonly connections: LlmConnectionsService,
    private readonly settings: LlmSettingsService,
    private readonly usage: LlmUsageService,
    private readonly router: LlmRouterService,
  ) {}

  // ── Providers & catalog (authenticated; catalog is global) ──────────────
  @Get('providers')
  @ApiOperation({ summary: 'List supported providers' })
  listProviders() {
    return this.providers.list();
  }

  @Get('models')
  @ApiOperation({ summary: 'List the model catalog' })
  listModels() {
    return this.models.list();
  }

  @Post('models/refresh')
  @ApiOperation({ summary: 'Refresh the catalog from OpenRouter' })
  refreshModels() {
    return this.models.refresh();
  }

  @Post('models/:id/benchmark')
  @ApiOperation({ summary: 'Record a benchmark run for a model' })
  benchmark(@Param('id') id: string, @Body('latencyMs') latencyMs?: number) {
    return this.models.benchmark(id, latencyMs ?? 0);
  }

  // ── Connections (BYOK; secrets never returned) ──────────────────────────
  @Get('connections')
  @RequirePermissions('workspace:read')
  @ApiOperation({ summary: 'List workspace connections (masked)' })
  listConnections(@Query('workspaceId') workspaceId: string) {
    return this.connections.list(workspaceId);
  }

  @Post('providers/connect')
  @RequirePermissions('llm:manage_connections')
  @ApiOperation({ summary: 'Connect a provider (key encrypted at rest)' })
  connect(@Body() dto: ConnectProviderDto, @CurrentUser() user: JwtPayload) {
    return this.connections.connect(dto, user.sub);
  }

  @Post('providers/test')
  @ApiOperation({ summary: 'Test a raw key without storing it' })
  test(@Body() dto: TestProviderDto) {
    return this.connections.testRaw(dto);
  }

  @Post('connections/:id/test')
  @RequirePermissions('llm:manage_connections')
  @ApiOperation({ summary: 'Test a stored connection' })
  testStored(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.connections.testStored(id, workspaceId);
  }

  @Delete('connections/:id')
  @RequirePermissions('llm:manage_connections')
  @ApiOperation({ summary: 'Revoke and delete a connection' })
  remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @CurrentUser() user: JwtPayload) {
    return this.connections.remove(id, workspaceId, user.sub);
  }

  // ── Settings & usage ────────────────────────────────────────────────────
  @Get('settings')
  @RequirePermissions('workspace:read')
  @ApiOperation({ summary: 'Get workspace LLM settings' })
  getSettings(@Query('workspaceId') workspaceId: string) {
    return this.settings.get(workspaceId);
  }

  @Put('settings')
  @RequirePermissions('llm:manage_settings')
  @ApiOperation({ summary: 'Update workspace LLM routing settings' })
  updateSettings(@Body() dto: UpdateLlmSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.settings.update(dto, user.sub);
  }

  @Get('usage')
  @RequirePermissions('workspace:read')
  @ApiOperation({ summary: 'LLM usage summary for a workspace' })
  getUsage(@Query('workspaceId') workspaceId: string) {
    return this.usage.summary(workspaceId);
  }

  @Post('estimate')
  @RequirePermissions('workspace:read')
  @ApiOperation({ summary: 'Estimate the cost of a task before running it' })
  estimate(@Body() dto: EstimateDto) {
    return this.router.estimate(
      dto.workspaceId,
      dto.taskType as LLMTaskType,
      dto.estimatedInputTokens ?? 2000,
      dto.estimatedOutputTokens ?? 1500,
    );
  }
}
