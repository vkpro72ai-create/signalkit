import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SelfImproveCiGuard } from './self-improve-ci.guard';
import { SelfImproveRunService } from './self-improve-run.service';
import {
  RecordFailureDto,
  RecordGeneratedDto,
  RecordPullRequestDto,
  RecordReviewDto,
  RecordTestResultDto,
} from './dto/pipeline-report.dto';

/**
 * Called only by the dispatched GitHub Actions job (SelfImproveCiGuard —
 * a fixed CI shared secret, never a SignalKit user JWT). The repository_dispatch
 * payload carries only {runId, baseSha}; the job fetches the actual bounded
 * task here, then reports each pipeline stage's result back here.
 */
@ApiExcludeController()
@Public()
@UseGuards(SelfImproveCiGuard)
@Controller('self-improve/runs/:runId')
export class SelfImprovePipelineController {
  constructor(private readonly runs: SelfImproveRunService) {}

  @Get('task')
  async getTask(@Param('runId') runId: string) {
    const run = await this.runs.get(runId);
    return {
      runId: run.id,
      objective: run.objective,
      constraints: run.constraints,
      acceptanceCriteria: run.acceptanceCriteria,
      baseSha: run.baseSha,
    };
  }

  @Patch('generated')
  recordGenerated(@Param('runId') runId: string, @Body() dto: RecordGeneratedDto) {
    return this.runs.recordGenerated(runId, dto);
  }

  @Patch('test-result')
  recordTestResult(@Param('runId') runId: string, @Body() dto: RecordTestResultDto) {
    return this.runs.recordTestResult(runId, dto);
  }

  @Patch('review')
  recordReview(@Param('runId') runId: string, @Body() dto: RecordReviewDto) {
    return this.runs.recordReview(runId, dto.findings);
  }

  @Patch('pull-request')
  recordPullRequest(@Param('runId') runId: string, @Body() dto: RecordPullRequestDto) {
    return this.runs.recordPullRequest(runId, dto);
  }

  @Patch('fail')
  recordFailure(@Param('runId') runId: string, @Body() dto: RecordFailureDto) {
    return this.runs.fail(runId, dto.stage, dto.reason);
  }
}
