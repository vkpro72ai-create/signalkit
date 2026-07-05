import { describe, it, expect, vi } from 'vitest';
import { ExportRendererService, type EvidenceData, type PackRow, type PackDocumentRow } from './export-renderer.service';
import { ExportManifestService } from './export-manifest.service';
import { ExportStorageService } from './export-storage.service';
import { ExportJobService } from './export-job.service';
import {
  ROLE_BRIEF_DOCUMENTS,
  AI_AGENT_BUNDLE_FILES,
  MARKDOWN_ZIP_FOLDERS,
  isPdfExport,
  isZipExport,
  mimeTypeForExport,
  fileNameForExport,
} from '@signalkit/exports';
import type { ExportManifest } from '@signalkit/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePack(over: Partial<PackRow> = {}): PackRow {
  return {
    id: 'pack1', title: 'Clinic WhatsApp Copilot', version: 1, depth: 'build_ready',
    verticalTemplate: 'b2b_saas', primaryLanguage: 'en', projectId: 'proj1',
    nicheId: 'niche1', workspaceId: 'ws1',
    ...over,
  };
}

function makeDoc(docType: string, body?: string): PackDocumentRow {
  return {
    id: `doc_${docType}`, docType, title: docType.replace(/_/g, ' '),
    body: body ?? `# ${docType}\n\nContent for ${docType}.\n\n## Section\n\nDetails here.\n`,
    language: 'en', metadata: {},
  };
}

function makeEvidence(over: Partial<EvidenceData> = {}): EvidenceData {
  return {
    evidence: [{ id: 'ev1', summary: 'Users want automation', sourceRefId: 'src1', evidenceType: 'observation' }],
    claims: [{ id: 'c1', text: 'High demand exists', type: 'market_demand', confidenceLevel: 'high' }],
    assumptions: [{ id: 'a1', text: 'Clinics will pay monthly', validationStatus: 'untested' }],
    constraints: [{ id: 'k1', text: 'Must comply with WhatsApp Business Policy', category: 'legal' }],
    unresolvedQuestions: [{ id: 'q1', text: 'What is the real conversion rate?', status: 'open', priority: 'high' }],
    sourceRefs: [{ id: 'src1', url: 'https://example.com', title: 'Forum post', adapter: 'url' }],
    qualityGate: { status: 'passed', passedCount: 10, warnCount: 2, failCount: 0, checks: [] },
    researchUpdates: [{ id: 'ru1', title: 'Customer interview', type: 'customer_interview', content: 'Users confirmed pain.', createdAt: new Date('2026-06-01') }],
    ...over,
  };
}

function makeManifest(over: Partial<ExportManifest> = {}): ExportManifest {
  return {
    schemaVersion: '1.0.0', exportId: 'job1', workspaceId: 'ws1', projectId: 'proj1',
    packId: 'pack1', packVersion: 1, exportType: 'markdown_zip', outputLanguage: 'en',
    createdBy: 'user1', generatedAt: '2026-06-28T00:00:00.000Z',
    documentList: [], includedDocuments: [], excludedDocuments: [],
    qualityGateSummary: { status: 'passed', passedCount: 10, warnCount: 2, failCount: 0 },
    evidenceSummary: { count: 1, ids: ['ev1'] },
    assumptionsSummary: { count: 1, ids: ['a1'] },
    constraintsSummary: { count: 1, ids: ['k1'] },
    unresolvedQuestionsSummary: { count: 1, ids: ['q1'] },
    sourceRefs: [{ id: 'src1', url: null, title: 'Forum', adapter: 'url' }],
    roleBriefType: null, whiteLabelSettings: null,
    fileList: [], checksum: null,
    // Legacy compat
    language: 'en', files: [], documentCount: 0, evidenceCount: 1, claimCount: 1,
    ...over,
  };
}

