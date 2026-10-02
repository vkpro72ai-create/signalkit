import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  ExportType,
  LocaleCode,
  MarketScope,
  Permission,
  ProductPackDepth,
  RoleBriefType,
  VerticalTemplate,
} from '@signalkit/shared';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ProjectsService } from '../projects/projects.service';
import { NichesService } from '../niches/niches.service';
import { PackService } from '../packs/pack.service';
import { PackGenerationJobService } from '../packs/pack-generation-job.service';
import { ResearchService } from '../packs/research.service';
import type { ResearchUpdateType } from '../packs/dto/governance.dto';
import { ImplementationProjectsService } from '../implementation-projects/implementation-projects.service';
import { ExportJobService } from '../exports/export-job.service';
import type { FounderDecisionInput } from '../implementation-projects/dto/implementation-project.dto';
import type { McpAuthContext } from './mcp-auth.service';
import {
  toDiscoveryResultDto,
  toExportJobDto,
  toFounderVerdictDto,
  toGenerationStatusDto,
  toImplementationProjectDto,
  toOpportunityDetailDto,
  toOpportunitySummaryDto,
  toProductPackDto,
  toResearchDto,
  toResearchNoteDto,
  toWorkspaceContextDto,
} from './mcp-response.util';

/**
 * The 8 read-only Phase A1 MCP tools. Every method: checks the session's
 * granted scope + the caller's live RBAC permission, calls the SAME
 * application service the web/mobile app uses (never touches Prisma
 * directly), shapes the result into a product-level DTO, and audits the
 * call. Tools never accept a workspaceId argument — it always comes from
 * the authenticated session, so a cross-workspace id can only ever 404
 * through the underlying service's own `findFirst({ id, workspaceId })`
 * scoping, exactly as the web app already behaves.
 */
