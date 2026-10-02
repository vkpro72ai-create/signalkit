import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { EvidenceService } from './evidence.service';
import {
  CreateClaimDto,
  CreateAssumptionDto,
  CreateQuestionDto,
  LinkEvidenceDto,
} from './dto/evidence.dto';

@ApiTags('evidence')
@Controller('workspaces/:workspaceId')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post('projects/:projectId/evidence/synthesize')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Build evidence from signals and synthesize grounded claims' })
  synthesize(@Param('workspaceId') ws: string, @Param('projectId') pid: string) {
    return this.evidence.synthesize(ws, pid);
  }

  @Post('niches/:nicheId/evidence/scan')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Contextual evidence scan for an opportunity (honest states: claims_found | no_strong_claims | configuration_needed | failed; never fabricates)' })
  scan(@Param('workspaceId') ws: string, @Param('nicheId') nicheId: string) {
    return this.evidence.scanForNiche(ws, nicheId);
  }

  @Get('projects/:projectId/evidence/graph')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'Full evidence graph with per-claim assessment' })
  graph(@Param('workspaceId') ws: string, @Param('projectId') pid: string) {
    return this.evidence.graph(ws, pid);
  }

  @Get('projects/:projectId/evidence/map')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'Evidence map (for exports)' })
  map(@Param('workspaceId') ws: string, @Param('projectId') pid: string) {
    return this.evidence.evidenceMap(ws, pid);
  }

  @Post('projects/:projectId/claims')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Create a claim (refused without evidence or assumption)' })
  createClaim(@Param('workspaceId') ws: string, @Param('projectId') pid: string, @Body() dto: CreateClaimDto) {
    return this.evidence.createClaim(ws, { ...dto, projectId: pid });
  }

  @Post('claims/:claimId/link-evidence')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Link evidence to a claim and recompute confidence' })
  linkEvidence(@Param('workspaceId') ws: string, @Param('claimId') claimId: string, @Body() dto: LinkEvidenceDto) {
    return this.evidence.linkEvidence(ws, { ...dto, claimId });
  }

  @Post('projects/:projectId/assumptions')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Record an assumption' })
  createAssumption(@Param('workspaceId') ws: string, @Param('projectId') pid: string, @Body() dto: CreateAssumptionDto) {
    return this.evidence.createAssumption(ws, { ...dto, projectId: pid });
  }

  @Post('projects/:projectId/questions')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Record an unresolved research question' })
  createQuestion(@Param('workspaceId') ws: string, @Param('projectId') pid: string, @Body() dto: CreateQuestionDto) {
    return this.evidence.createQuestion(ws, { ...dto, projectId: pid });
  }
}
