/**
 * @signalkit/exports — export file conventions and manifest contracts.
 *
 * Defines the canonical Markdown-ZIP folder layout and the AI-Agent bundle file
 * set so exports are stable and machine-readable. The export engine itself
 * (PDF/ZIP/bundle rendering, queue jobs) is built in Session 12.
 */
import type { DocumentType, ExportType, ExportManifest } from '@signalkit/shared';

/** Schema version stamped into every export manifest. */
export const EXPORT_SCHEMA_VERSION = '1.0.0';

/** Top-level folders in the Markdown-ZIP export. */
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
  'exports',
] as const;

export type MarkdownZipFolder = (typeof MARKDOWN_ZIP_FOLDERS)[number];

/** Maps each document type to its folder in the Markdown-ZIP layout. */
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
};

/** Canonical file set of the AI-Agent Engineering Bundle. */
export const AI_AGENT_BUNDLE_FILES = [
  'manifest.json',
  'ai_agent_instructions.md',
  'coding_constraints.md',
  'acceptance_criteria.md',
  'screen_map.json',
  'data_model.json',
  'api_requirements.yaml',
  'evidence.json',
  'claims.json',
  'assumptions.json',
  'constraints.json',
  'unresolved_questions.json',
  'source_refs.json',
  'quality_gates.json',
] as const;

/** Build the export file path for a document within the Markdown-ZIP layout. */
export function documentExportPath(docType: DocumentType, slug: string): string {
  return `product-pack/${DOCUMENT_FOLDER[docType]}/${slug}.md`;
}

/** Create an empty manifest skeleton for an export of the given type. */
export function createManifest(
  input: Omit<ExportManifest, 'schemaVersion' | 'generatedAt'> & { generatedAt?: string },
): ExportManifest {
  return {
    ...input,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    schemaVersion: EXPORT_SCHEMA_VERSION,
  };
}

/** Export types that render to PDF. */
export const PDF_EXPORT_TYPES: readonly ExportType[] = [
  'full_pdf_pack',
  'founder_summary_pdf',
  'investor_memo_pdf',
  'roadmap_pdf',
  'client_agency_export',
] as const;

export function isPdfExport(type: ExportType): boolean {
  return PDF_EXPORT_TYPES.includes(type);
}
