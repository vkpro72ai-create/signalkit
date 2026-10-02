import { ForbiddenException, Injectable } from '@nestjs/common';
import type { SelfImprovementRun } from '@prisma/client';
import { SELF_IMPROVE_SCOPE } from '../mcp/mcp.constants';
import type { McpAuthContext } from '../mcp/mcp-auth.service';
import { SelfImproveAuthzService } from './self-improve-authz.service';
import { SelfImproveRunService } from './self-improve-run.service';
import { SelfImproveDispatchService } from './self-improve-dispatch.service';

function toDto(run: SelfImprovementRun) {
  return {
    id: run.id,
    requestSummary: run.requestSummary,
    objective: run.objective,
    constraints: run.constraints,
    acceptanceCriteria: run.acceptanceCriteria,
    baseSha: run.baseSha || null,
    generatedBranchName: run.generatedBranchName,
    generatedCommitSha: run.generatedCommitSha,
    prNumber: run.prNumber,
    prUrl: run.prUrl,
    status: run.status,
    failureStage: run.failureStage,
    failureReason: run.failureReason,
    testsPassed: run.testsPassed,
    reviewFindings: run.reviewFindings,
    migrationSafety: run.migrationSafety,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

/**
 * The three self-improvement MCP tools. This is a SEPARATE trust boundary
 * from McpToolsService (Layer 1): the SELF_IMPROVE_SCOPE grant plus a live
 * platform-superadmin allowlist check, on every call — not workspace RBAC.
 * propose_change never accepts a code patch — only WHAT should change
 * (objective/constraints/acceptanceCriteria); the actual diff is produced by
 * an isolated CodeAgentExecutor running inside the dispatched GitHub Actions
 * job, never inline here.
 */
@Injectable()
export class SelfImproveToolsService {
  constructor(
    private readonly authz: SelfImproveAuthzService,
    private readonly runs: SelfImproveRunService,
    private readonly dispatch: SelfImproveDispatchService,
  ) {}

  async proposeChange(
    ctx: McpAuthContext,
    args: { summary: string; objective: string; constraints?: string[]; acceptanceCriteria?: string[] },
  ) {
    this.authorize(ctx);

    const run = await this.runs.propose({
      actorUserId: ctx.userId,
      actorWorkspaceId: ctx.workspaceId,
      mcpClientSessionId: ctx.sessionId,
      summary: args.summary,
      objective: args.objective,
      constraints: args.constraints,
      acceptanceCriteria: args.acceptanceCriteria,
    });

    if (run.status === 'circuit_broken') {
      return toDto(run);
    }

    try {
      await this.dispatch.dispatchProposal(run.id);
    } catch (error) {
      await this.runs.fail(run.id, 'generating', error instanceof Error ? error.message : 'Dispatch failed');
    }
    return toDto(await this.runs.get(run.id));
  }

  async getPipelineStatus(ctx: McpAuthContext, args: { runId: string }) {
    this.authorize(ctx);
    return toDto(await this.runs.get(args.runId));
  }

  async listRecentChanges(ctx: McpAuthContext, args: { limit?: number }) {
    this.authorize(ctx);
    const runs = await this.runs.listRecent(args.limit);
    return runs.map(toDto);
  }

  /** Requires BOTH: the session was explicitly granted SELF_IMPROVE_SCOPE, AND
   * the connecting user is currently on the platform-superadmin allowlist. */
  private authorize(ctx: McpAuthContext): void {
    if (!ctx.scopes.includes(SELF_IMPROVE_SCOPE)) {
      throw new ForbiddenException('This connection was not granted the self-improvement scope');
    }
    if (!this.authz.isSuperadmin(ctx.userId)) {
      throw new ForbiddenException('This account is not authorized for platform self-improvement access');
    }
  }
}
