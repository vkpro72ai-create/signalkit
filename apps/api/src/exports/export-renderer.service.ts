import { Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import type {
  ExportManifest,
  RoleBriefType,
  DocumentType,
  LocaleCode,
  ScreenContract,
  ApiToScreenMapEntry,
  DoNotBuildItem,
} from '@signalkit/shared';
import { createPackContentTranslator, type PackContentKey, type PackContentTranslator } from '@signalkit/i18n';
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
    const t = createPackContentTranslator(pack.primaryLanguage as LocaleCode);

    root.file('manifest.json', JSON.stringify(manifest, null, 2));
    root.file('README.md', this.buildReadme(pack, documents, manifest, t));

    for (const doc of documents) {
      const folder = DOCUMENT_FOLDER[doc.docType as DocumentType];
      const filename = DOCUMENT_FILENAME[doc.docType as DocumentType];
      if (!folder || !filename) continue;
      root.folder(folder)!.file(filename, doc.body);
    }

    // Evidence folder
    const ev8 = root.folder('08_evidence')!;
    ev8.file('evidence_map.md', this.buildEvidenceMapMd(ev, t));
    ev8.file('claims.json', JSON.stringify(ev.claims, null, 2));
    ev8.file('evidence.json', JSON.stringify(ev.evidence, null, 2));
    ev8.file('assumptions.json', JSON.stringify(ev.assumptions, null, 2));
    ev8.file('constraints.json', JSON.stringify(ev.constraints, null, 2));
    ev8.file('unresolved_questions.json', JSON.stringify(ev.unresolvedQuestions, null, 2));
    ev8.file('contradictions.json', JSON.stringify([], null, 2));

    // Sources folder
    root.folder('00_sources')!.file('source_appendix.md', this.buildSourceAppendix(ev.sourceRefs, t));
    root.folder('00_sources')!.file('source_refs.json', JSON.stringify(ev.sourceRefs, null, 2));

    // Quality gates
    root.folder('06_ai_handoff')!.file('quality_gates.json', JSON.stringify(ev.qualityGate ?? {}, null, 2));
    root.folder('06_ai_handoff')!.file('coding_constraints.md', this.buildCodingConstraints(ev.constraints, t));

    // Governance
    const gov = root.folder('09_governance')!;
    gov.file('research_updates.md', this.buildResearchUpdatesMd(ev.researchUpdates, t));
    gov.file('review_status.json', JSON.stringify({ status: 'not_reviewed', packs: [pack.id] }, null, 2));
    gov.file('document_versions_summary.md', this.buildVersionSummary(pack, documents, t));

    // Build Blueprint (structured) — implementation-ready artifacts.
    if (ev.blueprint) {
      const bp = root.folder('10_blueprint')!;
      bp.file('SCREEN_CONTRACTS.json', JSON.stringify(ev.blueprint.screenContracts, null, 2));
      bp.file('STATE_MATRIX.json', JSON.stringify(ev.blueprint.stateMatrix, null, 2));
      bp.file('API_TO_SCREEN_MAP.yaml', this.blueprintApiYaml(ev.blueprint));
      bp.file('COMPONENT_CONTRACTS.json', JSON.stringify(ev.blueprint.componentContracts, null, 2));
      bp.file('PERMISSION_MATRIX.json', JSON.stringify(ev.blueprint.permissionMatrix, null, 2));
      bp.file('ANALYTICS_EVENTS.json', JSON.stringify(ev.blueprint.analyticsEvents, null, 2));
      bp.file('VALIDATION_RULES.md', this.blueprintValidationMd(ev.blueprint, t));
      bp.file('EMPTY_LOADING_ERROR_STATES.md', this.blueprintStatesMd(ev.blueprint, t));
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
    const t = createPackContentTranslator(pack.primaryLanguage as LocaleCode);

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('README_FOR_AGENT.md', this.buildAgentReadme(pack));
    zip.file('product_context.md', this.buildProductContext(pack, docMap, t));
    zip.file('implementation_scope.md', docMap.get('mvp_scope')?.body ?? `# ${t('export.mvp_scope_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('feature_checklist.md', docMap.get('feature_checklist')?.body ?? `# ${t('export.feature_checklist_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('ux_flow.md', docMap.get('ux_flow')?.body ?? `# ${t('export.ux_flow_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('screen_map.json', this.extractJson(docMap.get('screen_map')?.body ?? ''));
    zip.file('frontend_brd.md', docMap.get('frontend_brd')?.body ?? `# ${t('export.frontend_brd_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('backend_brd.md', docMap.get('backend_brd')?.body ?? `# ${t('export.backend_brd_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('data_model.json', this.extractJson(docMap.get('data_model')?.body ?? ''));
    zip.file('api_requirements.yaml', this.extractYaml(docMap.get('api_requirements')?.body ?? ''));
    zip.file('integration_requirements.md', this.buildIntegrationRequirements(docMap, t));
    zip.file('acceptance_criteria.md', docMap.get('acceptance_criteria')?.body ?? `# ${t('export.acceptance_criteria_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('coding_constraints.md', this.buildCodingConstraints(ev.constraints, t));
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
    zip.file('VENTURE_THESIS.md', docMap.get('venture_thesis')?.body ?? `# ${t('export.venture_thesis_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('BUILD_BLUEPRINT.md', docMap.get('build_blueprint')?.body ?? `# ${t('export.build_blueprint_fallback_title')}\n_${t('export.not_generated')}_`);
    zip.file('DO_NOT_BUILD.md', docMap.get('do_not_build')?.body ?? this.blueprintDoNotBuildMd(ev.blueprint, t));
    if (ev.blueprint) {
      zip.file('SCREEN_CONTRACTS.json', JSON.stringify(ev.blueprint.screenContracts, null, 2));
      zip.file('STATE_MATRIX.json', JSON.stringify(ev.blueprint.stateMatrix, null, 2));
      zip.file('API_TO_SCREEN_MAP.yaml', this.blueprintApiYaml(ev.blueprint));
      zip.file('COMPONENT_CONTRACTS.json', JSON.stringify(ev.blueprint.componentContracts, null, 2));
      zip.file('PERMISSION_MATRIX.json', JSON.stringify(ev.blueprint.permissionMatrix, null, 2));
      zip.file('ANALYTICS_EVENTS.json', JSON.stringify(ev.blueprint.analyticsEvents, null, 2));
      zip.file('VALIDATION_RULES.md', this.blueprintValidationMd(ev.blueprint, t));
      zip.file('EMPTY_LOADING_ERROR_STATES.md', this.blueprintStatesMd(ev.blueprint, t));
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
    const t = createPackContentTranslator(pack.primaryLanguage as LocaleCode);

    lines.push(`# ${this.roleBriefTitle(role, t)} — ${pack.title}`);
    lines.push(`\n_${t('export.role_brief_meta_line', { language: pack.primaryLanguage, depth: pack.depth, date: new Date().toISOString() })}_\n`);
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
      lines.push(`## ${t('export.evidence_assumptions_summary_heading')}\n`);
      lines.push(this.buildEvidenceSummaryMd(ev, t));
    }

    return lines.join('\n');
  }

  renderEvidenceAppendix(ev: EvidenceData, language: LocaleCode = 'en'): string {
    return this.buildEvidenceMapMd(ev, createPackContentTranslator(language));
  }

  renderSourceAppendix(sourceRefs: EvidenceData['sourceRefs'], language: LocaleCode = 'en'): string {
    return this.buildSourceAppendix(sourceRefs, createPackContentTranslator(language));
  }

  // ── Content builders ──────────────────────────────────────────────────────

  private buildReadme(pack: PackRow, documents: PackDocumentRow[], manifest: ExportManifest, t: PackContentTranslator): string {
    return [
      `# ${pack.title}`,
      `\n_${t('export.readme_pack_intro', { depth: pack.depth, vertical: pack.verticalTemplate, language: pack.primaryLanguage })}_\n`,
      `## ${t('export.readme_contents_heading')}\n`,
      `${t('export.readme_pack_description', { count: documents.length })}\n`,
      `### ${t('export.readme_folders_heading')}`,
      `- \`00_sources/\` — ${t('export.readme_folder_sources')}`,
      `- \`01_strategy/\` — ${t('export.readme_folder_strategy')}`,
      `- \`02_user/\` — ${t('export.readme_folder_user')}`,
      `- \`03_product/\` — ${t('export.readme_folder_product')}`,
      `- \`04_ux_design/\` — ${t('export.readme_folder_ux')}`,
      `- \`05_engineering/\` — ${t('export.readme_folder_engineering')}`,
      `- \`06_ai_handoff/\` — ${t('export.readme_folder_ai_handoff')}`,
      `- \`07_growth/\` — ${t('export.readme_folder_growth')}`,
      `- \`08_evidence/\` — ${t('export.readme_folder_evidence')}`,
      `- \`09_roadmap/\` — ${t('export.readme_folder_roadmap')}`,
      `- \`09_governance/\` — ${t('export.readme_folder_governance')}`,
      '',
      `**${t('export.readme_quality_gate_line', {
        status: manifest.qualityGateSummary?.status ?? 'not_run',
        passed: manifest.qualityGateSummary?.passedCount ?? 0,
        warnings: manifest.qualityGateSummary?.warnCount ?? 0,
        failed: manifest.qualityGateSummary?.failCount ?? 0,
      })}**`,
      '',
      `**${t('export.readme_evidence_line', { evidence: manifest.evidenceSummary.count, claims: manifest.claimCount, assumptions: manifest.assumptionsSummary.count })}**`,
      '',
      `_${t('export.footer_generated_by')}_`,
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

  private buildProductContext(pack: PackRow, docMap: Map<string, PackDocumentRow>, t: PackContentTranslator): string {
    const vision = docMap.get('product_vision');
    const market = docMap.get('market_context');
    return [
      `# ${t('export.product_context_title', { title: pack.title })}`,
      '',
      vision ? `## ${vision.title}\n\n${this.firstSection(vision.body)}` : '',
      market ? `## ${market.title}\n\n${this.firstSection(market.body)}` : '',
    ].filter(Boolean).join('\n\n');
  }

  private buildIntegrationRequirements(docMap: Map<string, PackDocumentRow>, t: PackContentTranslator): string {
    const title = t('export.integration_requirements_title');
    const backend = docMap.get('backend_brd');
    if (!backend) return `# ${title}\n\n_${t('export.integration_requirements_see_backend')}_`;
    const integSection = this.extractSection(backend.body, 'integration');
    return `# ${title}\n\n${integSection || `_${t('export.integration_requirements_extracted')}_`}`;
  }

  private buildCodingConstraints(constraints: EvidenceData['constraints'], t: PackContentTranslator): string {
    const lines = [`# ${t('export.coding_constraints_title')}`, ''];
    if (!constraints.length) {
      lines.push(`_${t('export.coding_constraints_empty')}_`);
    } else {
      lines.push(`${t('export.coding_constraints_intro')}\n`);
      for (const c of constraints) {
        lines.push(`- [${c.category.toUpperCase()}] ${c.text}`);
      }
    }
    return lines.join('\n');
  }

  private buildEvidenceMapMd(ev: EvidenceData, t: PackContentTranslator): string {
    const lines = [`# ${t('export.evidence_map_title')}`, ''];

    lines.push(`## ${t('export.pdf_claims', { n: ev.claims.length })}\n`);
    for (const claim of ev.claims) {
      lines.push(`### ${claim.text}`);
      lines.push(`- Type: ${claim.type} | Confidence: ${claim.confidenceLevel}`);
      const supporting = ev.evidence.filter((e) => e.sourceRefId);
      if (supporting.length > 0) lines.push(`- ${t('export.evidence_map_supporting', { n: supporting.length })}`);
      lines.push('');
    }

    lines.push(`## ${t('export.evidence_map_evidence_items', { n: ev.evidence.length })}\n`);
    for (const e of ev.evidence) {
      lines.push(`- [${e.evidenceType}] ${e.summary} _(source: ${e.sourceRefId})_`);
    }

    lines.push(`\n## ${t('export.pdf_assumptions', { n: ev.assumptions.length })}\n`);
    for (const a of ev.assumptions) {
      lines.push(`- [${a.validationStatus}] ${a.text}`);
    }

    lines.push(`\n## ${t('export.pdf_constraints', { n: ev.constraints.length })}\n`);
    for (const c of ev.constraints) {
      lines.push(`- [${c.category}] ${c.text}`);
    }

    lines.push(`\n## ${t('export.pdf_unresolved_questions', { n: ev.unresolvedQuestions.length })}\n`);
    for (const q of ev.unresolvedQuestions) {
      lines.push(`- [${q.priority}/${q.status}] ${q.text}`);
    }

    return lines.join('\n');
  }

  private buildSourceAppendix(sourceRefs: EvidenceData['sourceRefs'], t: PackContentTranslator): string {
    const lines = [`# ${t('export.source_appendix_title')}`, ''];
    if (!sourceRefs.length) {
      lines.push(`_${t('export.pdf_no_sources')}_`);
    } else {
      lines.push(`${t('export.source_appendix_intro', { n: sourceRefs.length })}\n`);
      for (const s of sourceRefs) {
        lines.push(`## ${s.title ?? t('export.pdf_untitled_source')}`);
        lines.push(`- Adapter: \`${s.adapter}\``);
        if (s.url) lines.push(`- URL: ${s.url}`);
        lines.push(`- ID: \`${s.id}\``);
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  private buildEvidenceSummaryMd(ev: EvidenceData, t: PackContentTranslator): string {
    return [
      `**${t('export.readme_evidence_line', { evidence: ev.evidence.length, claims: ev.claims.length, assumptions: ev.assumptions.length })}**`,
      '',
      ev.claims.map((c) => `- ${c.text} _(${c.type}, ${c.confidenceLevel} confidence)_`).join('\n'),
      '',
      `**${t('export.evidence_open_questions', { n: ev.unresolvedQuestions.length })}**`,
      ev.unresolvedQuestions.map((q) => `- ${q.text}`).join('\n'),
    ].join('\n');
  }

  private buildResearchUpdatesMd(updates: EvidenceData['researchUpdates'], t: PackContentTranslator): string {
    const title = t('export.research_updates_title');
    if (!updates.length) return `# ${title}\n\n_${t('export.research_updates_empty')}_`;
    const lines = [`# ${title}\n`];
    for (const u of updates) {
      lines.push(`## ${u.title} (${u.type})`);
      lines.push(`_${u.createdAt.toISOString()}_\n`);
      lines.push(u.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  private buildVersionSummary(pack: PackRow, documents: PackDocumentRow[], t: PackContentTranslator): string {
    return [
      `# ${t('export.version_summary_title', { title: pack.title })}`,
      '',
      t('export.version_summary_pack_version', { version: pack.version }),
      '',
      `| ${t('export.version_summary_col_document')} | ${t('export.version_summary_col_version')} |`,
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

  private blueprintValidationMd(bp: BlueprintData, t: PackContentTranslator): string {
    return [`# ${t('export.validation_rules_title')}`, '', ...bp.validationRules.map((r) => `- ${r}`)].join('\n');
  }

  private blueprintStatesMd(bp: BlueprintData, t: PackContentTranslator): string {
    const lines = [`# ${t('export.states_title')}`, '', t('export.states_intro'), ''];
    for (const s of bp.screenContracts) {
      lines.push(`## ${s.name}`);
      for (const st of s.states) lines.push(`- **${st.kind}**: ${st.behavior}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  private blueprintDoNotBuildMd(bp: BlueprintData | null | undefined, t: PackContentTranslator): string {
    const items = bp?.doNotBuild ?? [];
    const lines = [`# ${t('export.do_not_build_title')}`, '', t('export.do_not_build_intro'), ''];
    for (const i of items) lines.push(`- **${i.item}** — ${i.reason}`);
    if (items.length === 0) lines.push(`_${t('export.do_not_build_empty')}_`);
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

  private roleBriefTitle(role: RoleBriefType, t: PackContentTranslator): string {
    const titles: Record<RoleBriefType, PackContentKey> = {
      founder: 'export.role_title_founder',
      pm: 'export.role_title_pm',
      designer: 'export.role_title_designer',
      frontend: 'export.role_title_frontend',
      backend: 'export.role_title_backend',
      growth: 'export.role_title_growth',
      sales: 'export.role_title_sales',
      investor: 'export.role_title_investor',
      ai_agent: 'export.role_title_ai_agent',
    };
    return t(titles[role]);
  }
}