const ALL_DOC_TYPES = [
  'product_vision', 'market_context', 'market_selection_memo',
  'target_audience_icp', 'jobs_to_be_done', 'problem_map', 'user_scenarios',
  'feature_checklist', 'mvp_scope', 'post_mvp_scope',
  'ux_flow', 'screen_map', 'design_brd',
  'frontend_brd', 'backend_brd', 'data_model', 'api_requirements',
  'ai_agent_instructions', 'acceptance_criteria',
  'monetization_plan', 'go_to_market_plan', 'analytics_plan',
  'risks_and_assumptions', 'research_questions', 'evidence_map', 'source_appendix', 'roadmap',
];

// ── Export type and manifest helpers ──────────────────────────────────────────

describe('export type helpers (@signalkit/exports)', () => {
  it('classifies PDF types correctly', () => {
    expect(isPdfExport('full_pdf_pack')).toBe(true);
    expect(isPdfExport('founder_summary_pdf')).toBe(true);
    expect(isPdfExport('markdown_zip')).toBe(false);
    expect(isPdfExport('ai_agent_engineering_bundle')).toBe(false);
  });

  it('classifies ZIP types correctly', () => {
    expect(isZipExport('markdown_zip')).toBe(true);
    expect(isZipExport('ai_agent_engineering_bundle')).toBe(true);
    expect(isZipExport('full_pdf_pack')).toBe(false);
  });

  it('returns correct mime types', () => {
    expect(mimeTypeForExport('full_pdf_pack')).toBe('application/pdf');
    expect(mimeTypeForExport('markdown_zip')).toBe('application/zip');
    expect(mimeTypeForExport('pm_brief')).toContain('markdown');
  });

  it('generates stable file names with pack slug and date', () => {
    const name = fileNameForExport('markdown_zip', 'Clinic WhatsApp Copilot', 'en');
    expect(name).toContain('markdown_zip');
    expect(name).toContain('en');
    expect(name).toMatch(/\.zip$/);
  });

  it('role brief documents are non-empty for all roles', () => {
    const roles = ['founder', 'pm', 'designer', 'frontend', 'backend', 'growth', 'sales', 'investor', 'ai_agent'] as const;
    for (const role of roles) {
      expect(ROLE_BRIEF_DOCUMENTS[role].length).toBeGreaterThan(0);
    }
  });

  it('AI agent bundle file list includes required files', () => {
    const required = ['manifest.json', 'README_FOR_AGENT.md', 'feature_checklist.md', 'acceptance_criteria.md', 'data_model.json', 'api_requirements.yaml'];
    for (const f of required) {
      expect(AI_AGENT_BUNDLE_FILES).toContain(f);
    }
  });

  it('Markdown ZIP folders include all expected directories', () => {
    expect(MARKDOWN_ZIP_FOLDERS).toContain('00_sources');
    expect(MARKDOWN_ZIP_FOLDERS).toContain('08_evidence');
    expect(MARKDOWN_ZIP_FOLDERS).toContain('06_ai_handoff');
    expect(MARKDOWN_ZIP_FOLDERS).toContain('09_governance');
  });
});

// ── ExportManifestService ─────────────────────────────────────────────────────

