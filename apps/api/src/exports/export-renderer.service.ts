import { Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import type {
  ExportManifest,
  RoleBriefType,
  DocumentType,
  ScreenContract,
  ApiToScreenMapEntry,
  DoNotBuildItem,
} from '@signalkit/shared';
import {
  DOCUMENT_FOLDER,
  DOCUMENT_FILENAME,
  ROLE_BRIEF_DOCUMENTS,
} from '@signalkit/exports';

export interface PackDocumentRow {
  id: string;
  docType: string;
  title: string;
  body: string;
  language: string;
  metadata: unknown;
}

export interface EvidenceData {
  evidence: { id: string; summary: string; sourceRefId: string; evidenceType: string }[];
  claims: { id: string; text: string; type: string; confidenceLevel: string }[];
  assumptions: { id: string; text: string; validationStatus: string }[];
  constraints: { id: string; text: string; category: string }[];
  unresolvedQuestions: { id: string; text: string; status: string; priority: string }[];
  sourceRefs: { id: string; url: string | null; title: string | null; adapter: string }[];
  qualityGate: { status: string; passedCount: number; warnCount: number; failCount: number; checks: unknown[] } | null;
  researchUpdates: { id: string; title: string; type: string; content: string; createdAt: Date }[];
  /** Session 14 — Build Blueprint (structured). Null when not generated. */
  blueprint?: BlueprintData | null;
}

/** Structured Build Blueprint data used to emit implementation-ready files. */
export interface BlueprintData {
  screenContracts: ScreenContract[];
  stateMatrix: { screen: string; states: string[] }[];
  apiToScreenMap: ApiToScreenMapEntry[];
  componentContracts: unknown[];
  permissionMatrix: unknown[];
  analyticsEvents: unknown[];
  doNotBuild: DoNotBuildItem[];
  validationRules: string[];
  buildReadinessScore: number;
  buildReadinessLevel: string;
  buildReadinessBreakdown: { dimension: string; score: number; reasoning: string }[];
  warnings: string[];
}

export interface PackRow {
  id: string;
  title: string;
  version: number;
  depth: string;
  verticalTemplate: string;
  primaryLanguage: string;
  projectId: string;
  nicheId: string;
  workspaceId: string;
}

/**
 * Renders export content (Markdown ZIP, AI-Agent bundle, JSON bundle, role briefs).
 * PDF rendering lives in ExportPdfService.
 */
@Injectable()
export class ExportRendererService {
  private readonly logger = new Logger(ExportRendererService.name);

  // ── Public entry points ───────────────────────────────────────────────────

  async renderMarkdownZip(
    pack: PackRow,
    documents: PackDocumentRow[],
    ev: EvidenceData,
    manifest: ExportManifest,
  ): Promise<Buffer> {
    const zip = new JSZip();
    const root = zip.folder('product-pack')!;

    root.file('manifest.json', JSON.stringify(manifest, null, 2));
    root.file('README.md', this.buildReadme(pack, documents, manifest));

    for (const doc of documents) {
      const folder = DOCUMENT_FOLDER[doc.docType as DocumentType];
      const filename = DOCUMENT_FILENAME[doc.docType as DocumentType];
      if (!folder || !filename) continue;
      root.folder(folder)!.file(filename, doc.body);
    }

    // Evidence folder
    const ev8 = root.folder('08_evidence')!;
    ev8.file('evidence_map.md', this.buildEvidenceMapMd(ev));
    ev8.file('claims.json', JSON.stringify(ev.claims, null, 2));
    ev8.file('evidence.json', JSON.stringify(ev.evidence, null, 2));
    ev8.file('assumptions.json', JSON.stringify(ev.assumptions, null, 2));
    ev8.file('constraints.json', JSON.stringify(ev.constraints, null, 2));
    ev8.file('unresolved_questions.json', JSON.stringify(ev.unresolvedQuestions, null, 2));
    ev8.file('contradictions.json', JSON.stringify([], null, 2));

    // Sources folder
    root.folder('00_sources')!.file('source_appendix.md', this.buildSourceAppendix(ev.sourceRefs));
    root.folder('00_sources')!.file('source_refs.json', JSON.stringify(ev.sourceRefs, null, 2));

    // Quality gates
    root.folder('06_ai_handoff')!.file('quality_gates.json', JSON.stringify(ev.qualityGate ?? {}, null, 2));
    root.folder('06_ai_handoff')!.file('coding_constraints.md', this.buildCodingConstraints(ev.constraints));

    // Governance
    const gov = root.folder('09_governance')!;
    gov.file('research_updates.md', this.buildResearchUpdatesMd(ev.researchUpdates));
    gov.file('review_status.json', JSON.stringify({ status: 'not_reviewed', packs: [pack.id] }, null, 2));
    gov.file('document_versions_summary.md', this.buildVersionSummary(pack, documents));

    // Build Blueprint (structured) — implementation-ready artifacts.
    if (ev.blueprint) {
      const bp = root.folder('10_blueprint')!;
      bp.file('SCREEN_CONTRACTS.json', JSON.stringify(ev.blueprint.screenContracts, null, 2));
      bp.file('STATE_MATRIX.json', JSON.stringify(ev.blueprint.stateMatrix, null, 2));
      bp.file('API_TO_SCREEN_MAP.yaml', this.blueprintApiYaml(ev.blueprint));
      bp.file('COMPONENT_CONTRACTS.json', JSON.stringify(ev.blueprint.componentContracts, null, 2));
      bp.file('PERMISSION_MATRIX.json', JSON.stringify(ev.blueprint.permissionMatrix, null, 2));
      bp.file('ANALYTICS_EVENTS.json', JSON.stringify(ev.blueprint.analyticsEvents, null, 2));
      bp.file('VALIDATION_RULES.md', this.blueprintValidationMd(ev.blueprint));
      bp.file('EMPTY_LOADING_ERROR_STATES.md', this.blueprintStatesMd(ev.blueprint));
      bp.file('build_readiness.json', JSON.stringify({ score: ev.blueprint.buildReadinessScore, level: ev.blueprint.buildReadinessLevel, breakdown: ev.blueprint.buildReadinessBreakdown, warnings: ev.blueprint.warnings }, null, 2));
    }

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  async renderAiAgentBundle(
    pack: PackRow,
    documents: PackDocumentRow[],
    ev: EvidenceData,
    manifest: ExportManifest,
  ): Promise<Buffer> {
    const zip = new JSZip();

    const docMap = new Map(documents.map((d) => [d.docType, d]));

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('README_FOR_AGENT.md', this.buildAgentReadme(pack));
    zip.file('product_context.md', this.buildProductContext(pack, docMap));
    zip.file('implementation_scope.md', docMap.get('mvp_scope')?.body ?? '# MVP Scope\n_Not generated._');
    zip.file('feature_checklist.md', docMap.get('feature_checklist')?.body ?? '# Feature Checklist\n_Not generated._');
    zip.file('ux_flow.md', docMap.get('ux_flow')?.body ?? '# UX Flow\n_Not generated._');
    zip.file('screen_map.json', this.extractJson(docMap.get('screen_map')?.body ?? ''));
    zip.file('frontend_brd.md', docMap.get('frontend_brd')?.body ?? '# Frontend BRD\n_Not generated._');
    zip.file('backend_brd.md', docMap.get('backend_brd')?.body ?? '# Backend BRD\n_Not generated._');
    zip.file('data_model.json', this.extractJson(docMap.get('data_model')?.body ?? ''));
    zip.file('api_requirements.yaml', this.extractYaml(docMap.get('api_requirements')?.body ?? ''));
    zip.file('integration_requirements.md', this.buildIntegrationRequirements(docMap));
    zip.file('acceptance_criteria.md', docMap.get('acceptance_criteria')?.body ?? '# Acceptance Criteria\n_Not generated._');
    zip.file('coding_constraints.md', this.buildCodingConstraints(ev.constraints));
    zip.file('evidence.json', JSON.stringify(ev.evidence, null, 2));
    zip.file('claims.json', JSON.stringify(ev.claims, null, 2));
    zip.file('assumptions.json', JSON.stringify(ev.assumptions, null, 2));
    zip.file('constraints.json', JSON.stringify(ev.constraints, null, 2));
    zip.file('unresolved_questions.json', JSON.stringify(ev.unresolvedQuestions, null, 2));
    zip.file('quality_gates.json', JSON.stringify(ev.qualityGate ?? {}, null, 2));
    zip.file('source_refs.json', JSON.stringify(ev.sourceRefs, null, 2));

    // Session 14 — Build Blueprint files. Markdown ones come from the pack
    // documents; structured ones from the blueprint. Agents implement screens
    // from SCREEN_CONTRACTS and never invent product logic.
    zip.file('VENTURE_THESIS.md', docMap.get('venture_thesis')?.body ?? '# Venture Thesis\n_Not generated._');
    zip.file('BUILD_BLUEPRINT.md', docMap.get('build_blueprint')?.body ?? '# Build Blueprint\n_Not generated._');
    zip.file('DO_NOT_BUILD.md', docMap.get('do_not_build')?.body ?? this.blueprintDoNotBuildMd(ev.blueprint));
    if (ev.blueprint) {
      zip.file('SCREEN_CONTRACTS.json', JSON.stringify(ev.blueprint.screenContracts, null, 2));
      zip.file('STATE_MATRIX.json', JSON.stringify(ev.blueprint.stateMatrix, null, 2));
      zip.file('API_TO_SCREEN_MAP.yaml', this.blueprintApiYaml(ev.blueprint));
      zip.file('COMPONENT_CONTRACTS.json', JSON.stringify(ev.blueprint.componentContracts, null, 2));
      zip.file('PERMISSION_MATRIX.json', JSON.stringify(ev.blueprint.permissionMatrix, null, 2));
      zip.file('ANALYTICS_EVENTS.json', JSON.stringify(ev.blueprint.analyticsEvents, null, 2));
      zip.file('VALIDATION_RULES.md', this.blueprintValidationMd(ev.blueprint));
      zip.file('EMPTY_LOADING_ERROR_STATES.md', this.blueprintStatesMd(ev.blueprint));
    }

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  async renderJsonBundle(pack: PackRow, documents: PackDocumentRow[], ev: EvidenceData, manifest: ExportManifest): Promise<Buffer> {
    const bundle = {
      manifest,
      pack: { id: pack.id, title: pack.title, depth: pack.depth, verticalTemplate: pack.verticalTemplate, primaryLanguage: pack.primaryLanguage },
      documents: documents.map((d) => ({ docType: d.docType, title: d.title, body: d.body, language: d.language })),
      evidence: ev.evidence,
      claims: ev.claims,
      assumptions: ev.assumptions,
      constraints: ev.constraints,
      unresolvedQuestions: ev.unresolvedQuestions,
      sourceRefs: ev.sourceRefs,
      qualityGate: ev.qualityGate,
    };
    const json = JSON.stringify(bundle, null, 2);
    const zip = new JSZip();
    zip.file('bundle.json', json);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  renderRoleBrief(role: RoleBriefType, pack: PackRow, documents: PackDocumentRow[], ev: EvidenceData): string {
    const roleDocs = ROLE_BRIEF_DOCUMENTS[role];
    const docMap = new Map(documents.map((d) => [d.docType, d]));
    const lines: string[] = [];

    lines.push(`# ${this.roleBriefTitle(role)} — ${pack.title}`);
    lines.push(`\n_Language: ${pack.primaryLanguage} | Depth: ${pack.depth} | Generated: ${new Date().toISOString()}_\n`);
    lines.push('---\n');

    for (const docType of roleDocs) {
      const doc = docMap.get(docType);
      if (!doc) continue;
      lines.push(`## ${doc.title}`);
      lines.push('');
      lines.push(doc.body);
      lines.push('\n---\n');
    }

    // Append evidence summary for roles that benefit from it
    if (['founder', 'pm', 'investor', 'growth'].includes(role)) {
      lines.push('## Evidence & Assumptions Summary\n');
      lines.push(this.buildEvidenceSummaryMd(ev));
    }

    return lines.join('\n');
  }

  renderEvidenceAppendix(ev: EvidenceData): string {
    return this.buildEvidenceMapMd(ev);
  }

  renderSourceAppendix(sourceRefs: EvidenceData['sourceRefs']): string {
    return this.buildSourceAppendix(sourceRefs);
  }

  // ── Content builders ──────────────────────────────────────────────────────

  private buildReadme(pack: PackRow, documents: PackDocumentRow[], manifest: ExportManifest): string {
    return [
      `# ${pack.title}`,
      `\n_Product Document Pack — ${pack.depth} depth | ${pack.verticalTemplate} vertical | Language: ${pack.primaryLanguage}_\n`,
      '## Contents\n',
      `This pack contains ${documents.length} structured product documents organized into thematic folders.\n`,
      '### Folders',
      '- `00_sources/` — source references and appendix',
      '- `01_strategy/` — product vision, market context, market selection',
      '- `02_user/` — ICP, JTBD, problem map, user scenarios',
      '- `03_product/` — feature checklist, MVP scope, post-MVP scope',
      '- `04_ux_design/` — UX flow, screen map, design BRD',
      '- `05_engineering/` — frontend BRD, backend BRD, data model, API requirements',
      '- `06_ai_handoff/` — AI agent instructions, acceptance criteria, quality gates',
      '- `07_growth/` — monetization, GTM plan, analytics plan',
      '- `08_evidence/` — evidence map, claims, assumptions, constraints, unresolved questions',
      '- `09_roadmap/` — roadmap',
      '- `09_governance/` — document versions, research updates, review status',
      '',
      `**Quality Gate:** ${manifest.qualityGateSummary?.status ?? 'not_run'} | Passed: ${manifest.qualityGateSummary?.passedCount ?? 0} | Warnings: ${manifest.qualityGateSummary?.warnCount ?? 0} | Failed: ${manifest.qualityGateSummary?.failCount ?? 0}`,
      '',
      `**Evidence items:** ${manifest.evidenceSummary.count} | **Claims:** ${manifest.claimCount} | **Assumptions:** ${manifest.assumptionsSummary.count}`,
      '',
      '_Generated by SignalKit. Do not treat assumptions as facts. Unresolved questions must remain open._',
    ].join('\n');
  }

  private buildAgentReadme(pack: PackRow): string {
    return [
      '# README FOR AI CODING AGENT',
      '',
      '> This bundle is implementation context generated by SignalKit.',
      '> Read it carefully before writing any code.',
      '',
      '## Rules',
      '',
      '1. **Do not invent missing requirements.** If something is not documented, leave it unimplemented and add a TODO comment.',
      '2. **Unresolved questions must remain unresolved.** Do not guess answers to questions in `unresolved_questions.json`.',
      '3. **Assumptions are NOT facts.** Items in `assumptions.json` are hypotheses that have not been validated.',
      '4. **Do not build outside MVP scope unless explicitly requested.** `implementation_scope.md` defines the boundary.',
      '5. **Preserve product law.** This is NOT an app generator. Do not add features not in the feature checklist.',
      '6. **No gradients. No glassmorphism. No neon AI-dashboard style.** Premium flat 2D only.',
      '7. **Evidence-backed claims are in `claims.json`.** Ungrounded assumptions are in `assumptions.json`.',
      '8. **Quality gates are in `quality_gates.json`.** Your implementation must pass all required gates.',
      '9. **Do not invent screen logic.** Implement screens exactly per `SCREEN_CONTRACTS.json` (states, actions, validation, acceptance).',
      '10. **Unresolved questions remain unresolved.** Assumptions are not facts.',
      '11. **Do not build anything in `DO_NOT_BUILD.md`.** Do not change product scope unless the user explicitly asks.',
      '12. **This bundle is implementation context, not permission to generate extra product scope.**',
      '',
      '## Bundle Contents',
      '',
      '| File | Purpose |',
      '|------|---------|',
      '| `product_context.md` | Product summary, niche, market |',
      '| `implementation_scope.md` | MVP scope — what to build |',
      '| `feature_checklist.md` | Verified feature list |',
      '| `ux_flow.md` | User journey and flow |',
      '| `screen_map.json` | Screen inventory and navigation |',
      '| `frontend_brd.md` | Frontend requirements |',
      '| `backend_brd.md` | Backend requirements |',
      '| `data_model.json` | Entity model |',
      '| `api_requirements.yaml` | API contracts |',
      '| `acceptance_criteria.md` | Given/When/Then acceptance tests |',
      '| `coding_constraints.md` | Technical constraints |',
      '| `evidence.json` | Evidence backing claims |',
      '| `claims.json` | Evidence-backed claims |',
      '| `assumptions.json` | Unvalidated assumptions |',
      '| `unresolved_questions.json` | Open questions — do not resolve |',
      '| `quality_gates.json` | Quality gate results |',
      '| `VENTURE_THESIS.md` | Why this could be venture-scale (potential, not fact) |',
      '| `BUILD_BLUEPRINT.md` | Build readiness + screen/API/permission overview |',
      '| `SCREEN_CONTRACTS.json` | Per-screen logic — implement screens from this |',
      '| `STATE_MATRIX.json` | Required UI states per screen |',
      '| `API_TO_SCREEN_MAP.yaml` | Which endpoints each screen reads/writes |',
      '| `COMPONENT_CONTRACTS.json` | Component props/states/interactions |',
      '| `PERMISSION_MATRIX.json` | Role → allowed/blocked actions |',
      '| `ANALYTICS_EVENTS.json` | Event map |',
      '| `VALIDATION_RULES.md` | Input validation rules |',
      '| `EMPTY_LOADING_ERROR_STATES.md` | Mandatory empty/loading/error behaviors |',
      '| `DO_NOT_BUILD.md` | Explicitly out of scope — do not implement |',
      '',
      `**Pack:** ${pack.title}`,
      `**Depth:** ${pack.depth}`,
      `**Language:** ${pack.primaryLanguage}`,
    ].join('\n');
  }

  private buildProductContext(pack: PackRow, docMap: Map<string, PackDocumentRow>): string {
    const vision = docMap.get('product_vision');
    const market = docMap.get('market_context');
    return [
      `# Product Context — ${pack.title}`,
      '',
      vision ? `## Product Vision\n\n${this.firstSection(vision.body)}` : '',
      market ? `## Market Context\n\n${this.firstSection(market.body)}` : '',
    ].filter(Boolean).join('\n\n');
  }

  private buildIntegrationRequirements(docMap: Map<string, PackDocumentRow>): string {
    const backend = docMap.get('backend_brd');
    if (!backend) return '# Integration Requirements\n\n_See backend_brd.md for integration details._';
    const integSection = this.extractSection(backend.body, 'integration');
    return `# Integration Requirements\n\n${integSection || '_Extracted from Backend BRD. See backend_brd.md._'}`;
  }

  private buildCodingConstraints(constraints: EvidenceData['constraints']): string {
    const lines = ['# Coding Constraints', ''];
    if (!constraints.length) {
      lines.push('_No explicit coding constraints defined for this pack._');
    } else {
      lines.push('The following technical constraints must be respected during implementation:\n');
      for (const c of constraints) {
        lines.push(`- [${c.category.toUpperCase()}] ${c.text}`);
      }
    }
    return lines.join('\n');
  }

  private buildEvidenceMapMd(ev: EvidenceData): string {
    const lines = ['# Evidence Map', ''];

    lines.push(`## Claims (${ev.claims.length})\n`);
    for (const claim of ev.claims) {
      lines.push(`### ${claim.text}`);
      lines.push(`- Type: ${claim.type} | Confidence: ${claim.confidenceLevel}`);
      const supporting = ev.evidence.filter((e) => e.sourceRefId);
      if (supporting.length > 0) lines.push(`- Supporting evidence: ${supporting.length} items`);
      lines.push('');
    }

    lines.push(`## Evidence Items (${ev.evidence.length})\n`);
    for (const e of ev.evidence) {
      lines.push(`- [${e.evidenceType}] ${e.summary} _(source: ${e.sourceRefId})_`);
    }

    lines.push(`\n## Assumptions (${ev.assumptions.length})\n`);
    for (const a of ev.assumptions) {
      lines.push(`- [${a.validationStatus}] ${a.text}`);
    }

    lines.push(`\n## Constraints (${ev.constraints.length})\n`);
    for (const c of ev.constraints) {
      lines.push(`- [${c.category}] ${c.text}`);
    }

    lines.push(`\n## Unresolved Questions (${ev.unresolvedQuestions.length})\n`);
    for (const q of ev.unresolvedQuestions) {
      lines.push(`- [${q.priority}/${q.status}] ${q.text}`);
    }

    return lines.join('\n');
  }

  private buildSourceAppendix(sourceRefs: EvidenceData['sourceRefs']): string {
    const lines = ['# Source Appendix', ''];
    if (!sourceRefs.length) {
      lines.push('_No sources collected for this project._');
    } else {
      lines.push(`${sourceRefs.length} source(s) referenced in this pack:\n`);
      for (const s of sourceRefs) {
        lines.push(`## ${s.title ?? 'Untitled Source'}`);
        lines.push(`- Adapter: \`${s.adapter}\``);
        if (s.url) lines.push(`- URL: ${s.url}`);
        lines.push(`- ID: \`${s.id}\``);
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  private buildEvidenceSummaryMd(ev: EvidenceData): string {
    return [
      `**Evidence items:** ${ev.evidence.length} | **Claims:** ${ev.claims.length} | **Assumptions:** ${ev.assumptions.length}`,
      '',
      ev.claims.map((c) => `- ${c.text} _(${c.type}, ${c.confidenceLevel} confidence)_`).join('\n'),
      '',
      `**Open questions (${ev.unresolvedQuestions.length}):**`,
      ev.unresolvedQuestions.map((q) => `- ${q.text}`).join('\n'),
    ].join('\n');
  }

  private buildResearchUpdatesMd(updates: EvidenceData['researchUpdates']): string {
    if (!updates.length) return '# Research Updates\n\n_No research updates recorded._';
    const lines = ['# Research Updates\n'];
    for (const u of updates) {
      lines.push(`## ${u.title} (${u.type})`);
      lines.push(`_${u.createdAt.toISOString()}_\n`);
      lines.push(u.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  private buildVersionSummary(pack: PackRow, documents: PackDocumentRow[]): string {
    return [
      `# Document Versions Summary — ${pack.title}`,
      '',
      `Pack version: ${pack.version}`,
      '',
      '| Document | Current Version |',
      '|----------|----------------|',
      ...documents.map((d) => `| ${d.docType} | ${(d as unknown as { version?: number }).version ?? 1} |`),
    ].join('\n');
  }

  // ── Build Blueprint file builders ─────────────────────────────────────────

  private blueprintApiYaml(bp: BlueprintData): string {
    const lines = ['# API ↔ Screen map', 'screens:'];
    for (const m of bp.apiToScreenMap) {
      lines.push(`  - screen: "${m.screen}"`);
      lines.push('    reads:');
      for (const e of m.endpoints) lines.push(`      - "${e.method} ${e.path}"  # ${e.dataNeeded}`);
      if (m.endpoints.length === 0) lines.push('      []');
      lines.push('    writes:');
      for (const a of m.actions) lines.push(`      - "${a.method} ${a.path}"  # ${a.action}`);
      if (m.actions.length === 0) lines.push('      []');
      lines.push('    errorStates:');
      for (const er of m.errorStates) lines.push(`      - error: "${er.error}"\n        uiState: "${er.uiState}"`);
    }
    return lines.join('\n');
  }

  private blueprintValidationMd(bp: BlueprintData): string {
    return ['# Validation Rules', '', ...bp.validationRules.map((r) => `- ${r}`)].join('\n');
  }

  private blueprintStatesMd(bp: BlueprintData): string {
    const lines = ['# Empty / Loading / Error States', '', 'Every screen MUST implement empty, loading and error states.', ''];
    for (const s of bp.screenContracts) {
      lines.push(`## ${s.name}`);
      for (const st of s.states) lines.push(`- **${st.kind}**: ${st.behavior}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  private blueprintDoNotBuildMd(bp: BlueprintData | null | undefined): string {
    const items = bp?.doNotBuild ?? [];
    const lines = ['# DO NOT BUILD', '', 'Do not implement the following without an explicit user request:', ''];
    for (const i of items) lines.push(`- **${i.item}** — ${i.reason}`);
    if (items.length === 0) lines.push('_No exclusions captured._');
    return lines.join('\n');
  }

  // ── Utility helpers ───────────────────────────────────────────────────────

  private extractJson(body: string): string {
    const match = body.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return match[1].trim();
    try { JSON.parse(body); return body; } catch { return JSON.stringify({}, null, 2); }
  }

  private extractYaml(body: string): string {
    const match = body.match(/```(?:yaml|yml)?\s*([\s\S]*?)```/);
    if (match) return match[1].trim();
    return body.replace(/^#.*$/m, '').trim() || '# API Requirements\n---\npaths: {}';
  }

  private firstSection(body: string): string {
    const lines = body.split('\n');
    const result: string[] = [];
    let inSection = false;
    for (const line of lines) {
      if (line.startsWith('## ') && inSection) break;
      if (line.startsWith('# ') || line.startsWith('## ')) { inSection = true; continue; }
      if (inSection) result.push(line);
    }
    return result.slice(0, 20).join('\n').trim();
  }

  private extractSection(body: string, keyword: string): string {
    const lower = body.toLowerCase();
    const idx = lower.indexOf(keyword);
    if (idx === -1) return '';
    return body.slice(idx, idx + 800).split('\n##')[0] ?? '';
  }

  private roleBriefTitle(role: RoleBriefType): string {
    const titles: Record<RoleBriefType, string> = {
      founder: 'Founder Summary',
      pm: 'Product Manager Brief',
      designer: 'Designer BRD',
      frontend: 'Frontend BRD',
      backend: 'Backend BRD',
      growth: 'Growth Brief',
      sales: 'Sales Brief',
      investor: 'Investor Memo',
      ai_agent: 'AI Agent Engineering Brief',
    };
    return titles[role];
  }
}
