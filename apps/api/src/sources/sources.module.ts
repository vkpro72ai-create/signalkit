import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { IngestionService } from './ingestion.service';

/**
 * Source ingestion: adapters, the BullMQ-or-inline pipeline, and the
 * project-scoped sources/signals API. Produces RawSourceItem → NormalizedSourceItem
 * → TrendSignal, ready for the Evidence Graph (Session 8).
 */
@Module({
  controllers: [SourcesController],
  providers: [SourcesService, IngestionService],
  exports: [SourcesService, IngestionService],
})
export class SourcesModule {}
