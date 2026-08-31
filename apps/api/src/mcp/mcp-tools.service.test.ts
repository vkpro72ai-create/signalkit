import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { PermissionsService } from '../permissions/permissions.service';
import type { AuditService } from '../audit/audit.service';
import type { WorkspacesService } from '../workspaces/workspaces.service';
import type { ProjectsService } from '../projects/projects.service';
import type { NichesService } from '../niches/niches.service';
import type { PackService } from '../packs/pack.service';
import type { PackGenerationJobService } from '../packs/pack-generation-job.service';
import type { ImplementationProjectsService } from '../implementation-projects/implementation-projects.service';
import { McpToolsService } from './mcp-tools.service';
import type { McpAuthContext } from './mcp-auth.service';

function ctx(scopes: string[] = ['workspace:read', 'project:read', 'niche:read', 'pack:read']): McpAuthContext {
  return { sessionId: 's1', workspaceId: 'ws1', userId: 'user1', scopes: scopes as never, clientName: 'Test Client' };
}

function makeService(opts: { canReturn?: boolean } = {}) {
  const permissions = { can: vi.fn().mockResolvedValue(opts.canReturn ?? true) } as unknown as PermissionsService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const workspaces = {
    getById: vi.fn().mockResolvedValue({ id: 'ws1', name: 'Acme Lab', slug: 'acme', settings: { defaultLocale: 'en', defaultMarketCountry: null, defaultMarketRegion: null, billingPlan: 'free', aiEngineName: null } }),
  } as unknown as WorkspacesService;
  const projects = {
    listForWorkspace: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Research 1', goal: '', status: 'active', marketScope: 'global', targetCountry: null, targetRegion: null, targetCountries: [], targetRegions: [], marketLanguage: 'en', defaultOutputLanguage: 'en', createdAt: new Date(), updatedAt: new Date() }]),
    getById: vi.fn().mockResolvedValue({ id: 'p1', name: 'Research 1', goal: '', status: 'active', marketScope: 'global', targetCountry: null, targetRegion: null, targetCountries: [], targetRegions: [], marketLanguage: 'en', defaultOutputLanguage: 'en', createdAt: new Date(), updatedAt: new Date() }),
  } as unknown as ProjectsService;
  const niches = {
    listAll: vi.fn().mockResolvedValue([{ id: 'n1', name: 'Niche 1', oneLiner: '', whyNow: '', riskLevel: 'medium', projectId: 'p1', targetMarket: null, evidenceCount: 0, opportunityScore: 0, confidence: { level: 'low', value: 0 }, ventureScaleScore: null, ventureScaleLevel: null, buildReadinessScore: null }]),
    get: vi.fn().mockResolvedValue({ id: 'n1', projectId: 'p1', title: 'Niche 1', oneLiner: '', problem: '', targetAudience: '', whyNow: '', useCases: [], competitors: [], mvpConcept: '', monetization: '', recommendedProductFormat: '', riskLevel: 'medium', language: 'en', intakeMode: 'discovered', founderIdeaText: '', scores: [] }),
    ventureThesis: vi.fn().mockResolvedValue({ thesis: {}, ventureScaleScore: 10, ventureScaleConfidence: 0.5, ventureScaleLevel: 'low', whatMustBeTrue: [] }),
  } as unknown as NichesService;
  const packs = {
    getPack: vi.fn().mockResolvedValue({ id: 'pack1', nicheId: 'n1', projectId: 'p1', title: 'Pack', depth: 'build_ready', verticalTemplate: 'saas', primaryLanguage: 'en', status: 'draft', confidenceValue: 0, confidenceLevel: 'low', version: 1, qualityGate: null, documents: [] }),
  } as unknown as PackService;
  const packGenerationJobs = {
    getDiagnosticsForPack: vi.fn().mockResolvedValue({ job: { id: 'job1', packId: 'pack1', status: 'completed', generationMode: 'standard', currentStep: null, progressPercent: 100, readyDocumentCount: 9, totalExpectedDocumentCount: 9, buildReady: true, errorCode: null, errorReason: null, startedAt: new Date(), completedAt: new Date(), steps: [] }, contextChanged: false }),
  } as unknown as PackGenerationJobService;
  const implementationProjects = {
    get: vi.fn().mockResolvedValue({ id: 'ip1', status: 'active', ambitionMode: 'cash_flow_business', founderRatingSnapshot: 5, founderCommentSnapshot: '', buildReadySnapshot: true, ventureReadySnapshot: false, unicornPotentialSnapshot: false, topRisksSnapshot: [], committedAt: new Date(), lineage: { research: { id: 'p1', name: 'Research 1' }, opportunity: { id: 'n1', title: 'Niche 1' }, pack: { id: 'pack1', title: 'Pack', status: 'draft' } } }),
  } as unknown as ImplementationProjectsService;

  const svc = new McpToolsService(permissions, audit, workspaces, projects, niches, packs, packGenerationJobs, implementationProjects);
  return { svc, permissions, audit, workspaces, projects, niches, packs, packGenerationJobs, implementationProjects };
}

