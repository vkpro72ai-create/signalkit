import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import { intEnv } from '@signalkit/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExportStorageService } from './export-storage.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // every hour

/**
 * Marks export jobs as expired when their expiresAt timestamp has passed,
 * and optionally deletes their storage artifacts after the retention window.
 *
 * Closes the lifecycle gap from Session 12 (ready exports never transitioned
 * to expired). Runs on module init and then on a fixed hourly interval.
 */
@Injectable()
export class ExportCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ExportStorageService,
  ) {}

  onModuleInit(): void {
    void this.runCleanup();
    this.timer = setInterval(() => void this.runCleanup(), CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runCleanup(): Promise<void> {
    try {
      await this.expireOldJobs();
      await this.deleteArtifacts();
    } catch (err) {
      this.logger.warn(`Cleanup cycle error: ${String(err)}`);
    }
  }

  /** Transition ready jobs whose expiresAt is in the past to 'expired'. */
  private async expireOldJobs(): Promise<void> {
    const result = await this.prisma.exportJob.updateMany({
      where: { status: 'ready', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} export job(s).`);
    }
  }

  /**
   * Delete artifact files for jobs that have been expired beyond the
   * retention window (EXPORT_RETENTION_DAYS, default 7).
   */
  private async deleteArtifacts(): Promise<void> {
    const retentionDays = intEnv('EXPORT_RETENTION_DAYS', 7);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const staleJobs = await this.prisma.exportJob.findMany({
      where: { status: 'expired', updatedAt: { lt: cutoff } },
      include: { artifact: true },
    });

    for (const job of staleJobs) {
      if (!job.artifact) continue;
      try {
        const { baseDir } = this.storage;
        const { promises: fsp } = await import('fs');
        const dir = path.join(baseDir, job.workspaceId, job.id);
        await fsp.rm(dir, { recursive: true, force: true });
        this.logger.debug(`Deleted artifact dir: ${dir}`);
      } catch {
        // Non-fatal — artifact may already be gone
      }
    }

    if (staleJobs.length > 0) {
      this.logger.log(`Cleaned up artifacts for ${staleJobs.length} expired job(s).`);
    }
  }
}