describe('ExportManifestService', () => {
  const svc = new ExportManifestService();

  it('builds a valid manifest with all required fields', () => {
    const manifest = svc.build({
      exportId: 'job1',
      workspaceId: 'ws1',
      packId: 'pack1',
      exportType: 'markdown_zip',
      outputLanguage: 'en',
      createdBy: 'user1',
      roleBriefType: null,
      whiteLabelSettings: null,
      pack: { version: 1, projectId: 'proj1', documents: [makeDoc('product_vision')] },
      fileList: [{ path: 'product-pack/01_strategy/product_vision.md', docType: 'product_vision', bytes: 512 }],
      qualityGate: { status: 'passed', passedCount: 10, warnCount: 2, failCount: 0 },
      evidence: [{ id: 'ev1' }],
      claims: [{ id: 'c1' }],
      assumptions: [{ id: 'a1' }],
      constraints: [{ id: 'k1' }],
      unresolvedQuestions: [{ id: 'q1' }],
      sourceRefs: [{ id: 'src1', url: null, title: null, adapter: 'url' }],
      includedDocuments: ['product_vision'],
      excludedDocuments: [],
      checksum: 'abc123',
    });

    expect(manifest.schemaVersion).toBe('1.0.0');
    expect(manifest.exportId).toBe('job1');
    expect(manifest.workspaceId).toBe('ws1');
    expect(manifest.packId).toBe('pack1');
    expect(manifest.exportType).toBe('markdown_zip');
    expect(manifest.evidenceSummary.count).toBe(1);
    expect(manifest.assumptionsSummary.count).toBe(1);
    expect(manifest.qualityGateSummary?.status).toBe('passed');
    expect(manifest.checksum).toBe('abc123');
  });

  it('snapshots white-label settings into manifest', () => {
    const manifest = svc.build({
      exportId: null, workspaceId: 'ws1', packId: 'pack1', exportType: 'client_agency_export',
      outputLanguage: 'en', createdBy: null, roleBriefType: null,
      whiteLabelSettings: { brandName: 'Acme Corp', logoUrl: null, preparedBy: 'Jane', clientName: 'Client Co', footerText: 'Confidential', customDisclaimer: null, hideSignalKitBrand: true },
      pack: { version: 2, projectId: 'p1', documents: [] },
      fileList: [], qualityGate: null, evidence: [], claims: [], assumptions: [],
      constraints: [], unresolvedQuestions: [], sourceRefs: [],
      includedDocuments: [], excludedDocuments: [], checksum: null,
    });
    expect(manifest.whiteLabelSettings?.brandName).toBe('Acme Corp');
    expect(manifest.whiteLabelSettings?.hideSignalKitBrand).toBe(true);
    expect(manifest.whiteLabelSettings?.clientName).toBe('Client Co');
  });

  it('does not include raw secrets in manifest', () => {
    const manifest = svc.build({
      exportId: 'j1', workspaceId: 'ws1', packId: 'p1', exportType: 'json_bundle',
      outputLanguage: 'en', createdBy: 'u1', roleBriefType: null, whiteLabelSettings: null,
      pack: { version: 1, projectId: 'proj1', documents: [] },
      fileList: [], qualityGate: null, evidence: [], claims: [], assumptions: [],
      constraints: [], unresolvedQuestions: [], sourceRefs: [],
      includedDocuments: [], excludedDocuments: [], checksum: null,
    });
    const json = JSON.stringify(manifest);
    expect(json).not.toContain('password');
    expect(json).not.toContain('encryptedKey');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('sk-');
  });
});

// ── ExportRendererService ─────────────────────────────────────────────────────

describe('ExportRendererService — Markdown ZIP', () => {
  const renderer = new ExportRendererService();
  const pack = makePack();
  const ev = makeEvidence();
  const manifest = makeManifest();
  const docs = ALL_DOC_TYPES.map((dt) => makeDoc(dt));

  it('produces a valid ZIP buffer with required top-level files', async () => {
    const JSZip = (await import('jszip')).default;
    const buf = await renderer.renderMarkdownZip(pack, docs, ev, manifest);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('product-pack/manifest.json')).not.toBeNull();
    expect(zip.file('product-pack/README.md')).not.toBeNull();
    expect(zip.file('product-pack/08_evidence/claims.json')).not.toBeNull();
    expect(zip.file('product-pack/08_evidence/assumptions.json')).not.toBeNull();
    expect(zip.file('product-pack/08_evidence/constraints.json')).not.toBeNull();
    expect(zip.file('product-pack/08_evidence/unresolved_questions.json')).not.toBeNull();
    expect(zip.file('product-pack/00_sources/source_appendix.md')).not.toBeNull();
    expect(zip.file('product-pack/00_sources/source_refs.json')).not.toBeNull();
    expect(zip.file('product-pack/06_ai_handoff/quality_gates.json')).not.toBeNull();
    expect(zip.file('product-pack/09_governance/research_updates.md')).not.toBeNull();
  });

  it('manifest.json inside ZIP is valid JSON with schemaVersion', async () => {
    const JSZip = (await import('jszip')).default;
    const buf = await renderer.renderMarkdownZip(pack, docs, ev, manifest);
    const zip = await JSZip.loadAsync(buf);
    const content = await zip.file('product-pack/manifest.json')!.async('string');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.packId).toBe('pack1');
  });

  it('evidence and claims are included in ZIP', async () => {
    const JSZip = (await import('jszip')).default;
    const buf = await renderer.renderMarkdownZip(pack, docs, ev, manifest);
    const zip = await JSZip.loadAsync(buf);
    const claimsJson = await zip.file('product-pack/08_evidence/claims.json')!.async('string');
    const claims = JSON.parse(claimsJson) as unknown[];
    expect(claims).toHaveLength(1);
    const assumptionsJson = await zip.file('product-pack/08_evidence/assumptions.json')!.async('string');
    const assumptions = JSON.parse(assumptionsJson) as unknown[];
    expect(assumptions).toHaveLength(1);
  });
});

