import { Module } from '@nestjs/common';
import { SelfImprovePipelineController } from './self-improve-pipeline.controller';
import { SelfImproveAuthzService } from './self-improve-authz.service';
import { SelfImproveRunService } from './self-improve-run.service';
import { SelfImproveDispatchService } from './self-improve-dispatch.service';
import { SelfImproveToolsService } from './self-improve-tools.service';
import { GitHubAppClient } from './github-app-client.service';

/**
 * Layer 2 self-improvement pipeline (Phase L2.1): a separate trust boundary
 * from Layer 1's McpModule. Exports SelfImproveAuthzService (needed by the
 * OAuth consent flow to gate granting SELF_IMPROVE_SCOPE) and
 * SelfImproveToolsService (registered into McpServerService alongside the
 * Layer 1 tools). PrismaService is provided globally.
 */
@Module({
  controllers: [SelfImprovePipelineController],
  providers: [SelfImproveAuthzService, SelfImproveRunService, SelfImproveDispatchService, SelfImproveToolsService, GitHubAppClient],
  exports: [SelfImproveAuthzService, SelfImproveToolsService],
})
export class SelfImproveModule {}
