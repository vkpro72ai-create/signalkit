import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { PacksController } from './packs.controller';
import { GovernanceController } from './governance.controller';
import { PackService } from './pack.service';
import { GovernanceService } from './governance.service';
import { ResearchService } from './research.service';
import { CommentsService } from './comments.service';

/**
 * Product Document Pack 2.0 — the core product output. Generates 27 structured,
 * evidence-backed documents (consistent by construction), enforces quality gates,
 * and stores per-document metadata. AI generation (optional) goes ONLY through
 * LlmRouterService; the deterministic builders are the honest baseline.
 *
 * Session 11 adds: editing, versioning, review workflow, research updates,
 * assumption validation, comments, and governed regeneration.
 */
@Module({
  imports: [LlmModule],
  controllers: [PacksController, GovernanceController],
  providers: [PackService, GovernanceService, ResearchService, CommentsService],
  exports: [PackService],
})
export class PacksModule {}
