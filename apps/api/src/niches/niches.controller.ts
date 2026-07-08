import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { NichesService } from './niches.service';
import { CompareMarketsDto, CreateOpportunityFromIdeaDto, DiscoverNichesDto } from './dto/niche.dto';

@ApiTags('niches')
@Controller('workspaces/:workspaceId')
export class NichesController {
  constructor(private readonly niches: NichesService) {}

  @Post('projects/:projectId/discover-niches')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Discover niches from the project signals + evidence' })
  discover(
    @Param('workspaceId') ws: string,
    @Param('projectId') pid: string,
    @Body() dto: DiscoverNichesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.niches.discover(ws, pid, dto, user.sub);
  }

  @Post('projects/:projectId/niches/from-idea')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Develop a single founder-supplied idea into a scored opportunity (does not replace existing niches)' })
  createFromIdea(
    @Param('workspaceId') ws: string,
    @Param('projectId') pid: string,
    @Body() dto: CreateOpportunityFromIdeaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.niches.createFromIdea(ws, pid, dto, user.sub);
  }

  @Get('projects/:projectId/niches')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'List niches (with latest score)' })
  list(@Param('workspaceId') ws: string, @Param('projectId') pid: string) {
    return this.niches.list(ws, pid);
  }

  @Get('niches')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'List all niches in the workspace, or one project if ?projectId= is given — mobile feed / Radar dashboard' })
  listAll(@Param('workspaceId') ws: string, @Query('projectId') projectId?: string) {
    return this.niches.listAll(ws, projectId);
  }

  @Get('projects/:projectId/radar-summary')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Real, honestly-derived headline metrics for the Radar dashboard (opportunities found, avg confidence, investor interest, AI-engine status), each with a week-over-week delta' })
  radarSummary(@Param('workspaceId') ws: string, @Param('projectId') pid: string) {
    return this.niches.radarSummary(ws, pid);
  }

  @Get('niches/:nicheId')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Get a niche with its latest score' })
  get(@Param('workspaceId') ws: string, @Param('nicheId') id: string) {
    return this.niches.get(ws, id);
  }

  @Post('niches/:nicheId/rescore')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Rescore a niche (new breakdown + explanation)' })
  rescore(@Param('workspaceId') ws: string, @Param('nicheId') id: string) {
    return this.niches.rescore(ws, id);
  }

  @Post('niches/:nicheId/compare-markets')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Compare markets for a niche' })
  compare(@Param('workspaceId') ws: string, @Param('nicheId') id: string, @Body() dto: CompareMarketsDto) {
    return this.niches.compareMarkets(ws, id, dto.countries ?? []);
  }

  @Get('niches/:nicheId/scenarios')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Conservative / base / aggressive scenarios + go/no-go' })
  scenarios(@Param('workspaceId') ws: string, @Param('nicheId') id: string) {
    return this.niches.scenarios(ws, id);
  }

  @Get('niches/:nicheId/evidence')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Evidence graph backing the niche' })
  evidence(@Param('workspaceId') ws: string, @Param('nicheId') id: string) {
    return this.niches.evidenceForNiche(ws, id);
  }

  @Get('niches/:nicheId/scoring')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Latest score with full breakdown' })
  scoring(@Param('workspaceId') ws: string, @Param('nicheId') id: string) {
    return this.niches.scoring(ws, id);
  }

  @Get('niches/:nicheId/venture-thesis')
  @RequirePermissions('niche:read')
  @ApiOperation({ summary: 'Venture Thesis + Venture Scale Score (separate from opportunity/confidence)' })
  ventureThesis(@Param('workspaceId') ws: string, @Param('nicheId') id: string) {
    return this.niches.ventureThesis(ws, id);
  }

  @Post('niches/:nicheId/venture-thesis/regenerate')
  @RequirePermissions('niche:discover')
  @ApiOperation({ summary: 'Recompute the Venture Thesis + Venture Scale Score' })
  regenerateVenture(@Param('workspaceId') ws: string, @Param('nicheId') id: string) {
    return this.niches.regenerateVenture(ws, id);
  }
}