describe('ExportRendererService — AI-Agent Bundle', () => {
  const renderer = new ExportRendererService();

  it('produces a ZIP with all required AI-agent bundle files', async () => {
    const JSZip = (await import('jszip')).default;
    const pack = makePack();
    const docs = ALL_DOC_TYPES.map((dt) => makeDoc(dt));
    const ev = makeEvidence();
    const manifest = makeManifest({ exportType: 'ai_agent_engineering_bundle' });

    const buf = await renderer.renderAiAgentBundle(pack, docs, ev, manifest);
    const zip = await JSZip.loadAsync(buf);

    const requiredFiles = ['manifest.json', 'README_FOR_AGENT.md', 'feature_checklist.md', 'acceptance_criteria.md', 'coding_constraints.md', 'evidence.json', 'claims.json', 'assumptions.json', 'unresolved_questions.json', 'quality_gates.json', 'source_refs.json'];
    for (const f of requiredFiles) {
      expect(zip.file(f), `Missing file: ${f}`).not.toBeNull();
    }
  });

  it('README_FOR_AGENT.md contains implementation rules', async () => {
    const JSZip = (await import('jszip')).default;
    const buf = await renderer.renderAiAgentBundle(makePack(), ALL_DOC_TYPES.map((dt) => makeDoc(dt)), makeEvidence(), makeManifest());
    const zip = await JSZip.loadAsync(buf);
    const readme = await zip.file('README_FOR_AGENT.md')!.async('string');
    expect(readme).toContain('Do not invent missing requirements');
    expect(readme).toContain('Unresolved questions must remain unresolved');
    expect(readme).toContain('Assumptions are NOT facts');
    expect(readme).toContain('Do not build outside MVP scope');
  });

  it('assumptions.json in AI bundle includes the assumption data', async () => {
    const JSZip = (await import('jszip')).default;
    const ev = makeEvidence({ assumptions: [{ id: 'a99', text: 'Users will pay $50/month', validationStatus: 'untested' }] });
    const buf = await renderer.renderAiAgentBundle(makePack(), ALL_DOC_TYPES.map((dt) => makeDoc(dt)), ev, makeManifest());
    const zip = await JSZip.loadAsync(buf);
    const assumptionsStr = await zip.file('assumptions.json')!.async('string');
    expect(assumptionsStr).toContain('a99');
    expect(assumptionsStr).toContain('Users will pay $50/month');
  });
});

