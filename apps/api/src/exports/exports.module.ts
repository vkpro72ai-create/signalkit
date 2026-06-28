import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportJobService } from './export-job.service';
import { ExportStorageService } from './export-storage.service';
import { ExportManifestService } from './export-manifest.service';
import { ExportRendererService } from './export-renderer.service';
import { ExportPdfService } from './export-pdf.service';
import { ExportCleanupService } from './export-cleanup.service';

/**
 * Export system — Sessions 12–13.
 *
 * Handles the full export job lifecycle (queued → processing → ready → expired).
 * Queue mode uses BullMQ when REDIS_URL is set; otherwise runs inline for
 * local dev and tests. ExportCleanupService runs hourly to expire old jobs
 * and delete stale artifacts beyond the retention window.
 */
@Module({
  controllers: [ExportsController],
  providers: [
    ExportJobService,
    ExportStorageService,
    ExportManifestService,
    ExportRendererService,
    ExportPdfService,
    ExportCleanupService,
  ],
  exports: [ExportJobService],
})
export class ExportsModule {}
