import { describe, it, expect, vi } from 'vitest';
import type { GitHubAppClient } from './github-app-client.service';
import type { SelfImproveRunService } from './self-improve-run.service';
import { SelfImproveDispatchService } from './self-improve-dispatch.service';

describe('SelfImproveDispatchService.dispatchProposal', () => {
  it('resolves the base SHA, dispatches with exactly {runId, baseSha}, then records it on the run — in that order', async () => {
    const calls: string[] = [];
    const github = {
      getBranchSha: vi.fn().mockImplementation(async () => {
        calls.push('getBranchSha');
        return 'sha-main-tip';
      }),
      dispatch: vi.fn().mockImplementation(async (payload) => {
        calls.push('dispatch');
        expect(payload).toEqual({ runId: 'run1', baseSha: 'sha-main-tip' });
      }),
    } as unknown as GitHubAppClient;
    const runs = {
      markDispatched: vi.fn().mockImplementation(async () => {
        calls.push('markDispatched');
      }),
    } as unknown as SelfImproveRunService;

    const svc = new SelfImproveDispatchService(github, runs);
    await svc.dispatchProposal('run1');

    expect(calls).toEqual(['getBranchSha', 'dispatch', 'markDispatched']);
    expect(runs.markDispatched).toHaveBeenCalledWith('run1', 'sha-main-tip');
  });

  it('propagates a dispatch failure without marking the run dispatched', async () => {
    const github = {
      getBranchSha: vi.fn().mockResolvedValue('sha1'),
      dispatch: vi.fn().mockRejectedValue(new Error('GitHub App not configured')),
    } as unknown as GitHubAppClient;
    const runs = { markDispatched: vi.fn() } as unknown as SelfImproveRunService;

    const svc = new SelfImproveDispatchService(github, runs);
    await expect(svc.dispatchProposal('run1')).rejects.toThrow('GitHub App not configured');
    expect(runs.markDispatched).not.toHaveBeenCalled();
  });
});
