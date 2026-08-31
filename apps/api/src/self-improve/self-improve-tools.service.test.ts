import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { McpAuthContext } from '../mcp/mcp-auth.service';
import { SELF_IMPROVE_SCOPE } from '../mcp/mcp.constants';
import type { SelfImproveAuthzService } from './self-improve-authz.service';
import type { SelfImproveRunService } from './self-improve-run.service';
import type { SelfImproveDispatchService } from './self-improve-dispatch.service';
import { SelfImproveToolsService } from './self-improve-tools.service';

function ctx(scopes: string[]): McpAuthContext {
  return { sessionId: 's1', workspaceId: 'ws1', userId: 'user1', scopes, clientName: 'Ops Console' };
}

function makeService(opts: { isSuperadmin?: boolean } = {}) {
  const authz = { isSuperadmin: vi.fn().mockReturnValue(opts.isSuperadmin ?? true) } as unknown as SelfImproveAuthzService;
  const proposedRun = { id: 'run1', status: 'proposed', requestSummary: 's', objective: 'o', baseSha: '' };
  const runs = {
    propose: vi.fn().mockResolvedValue(proposedRun),
    get: vi.fn().mockResolvedValue({ ...proposedRun, status: 'generating', baseSha: 'sha1' }),
    listRecent: vi.fn().mockResolvedValue([proposedRun]),
    fail: vi.fn().mockResolvedValue(undefined),
  } as unknown as SelfImproveRunService;
  const dispatch = { dispatchProposal: vi.fn().mockResolvedValue(undefined) } as unknown as SelfImproveDispatchService;

  const svc = new SelfImproveToolsService(authz, runs, dispatch);
  return { svc, authz, runs, dispatch };
}

describe('SelfImproveToolsService — requires BOTH the scope and the superadmin allowlist', () => {
  it('rejects when the session lacks SELF_IMPROVE_SCOPE, even for a superadmin user', async () => {
    const { svc, authz } = makeService({ isSuperadmin: true });
    await expect(svc.proposeChange(ctx([]), { summary: 's', objective: 'o' })).rejects.toBeInstanceOf(ForbiddenException);
    // Scope check fails first — the allowlist isn't even consulted.
    expect(authz.isSuperadmin).not.toHaveBeenCalled();
  });

  it('rejects when the session has the scope but the user is not on the superadmin allowlist', async () => {
    const { svc } = makeService({ isSuperadmin: false });
    await expect(svc.proposeChange(ctx([SELF_IMPROVE_SCOPE]), { summary: 's', objective: 'o' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects get_pipeline_status and list_recent_changes under the same gate', async () => {
    const { svc } = makeService({ isSuperadmin: false });
    await expect(svc.getPipelineStatus(ctx([SELF_IMPROVE_SCOPE]), { runId: 'run1' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listRecentChanges(ctx([SELF_IMPROVE_SCOPE]), {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a normal Layer 1 scope (e.g. pack:read) never substitutes for SELF_IMPROVE_SCOPE', async () => {
    const { svc } = makeService({ isSuperadmin: true });
    await expect(svc.proposeChange(ctx(['workspace:read', 'pack:read']), { summary: 's', objective: 'o' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SelfImproveToolsService — propose_change never accepts a patch, only what should change', () => {
  it('creates a run and dispatches it when both authz checks pass', async () => {
    const { svc, runs, dispatch } = makeService({ isSuperadmin: true });
    const result = await svc.proposeChange(ctx([SELF_IMPROVE_SCOPE]), {
      summary: 'Improve export retry logic',
      objective: 'Retry failed export jobs up to 3 times with backoff',
      constraints: ['Do not touch the Product Pack pipeline'],
      acceptanceCriteria: ['A failed export job is retried automatically'],
    });
    expect(runs.propose).toHaveBeenCalledWith({
      actorUserId: 'user1',
      actorWorkspaceId: 'ws1',
      mcpClientSessionId: 's1',
      summary: 'Improve export retry logic',
      objective: 'Retry failed export jobs up to 3 times with backoff',
      constraints: ['Do not touch the Product Pack pipeline'],
      acceptanceCriteria: ['A failed export job is retried automatically'],
    });
    expect(dispatch.dispatchProposal).toHaveBeenCalledWith('run1');
    expect(result.status).toBe('generating');
  });

  it('a patch/diff field, if a caller sneaks one in anyway, is never read — only summary/objective/constraints/acceptanceCriteria reach SelfImproveRunService.propose', async () => {
    const { svc, runs } = makeService({ isSuperadmin: true });
    const argsWithExtraPatchField = { summary: 's', objective: 'o', patch: 'diff --git a/x b/x\n+evil' };
    await svc.proposeChange(ctx([SELF_IMPROVE_SCOPE]), argsWithExtraPatchField as never);
    const proposeCallArg = (runs.propose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(proposeCallArg).not.toHaveProperty('patch');
  });

  it('does not dispatch when the circuit breaker already returned a circuit_broken run', async () => {
    const { svc, runs, dispatch } = makeService({ isSuperadmin: true });
    (runs.propose as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'run2', status: 'circuit_broken' });
    const result = await svc.proposeChange(ctx([SELF_IMPROVE_SCOPE]), { summary: 's', objective: 'o' });
    expect(dispatch.dispatchProposal).not.toHaveBeenCalled();
    expect(result.status).toBe('circuit_broken');
  });

  it('marks the run failed (does not throw to the caller) when dispatch itself fails, e.g. GitHub App not configured', async () => {
    const { svc, runs, dispatch } = makeService({ isSuperadmin: true });
    (dispatch.dispatchProposal as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('GitHub App not configured'));
    await svc.proposeChange(ctx([SELF_IMPROVE_SCOPE]), { summary: 's', objective: 'o' });
    expect(runs.fail).toHaveBeenCalledWith('run1', 'generating', 'GitHub App not configured');
  });
});