describe('ExportRendererService — Build Blueprint files (Session 14)', () => {
  const renderer = new ExportRendererService();

  const blueprint: NonNullable<EvidenceData['blueprint']> = {
    screenContracts: [{
      name: 'Home', purpose: 'p', userIntent: 'u', entryPoints: [], exitPoints: [], primaryAction: 'GET /items',
      secondaryActions: [], dataShown: [], dataRequired: [], permissionRules: [], validationRules: [],
      backendDependencies: [], aiDependencies: [], edgeCases: [], analyticsEvents: [], microcopy: [], components: [],
      stateTransitions: [], acceptanceCriteria: ['Given/When/Then'],
      states: [{ kind: 'empty', behavior: 'b' }, { kind: 'loading', behavior: 'b' }, { kind: 'failed', behavior: 'b' }],
    }],
    stateMatrix: [{ screen: 'Home', states: ['empty', 'loading', 'failed'] }],
    apiToScreenMap: [{ screen: 'Home', endpoints: [{ method: 'GET', path: '/items', dataNeeded: 'x' }], actions: [], errorStates: [{ error: '5xx', uiState: 'failed' }] }],
    componentContracts: [{ name: 'EmptyState' }],
    permissionMatrix: [{ role: 'owner', allowedActions: ['view'], blockedActions: [], uiWhenBlocked: '' }],
    analyticsEvents: [{ event: 'home_viewed' }],
    doNotBuild: [{ item: 'App generation', reason: 'product law' }],
    validationRules: ['Validate fields'],
    buildReadinessScore: 88, buildReadinessLevel: 'high',
    buildReadinessBreakdown: [{ dimension: 'screen_state_coverage', score: 100, reasoning: 'ok' }],
    warnings: [],
  };

  const blueprintDocs = [
    ...ALL_DOC_TYPES.map((dt) => makeDoc(dt)),
    makeDoc('venture_thesis', '# Venture Thesis\n\nWedge then expansion. _(assumption — not yet validated)_\n'),
    makeDoc('build_blueprint', '# Build Blueprint\n\nBuild Readiness: 88/100.\n'),
    makeDoc('do_not_build', '# DO NOT BUILD\n\n- App generation — product law\n'),
  ];

  it('Markdown ZIP includes the structured blueprint files in 10_blueprint', async () => {
    const JSZip = (await import('jszip')).default;
    const ev = makeEvidence({ blueprint });
    const buf = await renderer.renderMarkdownZip(makePack(), blueprintDocs, ev, makeManifest());
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('product-pack/10_blueprint/SCREEN_CONTRACTS.json')).not.toBeNull();
    expect(zip.file('product-pack/10_blueprint/STATE_MATRIX.json')).not.toBeNull();
    expect(zip.file('product-pack/10_blueprint/API_TO_SCREEN_MAP.yaml')).not.toBeNull();
    expect(zip.file('product-pack/10_blueprint/PERMISSION_MATRIX.json')).not.toBeNull();
    // The venture/blueprint markdown docs route into 10_blueprint via folder map.
    expect(zip.file('product-pack/10_blueprint/venture_thesis.md')).not.toBeNull();
    expect(zip.file('product-pack/10_blueprint/build_blueprint.md')).not.toBeNull();
    expect(zip.file('product-pack/10_blueprint/do_not_build.md')).not.toBeNull();
  });

  it('AI-Agent bundle includes the blueprint files and agent rules', async () => {
    const JSZip = (await import('jszip')).default;
    const ev = makeEvidence({ blueprint });
    const buf = await renderer.renderAiAgentBundle(makePack(), blueprintDocs, ev, makeManifest({ exportType: 'ai_agent_engineering_bundle' }));
    const zip = await JSZip.loadAsync(buf);
    for (const f of ['VENTURE_THESIS.md', 'BUILD_BLUEPRINT.md', 'SCREEN_CONTRACTS.json', 'STATE_MATRIX.json', 'API_TO_SCREEN_MAP.yaml', 'COMPONENT_CONTRACTS.json', 'PERMISSION_MATRIX.json', 'ANALYTICS_EVENTS.json', 'DO_NOT_BUILD.md', 'VALIDATION_RULES.md', 'EMPTY_LOADING_ERROR_STATES.md']) {
      expect(zip.file(f), `Missing bundle file: ${f}`).not.toBeNull();
    }
    const readme = await zip.file('README_FOR_AGENT.md')!.async('string');
    expect(readme).toContain('Do not invent screen logic');
    expect(readme).toContain('implementation context, not permission');
  });
});

