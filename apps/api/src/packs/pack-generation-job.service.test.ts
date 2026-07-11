import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PackGenerationJobService } from './pack-generation-job.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PackService } from './pack.service';
import { PRODUCT_PACK_V2_STEPS } from './prompts/product-pack-v2.steps';
import { PRODUCT_PACK_V2_SECTIONS } from './prompts/product-pack-v2.sections';

function makePrisma() {
  const jobCreate = vi.fn().mockResolvedValue({ id: 'job1' });
  const jobUpdate = vi.fn().mockResolvedValue({});
  const jobFindUnique = vi.fn();
  const jobFindFirst = vi.fn();
  const stepCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    productPackGenerationJob: { create: jobCreate, update: jobUpdate, findUnique: jobFindUnique, findFirst: jobFindFirst },
    productPackGenerationStep: { createMany: stepCreateMany },
  } as unknown as PrismaService;
  return { prisma, jobCreate, jobUpdate, jobFindUnique, jobFindFirst, stepCreateMany };
}

function makePackService(overrides: Partial<PackService> = {}) {
  const createPackShellForJob = vi.fn().mockResolvedValue({
    pack: { id: 'pk1' },
    projectId: 'p1',
    ctx: {},
  });
  const generateV2ForJob = vi.fn().mockResolvedValue({
    pack: { id: 'pk1' },
    documentCount: PRODUCT_PACK_V2_SECTIONS.length,
    qualityGate: { status: 'passed' },
    allStepsCompleted: true,
  });
  const packService = {
    createPackShellForJob,
    generateV2ForJob,
    ...overrides,
  } as unknown as PackService;
  return { packService, createPackShellForJob, generateV2ForJob };
}

