import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { ImplementationProjectsService } from './implementation-projects.service';
import {
  PromoteToProjectDto,
  UpdateImplementationProjectDto,
  UpsertFounderVerdictDto,
} from './dto/implementation-project.dto';

@ApiTags('implementation-projects')
@Controller('workspaces/:workspaceId')
export class ImplementationProjectsController {
  constructor(private readonly svc: ImplementationProjectsService) {}

  // ── Founder verdict (personal, per-user) ──────────────────────────────────

  @Get('niches/:nicheId/founder-verdict')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: "Get the current founder's own verdict + advisory co-founder verdicts (separate from AI score)" })
  getVerdict(@Param('workspaceId') ws: string, @Param('nicheId') nicheId: string, @CurrentUser() user: JwtPayload) {
    return this.svc.getFounderVerdict(ws, nicheId, user.sub);
  }

  @Put('niches/:nicheId/founder-verdict')
  @RequirePermissions('comment:create')
  @ApiOperation({ summary: "Upsert the current founder's personal rating/comment/decision for an opportunity" })
  putVerdict(
    @Param('workspaceId') ws: string,
    @Param('nicheId') nicheId: string,
    @Body() dto: UpsertFounderVerdictDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.upsertFounderVerdict(ws, nicheId, user.sub, dto);
  }

  // ── Readiness + promotion gate ────────────────────────────────────────────

  @Get('packs/:packId/readiness')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Build-Ready / Venture-Ready / Unicorn-Potential badges + promotion eligibility (separate signals)' })
  readiness(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.svc.readinessForPack(ws, packId);
  }

  @Post('packs/:packId/promote')
  @RequirePermissions('pack:approve')
  @ApiOperation({ summary: 'Promote a Build-Ready pack into a real implementation project (requires explicit founder commitment)' })
  promote(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Body() dto: PromoteToProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.promote(ws, packId, user.sub, dto);
  }

  // ── Implementation projects (only promoted items appear here) ──────────────

  @Get('implementation-projects')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List founder-committed implementation projects' })
  list(@Param('workspaceId') ws: string) {
    return this.svc.list(ws);
  }

  @Get('implementation-projects/:id')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get an implementation project with full lineage (Research → Opportunity → Pack → Project)' })
  get(@Param('workspaceId') ws: string, @Param('id') id: string) {
    return this.svc.get(ws, id);
  }

  @Patch('implementation-projects/:id')
  @RequirePermissions('pack:approve')
  @ApiOperation({ summary: 'Update an implementation project (status: active | paused | archived)' })
  update(
    @Param('workspaceId') ws: string,
    @Param('id') id: string,
    @Body() dto: UpdateImplementationProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(ws, id, user.sub, dto);
  }

  // ── Lineage (feeds the LineageBar on opportunity / pack detail) ────────────

  @Get('niches/:nicheId/lineage')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Object lineage for an opportunity (research + packs + promoted project)' })
  nicheLineage(@Param('workspaceId') ws: string, @Param('nicheId') nicheId: string) {
    return this.svc.lineageForNiche(ws, nicheId);
  }

  @Get('packs/:packId/lineage')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Object lineage for a pack (research + opportunity + promoted project)' })
  packLineage(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.svc.lineageForPack(ws, packId);
  }
}