describe('ExportRendererService — Role Briefs', () => {
  const renderer = new ExportRendererService();

  it('generates a non-empty founder summary containing key sections', () => {
    const docs = ALL_DOC_TYPES.map((dt) => makeDoc(dt));
    const brief = renderer.renderRoleBrief('founder', makePack(), docs, makeEvidence());
    expect(brief).toContain('Founder Summary');
    expect(brief).toContain('product_vision');
    expect(brief.length).toBeGreaterThan(200);
  });

  it('generates a PM brief containing JTBD and acceptance criteria', () => {
    const docs = ALL_DOC_TYPES.map((dt) => makeDoc(dt));
    const brief = renderer.renderRoleBrief('pm', makePack(), docs, makeEvidence());
    expect(brief).toContain('jobs_to_be_done');
    expect(brief).toContain('acceptance_criteria');
  });

  it('includes evidence summary in founder brief', () => {
    const docs = ALL_DOC_TYPES.map((dt) => makeDoc(dt));
    const brief = renderer.renderRoleBrief('founder', makePack(), docs, makeEvidence());
    expect(brief).toContain('Evidence');
  });

  it('investor brief contains roadmap and investor memo sections', () => {
    const docs = ALL_DOC_TYPES.map((dt) => makeDoc(dt));
    const brief = renderer.renderRoleBrief('investor', makePack(), docs, makeEvidence());
    expect(brief).toContain('Investor Memo');
    expect(brief).toContain('roadmap');
  });
});

describe('ExportRendererService — Evidence Appendix', () => {
  const renderer = new ExportRendererService();

  it('renders evidence appendix with claims and assumptions', () => {
    const ev = makeEvidence();
    const appendix = renderer.renderEvidenceAppendix(ev);
    expect(appendix).toContain('Claims');
    expect(appendix).toContain('High demand exists');
    expect(appendix).toContain('Assumptions');
    expect(appendix).toContain('Clinics will pay monthly');
    expect(appendix).toContain('Unresolved Questions');
  });

  it('renders source appendix listing all sources', () => {
    const appendix = renderer.renderSourceAppendix([{ id: 'src1', url: 'https://example.com', title: 'Forum post', adapter: 'url' }]);
    expect(appendix).toContain('Forum post');
    expect(appendix).toContain('url');
    expect(appendix).toContain('https://example.com');
  });

  it('renders evidence appendix headings in Russian when the pack language is ru', () => {
    const ev = makeEvidence();
    const appendix = renderer.renderEvidenceAppendix(ev, 'ru');
    expect(appendix).toContain('Утверждения'); // Claims
    expect(appendix).toContain('Допущения'); // Assumptions
    expect(appendix).toContain('Открытые вопросы'); // Unresolved Questions
    expect(appendix).not.toContain('Claims');
    expect(appendix).not.toContain('Assumptions');
  });
});

describe('ExportRendererService — localized export bundle (real multilingualism regression)', () => {
  const renderer = new ExportRendererService();

  it('renders the ZIP README, DO_NOT_BUILD fallback and role brief in the pack language, not English', async () => {
    const JSZip = (await import('jszip')).default;
    const pack = makePack({ primaryLanguage: 'ru' });
    const ev = makeEvidence();
    const manifest = makeManifest({ outputLanguage: 'ru' });
    // Deliberately omit do_not_build so the localized fallback text is exercised.
    const docs = ALL_DOC_TYPES.filter((dt) => dt !== 'do_not_build').map((dt) => makeDoc(dt));

    const zipBuf = await renderer.renderMarkdownZip(pack, docs, ev, manifest);
    const zip = await JSZip.loadAsync(zipBuf);
    const readme = await zip.file('product-pack/README.md')!.async('string');
    expect(readme).toContain('Содержание'); // Contents
    expect(readme).toContain('Папки'); // Folders
    expect(readme).not.toContain('Contents');
    expect(readme).not.toContain('Folders');

    const agentBuf = await renderer.renderAiAgentBundle(pack, docs, ev, manifest);
    const agentZip = await JSZip.loadAsync(agentBuf);
    const doNotBuild = await agentZip.file('DO_NOT_BUILD.md')!.async('string');
    expect(doNotBuild).toContain('ЧТО НЕ СТРОИТЬ');

    const brief = renderer.renderRoleBrief('founder', pack, docs, ev);
    expect(brief).toContain('Сводка для фаундера'); // Founder Summary
    expect(brief).not.toContain('Founder Summary');
  });
});

// ── ExportStorageService ──────────────────────────────────────────────────────

describe('ExportStorageService', () => {
  it('computes consistent sha256 checksum', () => {
    const storage = new ExportStorageService();
    const buf = Buffer.from('test content for checksum');
    const checksum = storage.sha256(buf);
    expect(checksum).toHaveLength(64); // sha256 hex
    expect(storage.sha256(buf)).toBe(checksum); // deterministic
  });
});