describe('PackGenerationJobService.create — returns quickly, does not await the pipeline', () => {
  beforeEach(() => {
    vi.stubEnv('REDIS_URL', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates the pack + job rows and returns before the (slow) generation pipeline resolves', async () => {
    const { prisma, jobCreate, jobFindUnique } = makePrisma();
    let resolvePipeline: (() => void) | undefined;
    const pipelinePromise = new Promise<void>((resolve) => { resolvePipeline = resolve; });
    const generateV2ForJob = vi.fn().mockImplementation(async () => {
      await pipelinePromise; // never resolves during this test
      return { pack: { id: 'pk1' }, documentCount: 0, qualityGate: { status: 'passed' }, allStepsCompleted: true };
    });
    const { packService } = makePackService({ generateV2ForJob } as any);
    jobFindUnique.mockResolvedValue({ id: 'job1', workspaceId: 'w1', nicheId: 'n1', packId: 'pk1', depth: 'quick_opportunity', verticalTemplate: 'b2b_saas', language: null });
    const service = new PackGenerationJobService(prisma, packService);
    (service as any).getJob = vi.fn().mockResolvedValue({ id: 'job1', packId: 'pk1', status: 'queued', steps: [] });
    service.onModuleInit();

    const result = await service.create('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }, 'u1');

    expect(result.status).toBe('queued');
    expect(jobCreate).toHaveBeenCalledTimes(1);
    // The pipeline is still awaiting pipelinePromise — create() must not have blocked on it.
    resolvePipeline?.();
    await service.onModuleDestroy();
  });

  it('pre-creates one pending step row per pipeline step', async () => {
    const { prisma, stepCreateMany, jobFindUnique } = makePrisma();
    const { packService } = makePackService();
    jobFindUnique.mockResolvedValue({ id: 'job1', workspaceId: 'w1', nicheId: 'n1', packId: 'pk1', depth: 'quick_opportunity', verticalTemplate: 'b2b_saas', language: null });
    const service = new PackGenerationJobService(prisma, packService);
    (service as any).getJob = vi.fn().mockResolvedValue({ id: 'job1', packId: 'pk1', status: 'queued', steps: [] });
    service.onModuleInit();

    await service.create('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }, 'u1');

    expect(stepCreateMany).toHaveBeenCalledTimes(1);
    const rows = stepCreateMany.mock.calls[0]![0].data as Array<{ stepKey: string; status: string }>;
    expect(rows).toHaveLength(PRODUCT_PACK_V2_STEPS.length);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
    expect(rows.map((r) => r.stepKey)).toContain('bcg_star_evaluation');
  });
});

describe('PackGenerationJobService.create — strong_model generation mode', () => {
  it('fails clearly with strong_model_not_configured and never creates a job/pack when unconfigured', async () => {
    vi.stubEnv('STRONG_MODEL_ID', '');
    const { prisma, jobCreate } = makePrisma();
    const { packService, createPackShellForJob } = makePackService();
    const service = new PackGenerationJobService(prisma, packService);

    await expect(
      service.create('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }, 'u1', 'strong_model'),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'strong_model_not_configured' }) });

    // No pack shell, no job row — a rejected request leaves nothing behind.
    expect(createPackShellForJob).not.toHaveBeenCalled();
    expect(jobCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('defaults to standard mode and proceeds normally when generationMode is omitted', async () => {
    const { prisma, jobFindUnique } = makePrisma();
    const { packService, createPackShellForJob } = makePackService();
    jobFindUnique.mockResolvedValue(null);
    const service = new PackGenerationJobService(prisma, packService);
    (service as any).getJob = vi.fn().mockResolvedValue({ id: 'job1', packId: 'pk1', status: 'queued', steps: [] });

    await service.create('w1', 'n1', { depth: 'quick_opportunity', vertical: 'b2b_saas', useLlm: true }, 'u1');

    expect(createPackShellForJob).toHaveBeenCalledTimes(1);
  });
});

describe('PackGenerationJobService.process — job lifecycle + buildReady', () => {
  it('marks the job completed and buildReady=true when every step finishes and the gate is not a hard fail', async () => {
    const { prisma, jobUpdate, jobFindUnique } = makePrisma();
    jobFindUnique.mockResolvedValue({ id: 'job1', workspaceId: 'w1', nicheId: 'n1', packId: 'pk1', depth: 'quick_opportunity', verticalTemplate: 'b2b_saas', language: null });
    const { packService } = makePackService();
    const service = new PackGenerationJobService(prisma, packService);

    await service.process('job1');

    expect(jobUpdate).toHaveBeenCalledWith({ where: { id: 'job1' }, data: { status: 'running', startedAt: expect.any(Date) } });
    const finalUpdateCall = jobUpdate.mock.calls.at(-1)![0];
    expect(finalUpdateCall.data.status).toBe('completed');
    expect(finalUpdateCall.data.buildReady).toBe(true);
    expect(finalUpdateCall.data.progressPercent).toBe(100);
  });

  it('marks the job partially_ready and buildReady=false when the pipeline stops early with documents already persisted', async () => {
    const { prisma, jobUpdate, jobFindUnique } = makePrisma();
    jobFindUnique.mockResolvedValue({ id: 'job1', workspaceId: 'w1', nicheId: 'n1', packId: 'pk1', depth: 'quick_opportunity', verticalTemplate: 'b2b_saas', language: null });
    const { packService } = makePackService({
      generateV2ForJob: vi.fn().mockResolvedValue({
        pack: { id: 'pk1' }, documentCount: 8, qualityGate: { status: 'failed' }, allStepsCompleted: false,
      }),
    } as any);
    const service = new PackGenerationJobService(prisma, packService);

    await service.process('job1');

    const finalUpdateCall = jobUpdate.mock.calls.at(-1)![0];
    expect(finalUpdateCall.data.status).toBe('partially_ready');
    expect(finalUpdateCall.data.buildReady).toBe(false);
  });

  it('marks the job failed with errorCode/errorReason when the pipeline throws (e.g. BCG hard failure)', async () => {
    const { prisma, jobUpdate, jobFindUnique } = makePrisma();
    jobFindUnique.mockResolvedValue({ id: 'job1', workspaceId: 'w1', nicheId: 'n1', packId: 'pk1', depth: 'quick_opportunity', verticalTemplate: 'b2b_saas', language: null });
    const { BadRequestException } = await import('@nestjs/common');
    const { packService } = makePackService({
      generateV2ForJob: vi.fn().mockRejectedValue(new BadRequestException({ code: 'product_pack_bcg_step_failed', message: 'BCG failed after repair.' })),
    } as any);
    const service = new PackGenerationJobService(prisma, packService);

    await service.process('job1');

    const finalUpdateCall = jobUpdate.mock.calls.at(-1)![0];
    expect(finalUpdateCall.data.status).toBe('failed');
    expect(finalUpdateCall.data.errorCode).toBe('product_pack_bcg_step_failed');
    expect(finalUpdateCall.data.errorReason).toBeTruthy();
  });

  it('does not bypass quality gates in strong_model mode — buildReady still requires a non-failed gate', async () => {
    // strong_model generation always fails at create() until a strong model is configured
    // (see the describe block above), so this asserts the invariant on the shared
    // completion path itself: gate.status === 'failed' must never yield buildReady=true,
    // regardless of which generationMode produced the result.
    const { prisma, jobUpdate, jobFindUnique } = makePrisma();
    jobFindUnique.mockResolvedValue({ id: 'job1', workspaceId: 'w1', nicheId: 'n1', packId: 'pk1', depth: 'quick_opportunity', verticalTemplate: 'b2b_saas', language: null, generationMode: 'strong_model' });
    const { packService } = makePackService({
      generateV2ForJob: vi.fn().mockResolvedValue({
        pack: { id: 'pk1' }, documentCount: PRODUCT_PACK_V2_SECTIONS.length, qualityGate: { status: 'failed' }, allStepsCompleted: true,
      }),
    } as any);
    const service = new PackGenerationJobService(prisma, packService);

    await service.process('job1');

    const finalUpdateCall = jobUpdate.mock.calls.at(-1)![0];
    expect(finalUpdateCall.data.buildReady).toBe(false);
  });
});