describe('McpToolsService — scope + permission enforcement', () => {
  it('rejects a tool call when the session was not granted the required scope', async () => {
    const { svc } = makeService();
    await expect(svc.getWorkspaceContext(ctx([]))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a tool call when the live RBAC check fails even though the scope was granted', async () => {
    const { svc } = makeService({ canReturn: false });
    await expect(svc.getWorkspaceContext(ctx())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('McpToolsService — read tools call the same application services and shape their output', () => {
  it('get_workspace_context', async () => {
    const { svc, workspaces, audit } = makeService();
    const result = await svc.getWorkspaceContext(ctx());
    expect(workspaces.getById).toHaveBeenCalledWith('ws1');
    expect(result).toMatchObject({ id: 'ws1', name: 'Acme Lab', billingPlan: 'free' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'mcp.tool_invoked', metadata: expect.objectContaining({ tool: 'get_workspace_context' }) }));
  });

  it('list_research', async () => {
    const { svc, projects } = makeService();
    const result = await svc.listResearch(ctx());
    expect(projects.listForWorkspace).toHaveBeenCalledWith('ws1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'p1', name: 'Research 1' });
  });

  it('get_research', async () => {
    const { svc, projects } = makeService();
    const result = await svc.getResearch(ctx(), { researchId: 'p1' });
    expect(projects.getById).toHaveBeenCalledWith('ws1', 'p1');
    expect(result).toMatchObject({ id: 'p1' });
  });

  it('list_opportunities', async () => {
    const { svc, niches } = makeService();
    const result = await svc.listOpportunities(ctx(), { researchId: 'p1' });
    expect(niches.listAll).toHaveBeenCalledWith('ws1', 'p1');
    expect(result[0]).toMatchObject({ id: 'n1', title: 'Niche 1' });
  });

  it('get_opportunity includes the venture thesis when available', async () => {
    const { svc, niches } = makeService();
    const result = await svc.getOpportunity(ctx(), { opportunityId: 'n1' });
    expect(niches.get).toHaveBeenCalledWith('ws1', 'n1');
    expect(niches.ventureThesis).toHaveBeenCalledWith('ws1', 'n1');
    expect(result.ventureThesis).toMatchObject({ ventureScaleScore: 10 });
  });

  it('get_opportunity degrades gracefully when venture thesis computation fails', async () => {
    const { svc, niches } = makeService();
    (niches.ventureThesis as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no evidence yet'));
    const result = await svc.getOpportunity(ctx(), { opportunityId: 'n1' });
    expect(result.ventureThesis).toBeNull();
  });

  it('get_product_pack', async () => {
    const { svc, packs } = makeService();
    const result = await svc.getProductPack(ctx(), { packId: 'pack1' });
    expect(packs.getPack).toHaveBeenCalledWith('ws1', 'pack1');
    expect(result).toMatchObject({ id: 'pack1', title: 'Pack' });
  });

  it('get_generation_status', async () => {
    const { svc, packGenerationJobs } = makeService();
    const result = await svc.getGenerationStatus(ctx(), { packId: 'pack1' });
    expect(packGenerationJobs.getDiagnosticsForPack).toHaveBeenCalledWith('ws1', 'pack1');
    expect(result).toMatchObject({ jobId: 'job1', buildReady: true, contextChanged: false });
  });

  it('get_project', async () => {
    const { svc, implementationProjects } = makeService();
    const result = await svc.getProject(ctx(), { projectId: 'ip1' });
    expect(implementationProjects.get).toHaveBeenCalledWith('ws1', 'ip1');
    expect(result).toMatchObject({ id: 'ip1', status: 'active' });
    expect(result.lineage.opportunity).toEqual({ id: 'n1', title: 'Niche 1' });
  });

  it('never returns a workspaceId argument to the underlying service other than the session\'s own — a tool cannot be pointed at another workspace', async () => {
    const { svc, packs } = makeService();
    await svc.getProductPack(ctx(), { packId: 'pack-in-another-workspace' } as never);
    // The session's workspaceId is always first — the tool has no way to override it.
    expect(packs.getPack).toHaveBeenCalledWith('ws1', 'pack-in-another-workspace');
  });
});
