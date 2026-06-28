/**
 * @signalkit/exports — export file conventions, manifest contracts, and
 * role-brief document mapping.
 *
 * Defines the canonical Markdown-ZIP folder layout, AI-Agent bundle file set,
 * role-brief document selections, and manifest utilities. The export engine
 * (PDF/ZIP/bundle rendering, queue jobs) lives in apps/api/src/exports/.
 */
import type { DocumentType, ExportType, ExportManifest, RoleBriefType } from '@signalkit/shared';

export const EXPORT_SCHEMA_VERSION = '1.0.0';

// ─── Markdown ZIP folder layout ──────────────────────────────────────────────

export const MARKDOWN_ZIP_FOLDERS = [
  '00_sources',
  '01_strategy',
  '02_user',
  '03_product',
  '04_ux_design',
  '05_engineering',
  '06_ai_handoff',
  '07_growth',
  '08_evidence',
  '09_roadmap',
  '09_governance',
  '10_blueprint',
] as const;

export type MarkdownZipFolder = (typeof MARKDOWN_ZIP_FOLDERS)[number];

/** Maps each document type to its Markdown-ZIP folder. */
export const DOCUMENT_FOLDER: Record<DocumentType, MarkdownZipFolder> = {
  product_vision: '01_strategy',
  market_context: '01_strategy',
  market_selection_memo: '01_strategy',
  target_audience_icp: '02_user',
  jobs_to_be_done: '02_user',
  problem_map: '02_user',
  user_scenarios: '02_user',
  feature_checklist: '03_product',
  mvp_scope: '03_product',
  post_mvp_scope: '03_product',
  ux_flow: '04_ux_design',
  screen_map: '04_ux_design',
  design_brd: '04_ux_design',
  frontend_brd: '05_engineering',
  backend_brd: '05_engineering',
  data_model: '05_engineering',
  api_requirements: '05_engineering',
  ai_agent_instructions: '06_ai_handoff',
  acceptance_criteria: '06_ai_handoff',
  monetization_plan: '07_growth',
  go_to_market_plan: '07_growth',
  analytics_plan: '07_growth',
  risks_and_assumptions: '08_evidence',
  research_questions: '08_evidence',
  evidence_map: '08_evidence',
  source_appendix: '00_sources',
  roadmap: '09_roadmap',
  // Session 14 — Breakout / Build Blueprint (optional, additive)
  venture_thesis: '10_blueprint',
  breakout_opportunity_memo: '10_blueprint',
  build_blueprint: '10_blueprint',
  do_not_build: '10_blueprint',
};

/** Maps document type to stable filename within its folder. */
export const DOCUMENT_FILENAME: Record<DocumentType, string> = {
  product_vision: 'product_vision.md',
  market_context: 'market_context.md',
  market_selection_memo: 'market_selection_memo.md',
  target_audience_icp: 'icp.md',
  jobs_to_be_done: 'jtbd.md',
  problem_map: 'problem_map.md',
  user_scenarios: 'user_scenarios.md',
  feature_checklist: 'feature_checklist.md',
  mvp_scope: 'mvp_scope.md',
  post_mvp_scope: 'post_mvp_scope.md',
  ux_flow: 'ux_flow.md',
  screen_map: 'screen_map.json',
  design_brd: 'design_brd.md',
  frontend_brd: 'frontend_brd.md',
  backend_brd: 'backend_brd.md',
  data_model: 'data_model.json',
  api_requirements: 'api_requirements.yaml',
  ai_agent_instructions: 'ai_agent_instructions.md',
  acceptance_criteria: 'acceptance_criteria.md',
  monetization_plan: 'monetization_plan.md',
  go_to_market_plan: 'gtm_plan.md',
  analytics_plan: 'analytics_metrics_plan.md',
  risks_and_assumptions: 'risks_and_assumptions.md',
  research_questions: 'research_questions.md',
  evidence_map: 'evidence_map.md',
  source_appendix: 'source_appendix.md',
  roadmap: 'roadmap.md',
  // Session 14 — Breakout / Build Blueprint (optional, additive)
  venture_thesis: 'venture_thesis.md',
  breakout_opportunity_memo: 'breakout_opportunity_memo.md',
  build_blueprint: 'build_blueprint.md',
  do_not_build: 'do_not_build.md',
};

/** Build the ZIP path for a document. */
export function documentExportPath(docType: DocumentType): string {
  return `product-pack/${DOCUMENT_FOLDER[docType]}/${DOCUMENT_FILENAME[docType]}`;
}

// ─── AI-Agent bundle ──────────────────────────────────────────────────────────

