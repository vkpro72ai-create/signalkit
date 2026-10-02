import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { LlmModule } from '../llm/llm.module';
import { NichesController } from './niches.controller';
import { NichesService } from './niches.service';

/**
 * Trend Discovery & Opportunity Scoring. Builds niches from real signals +
 * evidence, scores them across 17 dimensions (opportunity and confidence kept
 * separate, every score carries a breakdown + evidence-linked explanation), and
 * compares markets per the Session-6 market profiles.
 */
@Module({
  imports: [EvidenceModule, LlmModule],
  controllers: [NichesController],
  providers: [NichesService],
  exports: [NichesService],
})
export class NichesModule {}
