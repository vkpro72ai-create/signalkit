import { Injectable, Logger } from '@nestjs/common';
import { GitHubAppClient } from './github-app-client.service';
import { SelfImproveRunService } from './self-improve-run.service';

/**
 * Resolves the base SHA and fires the repository_dispatch event that starts
 * the isolated GitHub Actions checkout/code-generation job. The dispatch
 * payload carries ONLY {runId, baseSha} — never the objective/constraints
 * text, never a patch, never a credential. The workflow calls back into
 * SelfImprovePipelineController (authenticated with the CI token) to fetch
 * the actual task by runId.
 */
@Injectable()
export class SelfImproveDispatchService {
  private readonly logger = new Logger(SelfImproveDispatchService.name);

  constructor(
    private readonly github: GitHubAppClient,
    private readonly runs: SelfImproveRunService,
  ) {}

  async dispatchProposal(runId: string): Promise<void> {
    const baseSha = await this.github.getBranchSha('main');
    await this.github.dispatch({ runId, baseSha });
    await this.runs.markDispatched(runId, baseSha);
    this.logger.log(`Dispatched self-improvement run ${runId} at base ${baseSha}`);
  }
}