/** Canonical file set of the AI-Agent Engineering Bundle. */
export const AI_AGENT_BUNDLE_FILES = [
  'manifest.json',
  'README_FOR_AGENT.md',
  'product_context.md',
  'implementation_scope.md',
  'feature_checklist.md',
  'ux_flow.md',
  'screen_map.json',
  'frontend_brd.md',
  'backend_brd.md',
  'data_model.json',
  'api_requirements.yaml',
  'integration_requirements.md',
  'acceptance_criteria.md',
  'coding_constraints.md',
  'evidence.json',
  'claims.json',
  'assumptions.json',
  'constraints.json',
  'unresolved_questions.json',
  'quality_gates.json',
  'source_refs.json',
  // Session 14 — Build Blueprint files (implementation-ready context)
  'VENTURE_THESIS.md',
  'BUILD_BLUEPRINT.md',
  'SCREEN_CONTRACTS.json',
  'STATE_MATRIX.json',
  'API_TO_SCREEN_MAP.yaml',
  'COMPONENT_CONTRACTS.json',
  'PERMISSION_MATRIX.json',
  'ANALYTICS_EVENTS.json',
  'DO_NOT_BUILD.md',
  'VALIDATION_RULES.md',
  'EMPTY_LOADING_ERROR_STATES.md',
] as const;

export type AiAgentBundleFile = (typeof AI_AGENT_BUNDLE_FILES)[number];

// ─── Role brief document selections ──────────────────────────────────────────

/** Documents included in each role brief export. */
export const ROLE_BRIEF_DOCUMENTS: Record<RoleBriefType, DocumentType[]> = {
  founder: [
    'product_vision',
    'market_context',
    'market_selection_memo',
    'target_audience_icp',
    'mvp_scope',
    'risks_and_assumptions',
    'roadmap',
  ],
  pm: [
    'target_audience_icp',
    'jobs_to_be_done',
    'user_scenarios',
    'mvp_scope',
    'feature_checklist',
    'acceptance_criteria',
    'analytics_plan',
  ],
  designer: [
    'product_vision',
    'target_audience_icp',
    'user_scenarios',
    'ux_flow',
    'screen_map',
    'design_brd',
    'acceptance_criteria',
  ],
  frontend: [
    'ux_flow',
    'screen_map',
    'frontend_brd',
    'api_requirements',
    'acceptance_criteria',
    'data_model',
  ],
  backend: [
    'backend_brd',
    'data_model',
    'api_requirements',
    'feature_checklist',
    'acceptance_criteria',
    'risks_and_assumptions',
  ],
  growth: [
    'market_context',
    'target_audience_icp',
    'jobs_to_be_done',
    'monetization_plan',
    'go_to_market_plan',
    'analytics_plan',
  ],
  sales: [
    'target_audience_icp',
    'problem_map',
    'market_context',
    'monetization_plan',
    'risks_and_assumptions',
  ],
  investor: [
    'product_vision',
    'market_context',
    'market_selection_memo',
    'target_audience_icp',
    'mvp_scope',
    'roadmap',
    'monetization_plan',
    'risks_and_assumptions',
  ],
  ai_agent: [
    'ai_agent_instructions',
    'feature_checklist',
    'mvp_scope',
    'ux_flow',
    'screen_map',
    'frontend_brd',
    'backend_brd',
    'data_model',
    'api_requirements',
    'acceptance_criteria',
  ],
};

/** PDF-renderable export types. */
export const PDF_EXPORT_TYPES: readonly ExportType[] = [
  'full_pdf_pack',
  'founder_summary_pdf',
  'investor_memo_pdf',
  'roadmap_pdf',
  'client_agency_export',
] as const;

/** ZIP-based export types. */
export const ZIP_EXPORT_TYPES: readonly ExportType[] = [
  'markdown_zip',
  'ai_agent_engineering_bundle',
] as const;

/** Markdown-only export types (single .md file or combined). */
export const MARKDOWN_BRIEF_TYPES: readonly ExportType[] = [
  'pm_brief',
  'designer_brd',
  'frontend_brd',
  'backend_brd',
  'growth_brief',
  'sales_brief',
  'evidence_appendix',
  'source_appendix',
] as const;

export function isPdfExport(type: ExportType): boolean {
  return PDF_EXPORT_TYPES.includes(type);
}

export function isZipExport(type: ExportType): boolean {
  return ZIP_EXPORT_TYPES.includes(type);
}

export function mimeTypeForExport(type: ExportType): string {
  if (isPdfExport(type)) return 'application/pdf';
  if (isZipExport(type) || type === 'json_bundle') return 'application/zip';
  return 'text/markdown; charset=utf-8';
}

export function fileNameForExport(type: ExportType, packTitle: string, lang: string): string {
  const slug = packTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  if (isPdfExport(type)) return `${slug}_${type}_${lang}_${date}.pdf`;
  if (isZipExport(type)) return `${slug}_${type}_${lang}_${date}.zip`;
  if (type === 'json_bundle') return `${slug}_bundle_${lang}_${date}.zip`;
  return `${slug}_${type}_${lang}_${date}.md`;
}

// ─── Manifest builder ─────────────────────────────────────────────────────────

/** Create a full export manifest from component parts. */
export function createManifest(
  input: Omit<ExportManifest, 'schemaVersion' | 'generatedAt' | 'language' | 'files' | 'documentCount' | 'evidenceCount' | 'claimCount'> & {
    generatedAt?: string;
  },
): ExportManifest {
  return {
    ...input,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    schemaVersion: EXPORT_SCHEMA_VERSION,
    // Legacy compat fields mirror new ones
    language: input.outputLanguage,
    files: input.fileList,
    documentCount: input.includedDocuments.length,
    evidenceCount: input.evidenceSummary.count,
    claimCount: input.evidenceSummary.ids.length,
  };
}
