import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

/**
 * Evidence Graph & Trust Layer. Turns Session-7 signals into traceable evidence
 * and grounded claims (no claim without a source or assumption), tracks
 * contradictions/assumptions/questions, and exposes an evidence map for exports.
 */
@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