@Injectable()
export class McpToolsService {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly workspaces: WorkspacesService,
    private readonly projects: ProjectsService,
    private readonly niches: NichesService,
    private readonly packs: PackService,
    private readonly packGenerationJobs: PackGenerationJobService,
    private readonly implementationProjects: ImplementationProjectsService,
    private readonly researchNotes: ResearchService,
    private readonly exportJobs: ExportJobService,
  ) {}

  async getWorkspaceContext(ctx: McpAuthContext) {
    await this.authorize(ctx, 'workspace:read', 'get_workspace_context', {});
    const workspace = await this.workspaces.getById(ctx.workspaceId);
    return toWorkspaceContextDto(workspace);
  }

  async listResearch(ctx: McpAuthContext) {
    await this.authorize(ctx, 'project:read', 'list_research', {});
    const projects = await this.projects.listForWorkspace(ctx.workspaceId);
    return projects.map(toResearchDto);
  }

  async getResearch(ctx: McpAuthContext, args: { researchId: string }) {
    await this.authorize(ctx, 'project:read', 'get_research', { researchId: args.researchId });
    const project = await this.projects.getById(ctx.workspaceId, args.researchId);
    return toResearchDto(project);
  }

  async listOpportunities(ctx: McpAuthContext, args: { researchId?: string }) {
    await this.authorize(ctx, 'niche:read', 'list_opportunities', { researchId: args.researchId });
    const niches = await this.niches.listAll(ctx.workspaceId, args.researchId);
    return niches.map(toOpportunitySummaryDto);
  }

  async getOpportunity(ctx: McpAuthContext, args: { opportunityId: string }) {
    await this.authorize(ctx, 'niche:read', 'get_opportunity', { opportunityId: args.opportunityId });
    const niche = await this.niches.get(ctx.workspaceId, args.opportunityId);
    const venture = await this.niches.ventureThesis(ctx.workspaceId, args.opportunityId).catch(() => null);
    return toOpportunityDetailDto(niche, venture);
  }

  async getProductPack(ctx: McpAuthContext, args: { packId: string }) {
    await this.authorize(ctx, 'pack:read', 'get_product_pack', { packId: args.packId });
    const pack = await this.packs.getPack(ctx.workspaceId, args.packId);
    return toProductPackDto(pack);
  }

  async getGenerationStatus(ctx: McpAuthContext, args: { packId: string }) {
    await this.authorize(ctx, 'pack:read', 'get_generation_status', { packId: args.packId });
    const { job, contextChanged } = await this.packGenerationJobs.getDiagnosticsForPack(ctx.workspaceId, args.packId);
    return toGenerationStatusDto(job, contextChanged);
  }

  async getProject(ctx: McpAuthContext, args: { projectId: string }) {
    await this.authorize(ctx, 'pack:read', 'get_project', { projectId: args.projectId });
    const project = await this.implementationProjects.get(ctx.workspaceId, args.projectId);
    return toImplementationProjectDto(project);
  }

  // ── Phase B: operator write/execute tools ─────────────────────────────────

  async createResearch(
    ctx: McpAuthContext,
    args: {
      name: string;
      goal?: string;
      marketScope?: MarketScope;
      targetCountry?: string;
      targetRegion?: string;
      targetCountries?: string[];
      targetRegions?: string[];
      marketLanguage?: string;
    },
  ) {
    await this.authorize(ctx, 'project:create', 'create_research', {});
    const project = await this.projects.create(ctx.workspaceId, ctx.userId, args);
    return toResearchDto(project);
  }

  async archiveResearch(ctx: McpAuthContext, args: { researchId: string; archived: boolean }) {
    await this.authorize(ctx, 'project:update', 'archive_research', { researchId: args.researchId });
    const project = await this.projects.setArchived(ctx.workspaceId, args.researchId, args.archived);
    return toResearchDto(project);
  }

  /**
   * `mode` is always forced to `'find_opportunities'` — the gated,
   * brief-based discovery flow (requires directions/audiences/productFormats,
   * same as the web "Find opportunities" tab) — never the ungated dashboard
   * radar scan. This is deliberate: MCP must never bypass the discovery-brief
   * gate, per the architecture's "no MCP bypass" requirement.
   */
  async discoverOpportunities(
    ctx: McpAuthContext,
    args: {
      researchId: string;
      directions?: string[];
      audiences?: string[];
      productFormats?: string[];
      subthemes?: string[];
      verticals?: string[];
      market?: string;
      locations?: string[];
      riskTolerance?: 'low' | 'medium' | 'high';
      evidenceMode?: 'starter_hypothesis' | 'source_backed' | 'deep_research';
      language?: string;
      /** Only pass true if the user explicitly confirmed, in this conversation, that existing opportunities in this research context should be replaced. */
      confirmReplace?: boolean;
    },
  ) {
    await this.authorize(ctx, 'niche:discover', 'discover_opportunities', { researchId: args.researchId });
    const { researchId, ...rest } = args;
    const result = await this.niches.discover(ctx.workspaceId, researchId, { ...rest, mode: 'find_opportunities' as const }, ctx.userId);
    return toDiscoveryResultDto(result);
  }

  async createOpportunityFromIdea(
    ctx: McpAuthContext,
    args: {
      researchId: string;
      founderIdea: string;
      targetMarket?: string;
      targetAudience?: string;
      productFormat?: string;
      outputLanguage?: string;
      evidenceMode?: 'starter_hypothesis' | 'source_backed' | 'deep_research';
      riskTolerance?: 'low' | 'medium' | 'high';
    },
  ) {
    await this.authorize(ctx, 'niche:discover', 'create_opportunity_from_idea', { researchId: args.researchId });
    const { researchId, ...dto } = args;
    const result = await this.niches.createFromIdea(ctx.workspaceId, researchId, dto, ctx.userId);
    return toDiscoveryResultDto(result);
  }

  /** The founder's own verdict — permission matches the web app's founder-verdict endpoint (`comment:create`), not a stronger one invented for MCP. */
  async setOpportunityVerdict(
    ctx: McpAuthContext,
    args: { opportunityId: string; rating?: number; comment?: string; decision?: FounderDecisionInput },
  ) {
    await this.authorize(ctx, 'comment:create', 'set_opportunity_verdict', { opportunityId: args.opportunityId });
    const { opportunityId, ...dto } = args;
    const verdict = await this.implementationProjects.upsertFounderVerdict(ctx.workspaceId, opportunityId, ctx.userId, dto);
    return toFounderVerdictDto(verdict);
  }

  async saveResearchNote(
    ctx: McpAuthContext,
    args: { packId: string; title: string; type: ResearchUpdateType; content: string; language?: string; marketContext?: string },
  ) {
    await this.authorize(ctx, 'pack:edit', 'save_research_note', { packId: args.packId });
    const { packId, ...dto } = args;
    const note = await this.researchNotes.create(ctx.workspaceId, packId, ctx.userId, dto);
    return toResearchNoteDto(note);
  }

  async startPackGeneration(
    ctx: McpAuthContext,
    args: {
      opportunityId: string;
      depth: ProductPackDepth;
      vertical: VerticalTemplate;
      language?: string;
      generationMode?: 'standard' | 'strong_model';
    },
  ) {
    await this.authorize(ctx, 'pack:generate', 'start_pack_generation', { opportunityId: args.opportunityId });
    const job = await this.packGenerationJobs.create(
      ctx.workspaceId,
      args.opportunityId,
      { depth: args.depth, vertical: args.vertical, language: args.language as LocaleCode | undefined },
      ctx.userId,
      args.generationMode ?? 'standard',
    );
    return toGenerationStatusDto(job, false);
  }

  /**
   * The system gate (buildReady) and founder gate (commitmentConfirmed +
   * reviewedRisks + a rated founder verdict) are enforced inside
   * ImplementationProjectsService.promote — identical to the web app.
   * `commitmentConfirmed`/`reviewedRisks` must reflect an explicit, current
   * confirmation the human actually gave in this conversation; an assistant
   * must never set these true on its own judgment.
   */
  async promoteToProject(
    ctx: McpAuthContext,
    args: {
      packId: string;
      ambitionMode: 'cash_flow_business' | 'venture_scale' | 'unicorn_ambition';
      commitmentConfirmed: boolean;
      reviewedRisks: boolean;
    },
  ) {
    await this.authorize(ctx, 'pack:approve', 'promote_to_project', { packId: args.packId });
    const { packId, ...dto } = args;
    const created = await this.implementationProjects.promote(ctx.workspaceId, packId, ctx.userId, dto);
    const shaped = await this.implementationProjects.get(ctx.workspaceId, created.id);
    return toImplementationProjectDto(shaped);
  }

  async createExport(
    ctx: McpAuthContext,
    args: { packId: string; type: ExportType; language?: string; roleBrief?: RoleBriefType; applyBranding?: boolean },
  ) {
    await this.authorize(ctx, 'export:create', 'create_export', { packId: args.packId });
    const job = await this.exportJobs.create(
      ctx.workspaceId,
      args.packId,
      ctx.userId,
      args.type,
      (args.language ?? 'en') as LocaleCode,
      (args.roleBrief ?? null),
      args.applyBranding ?? false,
    );
    return toExportJobDto(job);
  }

  async getExport(ctx: McpAuthContext, args: { exportId: string }) {
    await this.authorize(ctx, 'export:read', 'get_export', { exportId: args.exportId });
    const job = await this.exportJobs.getJob(ctx.workspaceId, args.exportId);
    return toExportJobDto(job);
  }

  /** Scope check (what the connected client was granted) + live RBAC check (what the user can do right now) + audit. */
  private async authorize(
    ctx: McpAuthContext,
    required: Permission,
    tool: string,
    subjectIds: Record<string, string | undefined>,
  ): Promise<void> {
    if (!ctx.scopes.includes(required)) {
      throw new ForbiddenException(`This connection was not granted the "${required}" scope`);
    }
    const allowed = await this.permissions.can(ctx.userId, ctx.workspaceId, [required]);
    if (!allowed) {
      throw new ForbiddenException('Insufficient workspace permissions');
    }
    const subjectId = Object.values(subjectIds).find((v) => typeof v === 'string');
    await this.audit.record({
      workspaceId: ctx.workspaceId,
      action: 'mcp.tool_invoked',
      actorId: ctx.userId,
      subjectType: 'mcp_tool',
      subjectId: subjectId ?? tool,
      metadata: { tool, sessionId: ctx.sessionId, clientName: ctx.clientName, ...subjectIds },
    });
  }
}