// ── ExportJobService (inline mode) ────────────────────────────────────────────

describe('ExportJobService — inline export (no Redis)', () => {
  it('fails visibly when pack does not exist', async () => {
    const prisma = {
      exportJob: {
        findFirst: vi.fn().mockResolvedValue({ id: 'j1', workspaceId: 'ws1', packId: 'missing', type: 'markdown_zip', language: 'en', roleBrief: null, applyBranding: false, requestedById: 'u1', retries: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
      productDocumentPack: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    const svc = new ExportJobService(
      prisma as unknown as import('../prisma/prisma.service').PrismaService,
      new ExportStorageService(),
      new ExportManifestService(),
      new ExportRendererService(),
      null as unknown as import('./export-pdf.service').ExportPdfService,
    );

    await svc.process('j1', 'ws1');

    expect(prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('produces ready status and artifact for markdown_zip inline', async () => {
    const pack = {
      id: 'pack1', title: 'Test Pack', version: 1, depth: 'build_ready', verticalTemplate: 'b2b_saas',
      primaryLanguage: 'en', projectId: 'proj1', nicheId: 'n1', workspaceId: 'ws1',
      documents: [makeDoc('product_vision'), makeDoc('mvp_scope')],
    };
    const job = { id: 'j1', workspaceId: 'ws1', packId: 'pack1', type: 'markdown_zip', language: 'en', roleBrief: null, applyBranding: false, requestedById: 'u1', retries: 0 };

    const artifactId = 'art1';
    const prisma = {
      exportJob: {
        findFirst: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockResolvedValue({ ...job, status: 'ready' }),
      },
      productDocumentPack: { findFirst: vi.fn().mockResolvedValue(pack) },
      evidenceItem: { findMany: vi.fn().mockResolvedValue([]) },
      claim: { findMany: vi.fn().mockResolvedValue([]) },
      assumption: { findMany: vi.fn().mockResolvedValue([]) },
      constraint: { findMany: vi.fn().mockResolvedValue([]) },
      unresolvedQuestion: { findMany: vi.fn().mockResolvedValue([]) },
      sourceReference: { findMany: vi.fn().mockResolvedValue([]) },
      qualityGateResult: { findFirst: vi.fn().mockResolvedValue(null) },
      researchUpdate: { findMany: vi.fn().mockResolvedValue([]) },
      buildBlueprint: { findFirst: vi.fn().mockResolvedValue(null) },
      workspaceSettings: { findFirst: vi.fn().mockResolvedValue(null) },
      exportArtifact: { create: vi.fn().mockResolvedValue({ id: artifactId, storageKey: 'ws1/j1/file.zip', fileName: 'test.zip', mimeType: 'application/zip', sizeBytes: 1024, checksum: 'abc' }) },
    };

    const storage = new ExportStorageService();
    storage.write = vi.fn().mockResolvedValue('ws1/j1/file.zip');

    const svc = new ExportJobService(
      prisma as unknown as import('../prisma/prisma.service').PrismaService,
      storage,
      new ExportManifestService(),
      new ExportRendererService(),
      null as unknown as import('./export-pdf.service').ExportPdfService,
    );

    await svc.process('j1', 'ws1');

    const lastUpdateCall = (prisma.exportJob.update as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [{ data: Record<string, unknown> }];
    expect(lastUpdateCall[0].data.status).toBe('ready');
  });
});

// ── RBAC: no raw secrets in manifest ─────────────────────────────────────────

describe('Export RBAC and security', () => {
  it('role brief documents do not include LLM connection secrets', () => {
    for (const role of ['founder', 'pm', 'designer', 'frontend', 'backend', 'growth', 'sales', 'investor', 'ai_agent'] as const) {
      const docs = ROLE_BRIEF_DOCUMENTS[role];
      expect(docs).not.toContain('llm_settings');
      expect(docs).not.toContain('api_keys');
      const docsStr = JSON.stringify(docs);
      expect(docsStr).not.toContain('encryptedKey');
      expect(docsStr).not.toContain('passwordHash');
    }
  });
});
