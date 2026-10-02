import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { optionalEnv } from '@signalkit/config';
import { PrismaService } from '../prisma/prisma.service';
import { PackService, type GeneratePackOptions } from './pack.service';
import { PRODUCT_PACK_V2_STEPS } from './prompts/product-pack-v2.steps';
import { PRODUCT_PACK_V2_SECTIONS } from './prompts/product-pack-v2.sections';

export type PackGenerationModeInput = 'standard' | 'strong_model';

interface PackGenerationJobData {
  jobId: string;
  resume?: boolean;
}

const QUEUE_NAME = 'pack-generation-jobs';

/**
 * Job-based Product Pack v2 generation (Task 3): the ~20-25min multi-step
 * LLM pipeline used to run entirely inside the HTTP request. `create()` now
 * creates the pack row + job row synchronously (fast) and returns
 * immediately; the actual pipeline runs in the background (BullMQ when
 * REDIS_URL is set, inline `setImmediate` otherwise — same pattern as
 * ExportJobService) and reports per-step progress via
 * ProductPackGenerationStep so a client can poll for staged availability
 * instead of blocking on a single request.
 */
@Injectable()
export class PackGenerationJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PackGenerationJobService.name);
  private queue: Queue<PackGenerationJobData> | null = null;
  private worker: Worker<PackGenerationJobData> | null = null;
  private connection: IORedis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly packService: PackService,
  ) {}

  onModuleInit(): void {
    const redisUrl = optionalEnv('REDIS_URL', '');
    if (!redisUrl) {
      this.logger.log('REDIS_URL not set — pack generation jobs run inline (no queue).');
      return;
    }
    try {
      this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      this.queue = new Queue<PackGenerationJobData>(QUEUE_NAME, { connection: this.connection });
      this.worker = new Worker<PackGenerationJobData>(
        QUEUE_NAME,
        async (job) => {
          await this.process(job.data.jobId, job.data.resume ?? false);
        },
        { connection: this.connection },
      );
      this.logger.log('Pack generation using BullMQ queue.');
    } catch (err) {
      this.logger.warn(`Pack generation queue init failed, falling back to inline: ${String(err)}`);
      this.queue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Create a pack generation job and enqueue (or inline-process) it. Returns
   * as soon as the pack + job rows exist — the caller gets a real packId to
   * navigate to immediately, well before any LLM call has run.
   */
  async create(
    workspaceId: string,
    nicheId: string,
    opts: GeneratePackOptions,
    requestedById: string,
    generationMode: PackGenerationModeInput = 'standard',
  ) {
    if (generationMode === 'strong_model') {
      // No strong-tier model/provider selection exists yet in this codebase
      // (LlmRouterService routes purely by task type, not by capability
      // tier). Fail fast and clearly rather than silently reusing the
      // standard pipeline under a different label — see product-pack-v2
      // Task 3 spec: "Do not implement fake strong behavior."
      const strongModelId = optionalEnv('STRONG_MODEL_ID', '');
      if (!strongModelId) {
        throw new BadRequestException({
          code: 'strong_model_not_configured',
          message: 'Strong-model generation mode is not configured for this environment yet.',
        });
      }
    }

    const { pack, projectId } = await this.packService.createPackShellForJob(workspaceId, nicheId, opts);

    const job = await this.prisma.productPackGenerationJob.create({
      data: {
        workspaceId,
        projectId,
        nicheId,
        packId: pack.id,
        status: 'queued',
        generationMode,
        depth: opts.depth,
        verticalTemplate: opts.vertical,
        language: opts.language ?? null,
        requestedById,
        totalExpectedDocumentCount: PRODUCT_PACK_V2_SECTIONS.length,
      },
    });

    // Pre-create one `pending` row per pipeline step so a client's very
    // first poll already sees the full step list (untouched steps as
    // "pending"), not just whichever step happens to have started.
    await this.prisma.productPackGenerationStep.createMany({
      data: PRODUCT_PACK_V2_STEPS.map((step) => ({ jobId: job.id, stepKey: step.id, status: 'pending' as const })),
    });

    if (this.queue) {
      await this.queue.add('generate', { jobId: job.id });
    } else {
      // Inline: process in the background, don't block the HTTP response.
      setImmediate(() => {
        this.process(job.id).catch((err: Error) => {
          this.logger.error(`Inline pack generation failed for ${job.id}: ${err.message}`);
        });
      });
    }

    return this.getJob(workspaceId, job.id);
  }

  async getJob(workspaceId: string, jobId: string) {
    const job = await this.prisma.productPackGenerationJob.findFirst({
      where: { id: jobId, workspaceId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Pack generation job not found');
    return job;
  }

  /** Latest generation job for a pack — used by the pack detail page to show progress without needing a separate jobId. */
  async getJobForPack(workspaceId: string, packId: string) {
    const job = await this.prisma.productPackGenerationJob.findFirst({
      where: { packId, workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!job) throw new NotFoundException('No generation job found for this pack');
    return job;
  }

  /**
   * The failed-pack diagnostic wall: the latest job for a pack plus derived
   * signals the UI needs — whether the opportunity's context changed after the
   * run started (which would make a resume inconsistent), so the UI can warn
   * "restart recommended" before the user chooses resume vs. regenerate.
   */
  async getDiagnosticsForPack(workspaceId: string, packId: string) {
    const job = await this.getJobForPack(workspaceId, packId);
    const niche = await this.prisma.niche.findUnique({
      where: { id: job.nicheId },
      select: { updatedAt: true },
    });
    const contextChanged = Boolean(job.startedAt && niche && niche.updatedAt > job.startedAt);
    return { job, contextChanged };
  }

  /**
   * Retry a failed / partially-ready job IN PLACE: reuse the same pack, keep
   * completed steps' outputs, and re-run only the failed/remaining steps
   * (resume). Refuses if the job is not in a terminal state, or if any
   * completed step lacks a resumable payload (in which case the client should
   * regenerate a fresh pack instead).
   */
  async retry(workspaceId: string, jobId: string) {
    const job = await this.prisma.productPackGenerationJob.findFirst({
      where: { id: jobId, workspaceId },
      include: { steps: true },
    });
    if (!job) throw new NotFoundException('Pack generation job not found');
    if (job.status !== 'failed' && job.status !== 'partially_ready') {
      throw new ConflictException({
        code: 'not_retryable',
        message: 'Only a failed or partially-ready generation job can be retried.',
      });
    }

    // A resume can only skip completed steps whose structured output survived.
    const unavailable = job.steps
      .filter((step) => step.status === 'completed')
      .filter((step) => {
        const meta = (step.metadata ?? {}) as { resumePayload?: unknown; resumePayloadOmitted?: boolean };
        return meta.resumePayloadOmitted || !meta.resumePayload;
      })
      .map((step) => step.stepKey);
    if (unavailable.length > 0) {
      throw new ConflictException({
        code: 'resume_unavailable',
        message: `Cannot resume — completed step(s) ${unavailable.join(', ')} have no resumable payload. Regenerate the pack instead.`,
      });
    }

    // Reset every non-completed step back to pending; keep completed steps.
    await this.prisma.productPackGenerationStep.updateMany({
      where: { jobId, status: { in: ['failed', 'pending', 'running', 'repairing'] } },
      data: { status: 'pending', errorCode: null, errorReason: null },
    });

    const retryCount = Number(((job.metadata ?? {}) as { retryCount?: number }).retryCount ?? 0) + 1;
    await this.prisma.productPackGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        errorCode: null,
        errorReason: null,
        completedAt: null,
        metadata: { ...((job.metadata ?? {}) as object), retryCount },
      },
    });

    if (this.queue) {
      await this.queue.add('generate', { jobId, resume: true });
    } else {
      setImmediate(() => {
        this.process(jobId, true).catch((err: Error) => {
          this.logger.error(`Inline pack generation retry failed for ${jobId}: ${err.message}`);
        });
      });
    }

    return this.getJob(workspaceId, jobId);
  }

  // ── Worker body ──────────────────────────────────────────────────────────

  async process(jobId: string, resume = false): Promise<void> {
    const job = await this.prisma.productPackGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      this.logger.error(`Pack generation job ${jobId} not found`);
      return;
    }

    await this.prisma.productPackGenerationJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const result = await this.packService.generateV2ForJob(job, { resume });
      // "Build-ready" requires every step to have completed AND the quality
      // gate to not be a hard fail — a 'warnings' gate (e.g. starter-hypothesis
      // evidence with no sources) is still a usable, exportable pack elsewhere
      // in the app, so only 'failed' blocks build-ready here.
      const buildReady = result.allStepsCompleted && result.qualityGate.status !== 'failed';
      await this.prisma.productPackGenerationJob.update({
        where: { id: jobId },
        data: {
          status: result.allStepsCompleted ? 'completed' : 'partially_ready',
          buildReady,
          progressPercent: 100,
          readyDocumentCount: result.documentCount,
          completedAt: new Date(),
        },
      });
      this.logger.log(
        `Pack generation job ${jobId} finished: ${result.allStepsCompleted ? 'completed' : 'partially_ready'} (${result.documentCount} documents, buildReady=${buildReady})`,
      );
    } catch (err) {
      const response = err && typeof err === 'object' && 'getResponse' in err && typeof (err as { getResponse: unknown }).getResponse === 'function'
        ? (err as { getResponse: () => unknown }).getResponse()
        : null;
      const errorCode = response && typeof response === 'object' && 'code' in response ? String((response as { code: unknown }).code) : 'product_pack_generation_failed';
      const errorReason = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
      await this.prisma.productPackGenerationJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorCode, errorReason, completedAt: new Date() },
      });
      this.logger.error(`Pack generation job ${jobId} failed: ${errorCode} — ${errorReason}`);
    }
  }
}
