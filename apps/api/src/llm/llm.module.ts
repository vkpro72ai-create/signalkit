import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmProvidersService } from './providers.service';
import { LlmModelsService } from './models.service';
import { LlmConnectionsService } from './connections.service';
import { LlmSettingsService } from './settings.service';
import { LlmUsageService } from './usage.service';
import { LlmRouterService } from './llm-router.service';

/**
 * LLM marketplace + router. Providers, model catalog, BYOK connections, routing
 * settings, usage, and the LlmRouterService — the single orchestration point for
 * all AI generation (exported so feature modules inject it instead of calling
 * providers directly).
 */
@Module({
  controllers: [LlmController],
  providers: [
    LlmProvidersService,
    LlmModelsService,
    LlmConnectionsService,
    LlmSettingsService,
    LlmUsageService,
    LlmRouterService,
  ],
  exports: [LlmConnectionsService, LlmModelsService, LlmSettingsService, LlmRouterService],
})
export class LlmModule {}
