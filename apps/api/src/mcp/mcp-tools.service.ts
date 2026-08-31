import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Permission } from '@signalkit/shared';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ProjectsService } from '../projects/projects.service';
import { NichesService } from '../niches/niches.service';
import { PackService } from '../packs/pack.service';
import { PackGenerationJobService } from '../packs/pack-generation-job.service';
import { ImplementationProjectsService } from '../implementation-projects/implementation-projects.service';
import type { McpAuthContext } from './mcp-auth.service';
import {
  toGenerationStatusDto,
  toImplementationProjectDto,
  toOpportunityDetailDto,
  toOpportunitySummaryDto,
  toProductPackDto,
  toResearchDto,
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
