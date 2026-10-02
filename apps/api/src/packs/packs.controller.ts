import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LocaleCode } from '@signalkit/shared';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { PackService } from './pack.service';
import { PackGenerationJobService } from './pack-generation-job.service';
import { GeneratePackDto } from './dto/pack.dto';

@ApiTags('packs')
@Controller('workspaces/:workspaceId')
export class PacksController {
  constructor(
    private readonly packs: PackService,
    private readonly jobs: PackGenerationJobService,
  ) {}

  /**
   * useLlm=false: unchanged, fast synchronous deterministic generation.
   * useLlm=true: returns quickly with { packId, jobId, status } — the real
   * ~20-25min pipeline runs in the background. Poll
   * GET packs/:packId/generation-status (or pack-generation-jobs/:jobId)
   * for progress.
   */
  @Post('niches/:nicheId/generate-pack')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Generate a Product Document Pack for a niche (async job when useLlm=true)' })
  async generate(
    @Param('workspaceId') ws: string,
    @Param('nicheId') nicheId: string,
    @Body() dto: GeneratePackDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const opts = { depth: dto.depth, vertical: dto.vertical, language: dto.language as LocaleCode | undefined, useLlm: dto.useLlm };
    if (!dto.useLlm) {
      return this.packs.generate(ws, nicheId, opts);
    }
    const job = await this.jobs.create(ws, nicheId, opts, user.sub, dto.generationMode ?? 'standard');
    return shapeJobStatus(job);
  }

  @Get('packs/:packId/generation-status')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get the latest Product Pack generation job status for a pack (progress, staged availability, build-ready)' })
  async generationStatusForPack(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return shapeJobStatus(await this.jobs.getJobForPack(ws, packId));
  }

  @Get('pack-generation-jobs/:jobId')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get a Product Pack generation job status by job id' })
  async generationStatus(@Param('workspaceId') ws: string, @Param('jobId') jobId: string) {
    return shapeJobStatus(await this.jobs.getJob(ws, jobId));
  }

  @Get('packs/:packId/diagnostics')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Failed-pack diagnostic wall: last successful/failed step, doc counts, model, attempts, retryability, context-drift warning' })
  async diagnostics(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    const { job, contextChanged } = await this.jobs.getDiagnosticsForPack(ws, packId);
    return { ...shapeJobStatus(job), contextChanged };
  }

  @Post('pack-generation-jobs/:jobId/retry')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Retry a failed/partial job in place — reuse completed steps, re-run only the failed/remaining steps (same pack)' })
  async retryJob(@Param('workspaceId') ws: string, @Param('jobId') jobId: string) {
    return shapeJobStatus(await this.jobs.retry(ws, jobId));
  }

  @Post('packs/:packId/retry')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Retry the latest failed/partial generation job for a pack in place (resume from the failed step)' })
  async retryPack(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    const latest = await this.jobs.getJobForPack(ws, packId);
    return shapeJobStatus(await this.jobs.retry(ws, latest.id));
  }

  @Get('niches/:nicheId/packs')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List packs for a niche' })
  list(@Param('workspaceId') ws: string, @Param('nicheId') nicheId: string) {
    return this.packs.listForNiche(ws, nicheId);
  }

  @Get('packs')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List every pack in the workspace in one query, optionally scoped to one research project (?projectId=)' })
  listAll(@Param('workspaceId') ws: string, @Query('projectId') projectId?: string) {
    return this.packs.listForWorkspace(ws, projectId);
  }

  @Get('packs/:packId')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get a pack with documents + quality gate' })
  get(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.getPack(ws, packId);
  }

  @Get('packs/:packId/documents')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List a pack’s documents' })
  documents(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.documents(ws, packId);
  }

  @Post('packs/:packId/run-quality-gates')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Re-run quality gates over the pack' })
  runGates(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.runGates(ws, packId);
  }

  @Get('packs/:packId/build-blueprint')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get the Build Blueprint (screen contracts, state matrix, API↔screen map, build readiness)' })
  blueprint(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.getBlueprint(ws, packId);
  }

  @Post('packs/:packId/build-blueprint/regenerate')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Regenerate the Build Blueprint from the current pack context' })
  regenerateBlueprint(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.regenerateBlueprint(ws, packId);
  }

  @Get('packs/:packId/implementation-manifest')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Deterministic implementation-prompt manifest (workstreams, sprints, ordered bounded prompts with dependencies)' })
  implementationManifest(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.getImplementationManifest(ws, packId);
  }
}

/** Shapes a ProductPackGenerationJob (+ steps) row into the polling contract the frontend expects. */
function shapeJobStatus(job: Awaited<ReturnType<PackGenerationJobService['getJob']>>) {
  // Steps are ordered by createdAt asc, which matches the canonical step order.
  const failedStep = job.steps.find((step) => step.status === 'failed');
  const completedSteps = job.steps.filter((step) => step.status === 'completed');
  const lastSuccessfulStep = completedSteps.length > 0 ? completedSteps[completedSteps.length - 1].stepKey : null;
  // In-place resume is possible only from a terminal job whose completed steps
  // all still carry a resumable payload.
  const isTerminalRetryable = job.status === 'failed' || job.status === 'partially_ready';
  const allCompletedResumable = completedSteps.every((step) => {
    const meta = (step.metadata ?? {}) as { resumePayload?: unknown; resumePayloadOmitted?: boolean };
    return Boolean(meta.resumePayload) && !meta.resumePayloadOmitted;
  });
  const retryable = isTerminalRetryable && allCompletedResumable;
  return {
    jobId: job.id,
    packId: job.packId,
    status: job.status,
    generationMode: job.generationMode,
    overallProgress: job.progressPercent,
    currentStep: job.currentStep,
    steps: job.steps.map((step) => ({
      stepKey: step.stepKey,
      status: step.status,
      provider: step.provider,
      model: step.model,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      durationMs: step.durationMs,
      attemptCount: step.attemptCount,
      repairCount: step.repairCount,
      errorCode: step.errorCode,
      errorReason: step.errorReason,
      documentIds: step.documentIds,
    })),
    readyDocumentCount: job.readyDocumentCount,
    totalExpectedDocumentCount: job.totalExpectedDocumentCount,
    buildReady: job.buildReady,
    errorCode: job.errorCode,
    errorReason: job.errorReason,
    // Failed-pack diagnostic fields.
    failedStep: failedStep?.stepKey ?? null,
    lastSuccessfulStep,
    retryable,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}
