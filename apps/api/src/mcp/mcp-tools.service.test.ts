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
import type { ResearchService } from '../packs/research.service';
import type { ExportJobService } from '../exports/export-job.service';
import { McpToolsService } from './mcp-tools.service';
import type { McpAuthContext } from './mcp-auth.service';

const ALL_SCOPES = [
  'workspace:read', 'project:read', 'project:create', 'project:update',
  'niche:read', 'niche:discover', 'pack:read', 'pack:edit', 'pack:generate',
  'pack:approve', 'comment:create', 'export:read', 'export:create',
];

function ctx(scopes: string[] = ALL_SCOPES): McpAuthContext {
  return { sessionId: 's1', workspaceId: 'ws1', userId: 'user1', scopes: scopes as never, clientName: 'Test Client' };
}

function makeService(opts: { canReturn?: boolean } = {}) {
  const permissions = { can: vi.fn().mockResolvedValue(opts.canReturn ?? true) } as unknown as PermissionsService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const workspaces = {
    getById: vi.fn().mockResolvedValue({ id: 'ws1', name: 'Acme Lab', slug: 'acme', settings: { defaultLocale: 'en', defaultMarketCountry: null, defaultMarketRegion: null, billingPlan: 'free', aiEngineName: null } }),
  } as unknown as WorkspacesService;
  const researchRow = { id: 'p1', name: 'Research 1', goal: '', status: 'active', marketScope: 'global', targetCountry: null, targetRegion: null, targetCountries: [], targetRegions: [], marketLanguage: 'en', defaultOutputLanguage: 'en', createdAt: new Date(), updatedAt: new Date() };
  const projects = {
    listForWorkspace: vi.fn().mockResolvedValue([researchRow]),
    getById: vi.fn().mockResolvedValue(researchRow),
    create: vi.fn().mockResolvedValue(researchRow),
    setArchived: vi.fn().mockResolvedValue({ ...researchRow, status: 'archived' }),
  } as unknown as ProjectsService;
  const discoveryResult = {
    niches: 1,
    opportunities: [{ id: 'n1', name: 'Niche 1', oneLiner: '', riskLevel: 'medium', projectId: 'p1', targetMarket: null, evidenceCount: 0, opportunityScore: 0, confidence: { level: 'low', value: 0 } }],
    generation: { provider: 'openai', model: 'gpt-4o-mini', mode: 'starter_discovery' },
  };
  const niches = {
    listAll: vi.fn().mockResolvedValue([{ id: 'n1', name: 'Niche 1', oneLiner: '', whyNow: '', riskLevel: 'medium', projectId: 'p1', targetMarket: null, evidenceCount: 0, opportunityScore: 0, confidence: { level: 'low', value: 0 }, ventureScaleScore: null, ventureScaleLevel: null, buildReadinessScore: null }]),
    get: vi.fn().mockResolvedValue({ id: 'n1', projectId: 'p1', title: 'Niche 1', oneLiner: '', problem: '', targetAudience: '', whyNow: '', useCases: [], competitors: [], mvpConcept: '', monetization: '', recommendedProductFormat: '', riskLevel: 'medium', language: 'en', intakeMode: 'discovered', founderIdeaText: '', scores: [] }),
    ventureThesis: vi.fn().mockResolvedValue({ thesis: {}, ventureScaleScore: 10, ventureScaleConfidence: 0.5, ventureScaleLevel: 'low', whatMustBeTrue: [] }),
    discover: vi.fn().mockResolvedValue(discoveryResult),
    createFromIdea: vi.fn().mockResolvedValue(discoveryResult),
  } as unknown as NichesService;
  const packs = {
    getPack: vi.fn().mockResolvedValue({ id: 'pack1', nicheId: 'n1', projectId: 'p1', title: 'Pack', depth: 'build_ready', verticalTemplate: 'saas', primaryLanguage: 'en', status: 'draft', confidenceValue: 0, confidenceLevel: 'low', version: 1, qualityGate: null, documents: [] }),
  } as unknown as PackService;
  const generationJobRow = { id: 'job1', packId: 'pack1', status: 'queued', generationMode: 'standard', currentStep: null, progressPercent: 0, readyDocumentCount: 0, totalExpectedDocumentCount: 9, buildReady: false, errorCode: null, errorReason: null, startedAt: null, completedAt: null, steps: [] };
  const packGenerationJobs = {
    getDiagnosticsForPack: vi.fn().mockResolvedValue({ job: { ...generationJobRow, status: 'completed', buildReady: true }, contextChanged: false }),
    create: vi.fn().mockResolvedValue(generationJobRow),
  } as unknown as PackGenerationJobService;
  const implementationProjectRow = { id: 'ip1', status: 'active', ambitionMode: 'cash_flow_business', founderRatingSnapshot: 5, founderCommentSnapshot: '', buildReadySnapshot: true, ventureReadySnapshot: false, unicornPotentialSnapshot: false, topRisksSnapshot: [], committedAt: new Date(), lineage: { research: { id: 'p1', name: 'Research 1' }, opportunity: { id: 'n1', title: 'Niche 1' }, pack: { id: 'pack1', title: 'Pack', status: 'draft' } } };
  const implementationProjects = {
    get: vi.fn().mockResolvedValue(implementationProjectRow),
    upsertFounderVerdict: vi.fn().mockResolvedValue({ rating: 5, comment: 'Love it', decision: 'ready_to_commit', updatedAt: new Date() }),
    promote: vi.fn().mockResolvedValue({ id: 'ip1' }),
  } as unknown as ImplementationProjectsService;
  const researchNotes = {
    create: vi.fn().mockResolvedValue({ id: 'note1', title: 'Interview #4', type: 'customer_interview', content: 'They hate the manual process', language: 'en', createdAt: new Date() }),
  } as unknown as ResearchService;
  const exportJobRow = { id: 'export1', packId: 'pack1', type: 'markdown_zip', language: 'en', status: 'queued', errorCode: null, createdAt: new Date(), artifact: null };
  const exportJobs = {
    create: vi.fn().mockResolvedValue(exportJobRow),
    getJob: vi.fn().mockResolvedValue({ ...exportJobRow, status: 'ready', artifact: { fileName: 'pack.zip', mimeType: 'application/zip', sizeBytes: 1024 } }),
  } as unknown as ExportJobService;

  const svc = new McpToolsService(permissions, audit, workspaces, projects, niches, packs, packGenerationJobs, implementationProjects, researchNotes, exportJobs);
  return { svc, permissions, audit, workspaces, projects, niches, packs, packGenerationJobs, implementationProjects, researchNotes, exportJobs };
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

describe('McpToolsService — Phase B operator tools call the same application services and preserve their gates', () => {
  it('create_research', async () => {
    const { svc, projects } = makeService();
    const result = await svc.createResearch(ctx(), { name: 'WhatsApp AI copilot' });
    expect(projects.create).toHaveBeenCalledWith('ws1', 'user1', { name: 'WhatsApp AI copilot' });
    expect(result).toMatchObject({ id: 'p1' });
  });

  it('archive_research', async () => {
    const { svc, projects } = makeService();
    await svc.archiveResearch(ctx(), { researchId: 'p1', archived: true });
    expect(projects.setArchived).toHaveBeenCalledWith('ws1', 'p1', true);
  });

  it('discover_opportunities always forces the gated find_opportunities mode, never the ungated radar scan', async () => {
    const { svc, niches } = makeService();
    await svc.discoverOpportunities(ctx(), { researchId: 'p1', directions: ['compliance automation'], audiences: ['SMBs'] });
    expect(niches.discover).toHaveBeenCalledWith(
      'ws1',
      'p1',
      expect.objectContaining({ mode: 'find_opportunities', directions: ['compliance automation'], audiences: ['SMBs'] }),
      'user1',
    );
  });

  it('discover_opportunities surfaces the existing brief-completeness gate rejection unchanged', async () => {
    const { svc, niches } = makeService();
    (niches.discover as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('incomplete'), { response: { code: 'opportunity_search_context_incomplete' } }),
    );
    await expect(svc.discoverOpportunities(ctx(), { researchId: 'p1' })).rejects.toThrow();
  });

  it('create_opportunity_from_idea', async () => {
    const { svc, niches } = makeService();
    const result = await svc.createOpportunityFromIdea(ctx(), { researchId: 'p1', founderIdea: 'A'.repeat(40) });
    expect(niches.createFromIdea).toHaveBeenCalledWith('ws1', 'p1', { founderIdea: 'A'.repeat(40) }, 'user1');
    expect(result.opportunities[0]).toMatchObject({ id: 'n1' });
  });

  it('set_opportunity_verdict uses the same permission as the web app\'s founder-verdict endpoint (comment:create)', async () => {
    const { svc, implementationProjects, permissions } = makeService();
    await svc.setOpportunityVerdict(ctx(), { opportunityId: 'n1', rating: 5, decision: 'ready_to_commit' });
    expect(implementationProjects.upsertFounderVerdict).toHaveBeenCalledWith('ws1', 'n1', 'user1', { rating: 5, decision: 'ready_to_commit' });
    expect(permissions.can).toHaveBeenCalledWith('user1', 'ws1', ['comment:create']);
  });

  it('save_research_note', async () => {
    const { svc, researchNotes } = makeService();
    const result = await svc.saveResearchNote(ctx(), { packId: 'pack1', title: 'Interview #4', type: 'customer_interview', content: 'They hate the manual process' });
    expect(researchNotes.create).toHaveBeenCalledWith('ws1', 'pack1', 'user1', { title: 'Interview #4', type: 'customer_interview', content: 'They hate the manual process' });
    expect(result).toMatchObject({ id: 'note1' });
  });

  it('start_pack_generation', async () => {
    const { svc, packGenerationJobs } = makeService();
    const result = await svc.startPackGeneration(ctx(), { opportunityId: 'n1', depth: 'build_ready', vertical: 'b2b_saas' });
    expect(packGenerationJobs.create).toHaveBeenCalledWith(
      'ws1',
      'n1',
      { depth: 'build_ready', vertical: 'b2b_saas', language: undefined },
      'user1',
      'standard',
    );
    expect(result).toMatchObject({ jobId: 'job1' });
  });

  it('promote_to_project passes commitmentConfirmed/reviewedRisks straight through to the two-gate service — the tool does not decide them itself', async () => {
    const { svc, implementationProjects } = makeService();
    await svc.promoteToProject(ctx(), { packId: 'pack1', ambitionMode: 'venture_scale', commitmentConfirmed: true, reviewedRisks: true });
    expect(implementationProjects.promote).toHaveBeenCalledWith('ws1', 'pack1', 'user1', {
      ambitionMode: 'venture_scale',
      commitmentConfirmed: true,
      reviewedRisks: true,
    });
    // Re-reads through .get() so the response carries the same lineage shape as get_project.
    expect(implementationProjects.get).toHaveBeenCalledWith('ws1', 'ip1');
  });

  it('promote_to_project surfaces the existing system/founder gate rejections unchanged (not_build_ready, commitment_required, etc.)', async () => {
    const { svc, implementationProjects } = makeService();
    (implementationProjects.promote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('not_build_ready'));
    await expect(
      svc.promoteToProject(ctx(), { packId: 'pack1', ambitionMode: 'cash_flow_business', commitmentConfirmed: false, reviewedRisks: false }),
    ).rejects.toThrow('not_build_ready');
  });

  it('create_export', async () => {
    const { svc, exportJobs } = makeService();
    const result = await svc.createExport(ctx(), { packId: 'pack1', type: 'markdown_zip' });
    expect(exportJobs.create).toHaveBeenCalledWith('ws1', 'pack1', 'user1', 'markdown_zip', 'en', null, false);
    expect(result).toMatchObject({ id: 'export1' });
  });

  it('get_export', async () => {
    const { svc, exportJobs } = makeService();
    const result = await svc.getExport(ctx(), { exportId: 'export1' });
    expect(exportJobs.getJob).toHaveBeenCalledWith('ws1', 'export1');
    expect(result).toMatchObject({ status: 'ready', artifact: { fileName: 'pack.zip' } });
  });

  it('every Phase B write/execute tool still enforces its own scope even when other scopes are granted', async () => {
    const { svc } = makeService();
    await expect(svc.promoteToProject(ctx(['workspace:read']), { packId: 'pack1', ambitionMode: 'cash_flow_business', commitmentConfirmed: true, reviewedRisks: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.startPackGeneration(ctx(['workspace:read']), { opportunityId: 'n1', depth: 'build_ready', vertical: 'b2b_saas' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
