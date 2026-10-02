import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { CountryCode, LocaleCode, SourceAdapterType } from '@signalkit/shared';
import { optionalEnv } from '@signalkit/config';
import { PrismaService } from '../prisma/prisma.service';
import { createSourceAdapter } from './adapters';
import { normalizeItem, extractSignal } from './normalize';
import type { CollectedRaw } from './types';

interface IngestJobData {
  sourceRefId: string;
  content?: string | null;
}

export interface IngestOutcome {
  status: 'parsed' | 'failed' | 'configuration_needed' | 'empty';
  collected: number;
  signals: number;
  message?: string;
}

const QUEUE_NAME = 'source-ingestion';

/**
 * Runs the ingestion pipeline: fetch/collect → language-detect → normalize →
 * signal-extract → persist. Uses BullMQ when REDIS_URL is set, otherwise runs
 * inline in-process (so local/dev and tests work without Redis). The 7 pipeline
 * stages (fetch, parse, language-detect, signal-extract, normalize, dedupe,
 * evidence-create) execute in sequence here; evidence-create lands in Session 8.
 */
@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private queue: Queue<IngestJobData> | null = null;
  private worker: Worker<IngestJobData> | null = null;
  private connection: IORedis | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const redisUrl = optionalEnv('REDIS_URL', '');
    if (!redisUrl) {
      this.logger.log('REDIS_URL not set — source ingestion runs inline (no queue).');
      return;
    }
    try {
      this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      this.queue = new Queue<IngestJobData>(QUEUE_NAME, { connection: this.connection });
      this.worker = new Worker<IngestJobData>(
        QUEUE_NAME,
        async (job) => {
          await this.ingest(job.data.sourceRefId, job.data.content ?? null);
        },
        { connection: this.connection },
      );
      this.logger.log('Source ingestion using BullMQ queue.');
    } catch (err) {
      this.logger.warn(`Queue init failed, falling back to inline: ${String(err)}`);
      this.queue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  /** Enqueue (or, without Redis, run inline) the ingestion for a source. */
  async enqueue(sourceRefId: string, content?: string | null): Promise<IngestOutcome | { queued: true }> {
    if (this.queue) {
      await this.queue.add('ingest', { sourceRefId, content }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
      return { queued: true };
    }
    return this.ingest(sourceRefId, content ?? null);
  }

  /** The full pipeline for one source reference. Idempotent: clears prior items first. */
  async ingest(sourceRefId: string, firstRunContent: string | null = null): Promise<IngestOutcome> {
    const ref = await this.prisma.sourceReference.findUnique({ where: { id: sourceRefId } });
    if (!ref) return { status: 'failed', collected: 0, signals: 0, message: 'source_not_found' };

    const project = await this.prisma.project.findUnique({ where: { id: ref.projectId } });
    const market = {
      country: (project?.targetCountry ?? null) as CountryCode | null,
      marketLanguage: (project?.marketLanguage ?? 'en') as LocaleCode,
    };
    const adapterType = ref.adapter as SourceAdapterType;
    const adapter = createSourceAdapter(adapterType);

    // Idempotency: remove prior raw/normalized/signals for this source.
    await this.clearPrior(sourceRefId, ref.projectId);

    // Collect (or accept manual content).
    let collected: { content: string; url: string | null; language: string | null; country: string | null }[] = [];
    if (adapterType === 'manual') {
      if (!firstRunContent?.trim()) {
        return this.recordFailure(ref, 'empty', 'No manual content to ingest');
      }
      collected = [{ content: firstRunContent.trim(), url: ref.url, language: null, country: ref.country }];
    } else {
      const result = await adapter.collect({ url: ref.url, market });
      if (!result.ok) {
        const status = result.reason === 'configuration_needed' ? 'configuration_needed' : 'failed';
        return this.recordFailure(ref, status, result.message);
      }
      collected = result.items.map((i) => ({ content: i.content, url: i.url, language: i.language, country: i.country }));
    }

    // Persist raw → normalize → signal for each item.
    let signals = 0;
    for (const item of collected) {
      const raw = await this.prisma.rawSourceItem.create({
        data: {
          workspaceId: ref.workspaceId,
          projectId: ref.projectId,
          sourceRefId,
          adapter: adapterType,
          content: item.content,
          url: item.url,
          language: item.language,
          country: item.country,
          status: 'collected',
        },
      });

      const rawForPipeline: CollectedRaw = {
        content: item.content,
        url: item.url,
        title: null,
        publisher: null,
        language: item.language as LocaleCode | null,
        country: item.country as CountryCode | null,
        userProvided: adapterType === 'manual',
      };

      const normalized = normalizeItem(rawForPipeline, market);
      await this.prisma.normalizedSourceItem.create({
        data: {
          rawSourceItemId: raw.id,
          summary: normalized.summary,
          extractedEntities: normalized.extractedEntities,
          detectedMarket: normalized.detectedMarket,
          detectedLanguage: normalized.detectedLanguage,
          relevance: normalized.relevance,
        },
      });

      const signal = extractSignal(adapterType, rawForPipeline, normalized);
      await this.prisma.trendSignal.create({
        data: {
          workspaceId: ref.workspaceId,
          projectId: ref.projectId,
          signalType: signal.signalType,
          text: signal.text,
          strengthScore: signal.strengthScore,
          freshnessScore: signal.freshnessScore,
          sourceQuality: signal.sourceQuality,
          topic: signal.topic,
          sourceRefIds: [sourceRefId],
        },
      });
      signals += 1;
      await this.prisma.rawSourceItem.update({ where: { id: raw.id }, data: { status: 'parsed' } });
    }

    return { status: 'parsed', collected: collected.length, signals };
  }

  private async clearPrior(sourceRefId: string, projectId: string): Promise<void> {
    await this.prisma.rawSourceItem.deleteMany({ where: { sourceRefId, status: { not: 'excluded' } } });
    await this.prisma.trendSignal.deleteMany({ where: { projectId, sourceRefIds: { has: sourceRefId } } });
  }

  private async recordFailure(
    ref: { id: string; workspaceId: string; projectId: string; adapter: string; url: string | null; country: string | null },
    status: IngestOutcome['status'],
    message: string,
  ): Promise<IngestOutcome> {
    // A visible failure record — not fake source data.
    await this.prisma.rawSourceItem.create({
      data: {
        workspaceId: ref.workspaceId,
        projectId: ref.projectId,
        sourceRefId: ref.id,
        adapter: ref.adapter,
        content: `[${status}] ${message}`,
        url: ref.url,
        country: ref.country,
        status: 'failed',
      },
    });
    return { status, collected: 0, signals: 0, message };
  }
}
