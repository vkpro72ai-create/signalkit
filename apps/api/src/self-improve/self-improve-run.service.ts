import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SelfImprovementRunStatus, MigrationSafetyClass } from '@prisma/client';
import type { ReviewFinding } from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface ProposeChangeInput {
  actorUserId: string;
  actorWorkspaceId?: string | null;
  mcpClientSessionId?: string | null;
  summary: string;
  objective: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
}

/** L2.1 only ever moves forward through this path — `human_review_pending` is terminal here. */
const ALLOWED_TRANSITIONS: Record<SelfImprovementRunStatus, SelfImprovementRunStatus[]> = {
  proposed: ['generating', 'failed'],
  generating: ['testing', 'failed'],
  testing: ['review_pending', 'failed'],
  review_pending: ['human_review_pending', 'failed'],
  human_review_pending: [],
  failed: [],
  rolled_back: [], // unreachable until L2.3 (deploy) exists
  circuit_broken: [],
};

const CIRCUIT_BREAKER_WINDOW = 3;

@Injectable()
export class SelfImproveRunService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Three consecutive `rolled_back` runs halt further proposals. Unreachable
   * in practice today (nothing in L2.1 can produce a `rolled_back` run — that
   * requires the deploy step L2.3 adds), but the check is real and wired in
   * now so L2.3 doesn't have to touch propose() again.
   */
  async isCircuitBroken(): Promise<boolean> {
    const recent = await this.prisma.selfImprovementRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: CIRCUIT_BREAKER_WINDOW,
      select: { status: true },
    });
    if (recent.length < CIRCUIT_BREAKER_WINDOW) return false;
    return recent.every((r) => r.status === 'rolled_back');
  }

  async propose(input: ProposeChangeInput) {
    const broken = await this.isCircuitBroken();
    return this.prisma.selfImprovementRun.create({
      data: {
        actorUserId: input.actorUserId,
        actorWorkspaceId: input.actorWorkspaceId ?? null,
        mcpClientSessionId: input.mcpClientSessionId ?? null,
        requestSummary: input.summary,
        objective: input.objective,
        constraints: (input.constraints ?? []) as unknown as Prisma.InputJsonValue,
        acceptanceCriteria: (input.acceptanceCriteria ?? []) as unknown as Prisma.InputJsonValue,
        baseSha: '',
        status: broken ? 'circuit_broken' : 'proposed',
      },
    });
  }

  async get(runId: string) {
    const run = await this.prisma.selfImprovementRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Self-improvement run not found');
    return run;
  }

  async listRecent(limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.selfImprovementRun.findMany({ orderBy: { createdAt: 'desc' }, take });
  }

  /** Records the resolved base SHA and moves proposed -> generating right after a successful dispatch. */
  async markDispatched(runId: string, baseSha: string) {
    const run = await this.get(runId);
    this.assertTransition(run.status, 'generating');
    return this.prisma.selfImprovementRun.update({
      where: { id: runId },
      data: { baseSha, status: 'generating' },
    });
  }

  /** Called by the pipeline controller when the CI job reports the generated branch/commit. */
  async recordGenerated(runId: string, input: { branchName: string; commitSha: string }) {
    const run = await this.get(runId);
    this.assertTransition(run.status, 'testing');
    return this.prisma.selfImprovementRun.update({
      where: { id: runId },
      data: {
        generatedBranchName: input.branchName,
        generatedCommitSha: input.commitSha,
        status: 'testing',
      },
    });
  }

  async recordTestResult(
    runId: string,
    input: { testsPassed: boolean; migrationSafety: MigrationSafetyClass },
  ) {
    const run = await this.get(runId);
    if (!input.testsPassed) {
      return this.fail(runId, 'testing', 'Deterministic gate failed (install/typecheck/tests/build)');
    }
    this.assertTransition(run.status, 'review_pending');
    return this.prisma.selfImprovementRun.update({
      where: { id: runId },
      data: { testsPassed: input.testsPassed, migrationSafety: input.migrationSafety, status: 'review_pending' },
    });
  }

  /**
   * Any CONFIRMED finding blocks. PLAUSIBLE findings never block by
   * themselves in L2.1 (there is no auto-merge to gate), but are always kept
   * on the run for human audit — including ones flagged `requiresHumanReview`
   * (security/auth/tenant-isolation/migration/deployment) which must never be
   * silently treated as safe just because they're not CONFIRMED.
   */
  async recordReview(runId: string, findings: ReviewFinding[]) {
    const hasConfirmed = findings.some((f) => f.verdict === 'CONFIRMED');
    if (hasConfirmed) {
      await this.prisma.selfImprovementRun.update({
        where: { id: runId },
        data: { reviewFindings: findings as unknown as Prisma.InputJsonValue },
      });
      return this.fail(runId, 'review', 'Independent review found one or more CONFIRMED blocking issues');
    }
    const run = await this.get(runId);
    this.assertTransition(run.status, 'human_review_pending');
    return this.prisma.selfImprovementRun.update({
      where: { id: runId },
      data: {
        reviewFindings: findings as unknown as Prisma.InputJsonValue,
        status: 'human_review_pending',
      },
    });
  }

  async recordPullRequest(runId: string, input: { prNumber: number; prUrl: string }) {
    return this.prisma.selfImprovementRun.update({
      where: { id: runId },
      data: { prNumber: input.prNumber, prUrl: input.prUrl },
    });
  }

  async fail(runId: string, stage: string, reason: string) {
    return this.prisma.selfImprovementRun.update({
      where: { id: runId },
      data: { status: 'failed', failureStage: stage, failureReason: reason },
    });
  }

  private assertTransition(from: SelfImprovementRunStatus, to: SelfImprovementRunStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new ConflictException(`Cannot transition self-improvement run from "${from}" to "${to}"`);
    }
  }
}
