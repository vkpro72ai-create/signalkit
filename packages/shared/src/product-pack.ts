/**
 * Product Document Pack — the primary output of SignalKit.
 *
 * A pack is a deep, evidence-backed, multilingual, role-aware set of documents.
 * It is NOT an app generator output. Every document carries metadata linking it
 * to market, language, evidence, claims, assumptions, constraints and quality gates.
 */
import type {
  Id,
  Timestamps,
  WorkspaceOwned,
  Versioned,
  Confidence,
  GeneratedBy,
} from './common.js';
import type { LocaleCode, MarketProfile } from './geo.js';

/** Depth/intent of a generated pack. */
export type ProductPackDepth =
  | 'quick_opportunity'
  | 'build_ready'
  | 'investor_grade'
  | 'agency_client'
  | 'ai_agent_engineering';

/** Vertical template shaping document content & emphasis. */
export type VerticalTemplate =
  | 'b2b_saas'
  | 'mobile_consumer_app'
  | 'marketplace'
  | 'ai_agent_product'
  | 'api_product'
  | 'community_content_product'
  | 'local_service_saas'
  | 'compliance_saas'
  | 'health_adjacent_product'
  | 'fintech_adjacent_product'
  | 'ecommerce_tool'
  | 'creator_economy_tool'
  | 'internal_enterprise_tool';

/**
 * Document types in a pack.
 *
 * The first 27 are the canonical REQUIRED set (Sessions 1–13). Session 14 adds
 * optional Breakout/Build-Blueprint document types which are NOT part of the
 * required 27 — they are appended to build-oriented depths so existing packs,
 * quality gates and exports remain backwards-compatible.
 */
export type DocumentType =
  | CanonicalDocumentType
  | BlueprintDocumentType;

/** The 27 canonical document types (the required spine). */
export type CanonicalDocumentType =
  | 'product_vision'
  | 'market_context'
  | 'target_audience_icp'
  | 'jobs_to_be_done'
  | 'problem_map'
  | 'user_scenarios'
  | 'feature_checklist'
  | 'mvp_scope'
  | 'post_mvp_scope'
  | 'ux_flow'
  | 'screen_map'
  | 'design_brd'
  | 'frontend_brd'
  | 'backend_brd'
  | 'data_model'
  | 'api_requirements'
  | 'ai_agent_instructions'
  | 'acceptance_criteria'
  | 'monetization_plan'
  | 'go_to_market_plan'
  | 'analytics_plan'
  | 'risks_and_assumptions'
  | 'research_questions'
  | 'roadmap'
  | 'market_selection_memo'
  | 'evidence_map'
  | 'source_appendix';

/**
 * Session 14 Breakout / Build-Blueprint document types. Optional and additive:
 * appended to build-oriented depths, never part of the required 27.
 */
export type BlueprintDocumentType =
  | 'venture_thesis'
  | 'breakout_opportunity_memo'
  | 'build_blueprint'
  | 'do_not_build';

export const BLUEPRINT_DOCUMENT_TYPES: readonly BlueprintDocumentType[] = [
  'venture_thesis',
  'breakout_opportunity_memo',
  'build_blueprint',
  'do_not_build',
] as const;

/** Ordered list of all required (canonical) document types in a full pack. */
export const REQUIRED_DOCUMENT_TYPES: readonly CanonicalDocumentType[] = [
  'product_vision',
  'market_context',
  'target_audience_icp',
  'jobs_to_be_done',
  'problem_map',
  'user_scenarios',
  'feature_checklist',
  'mvp_scope',
  'post_mvp_scope',
  'ux_flow',
  'screen_map',
  'design_brd',
  'frontend_brd',
  'backend_brd',
  'data_model',
  'api_requirements',
  'ai_agent_instructions',
  'acceptance_criteria',
  'monetization_plan',
  'go_to_market_plan',
  'analytics_plan',
  'risks_and_assumptions',
  'research_questions',
  'roadmap',
  'market_selection_memo',
  'evidence_map',
  'source_appendix',
] as const;

export type DocumentStatus =
  | 'empty'
  | 'generating'
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'locked'
  | 'archived'
  | 'failed';

/** Per-document language record (a document can be regenerated per locale). */
export interface DocumentLanguage {
  language: LocaleCode;
  isPrimary: boolean;
}

export interface ProductDocumentPack extends Timestamps, WorkspaceOwned, Versioned {
  id: Id;
  nicheId: Id;
  projectId: Id;
  title: string;
  depth: ProductPackDepth;
  verticalTemplate: VerticalTemplate;
  market: MarketProfile;
  primaryLanguage: LocaleCode;
  status: DocumentStatus;
  confidence: Confidence;
  documentIds: Id[];
  qualityGateResultId: Id | null;
}

/** A single document inside a pack. */
export interface ProductPackDocument extends Timestamps, Versioned {
  id: Id;
  packId: Id;
  docType: DocumentType;
  title: string;
  /** Markdown body. */
  body: string;
  language: LocaleCode;
  status: DocumentStatus;
  confidence: Confidence;
  market: MarketProfile;
  depth: ProductPackDepth;
  verticalTemplate: VerticalTemplate;
  sourceRefIds: Id[];
  claimIds: Id[];
  assumptionIds: Id[];
  constraintIds: Id[];
  unresolvedQuestionIds: Id[];
  qualityGateStatus: QualityGateStatus;
  currentVersionId: Id | null;
}

export interface DocumentVersion extends Timestamps {
  id: Id;
  documentId: Id;
  version: number;
  body: string;
  changeSummary: string;
  authorId: Id | null;
  generatedBy: GeneratedBy;
  linkedResearchUpdateId: Id | null;
  affectedClaimIds: Id[];
  affectedAssumptionIds: Id[];
}

export interface DocumentComment extends Timestamps {
  id: Id;
  documentId: Id;
  authorId: Id;
  body: string;
  /** Optional anchor to a claim/assumption being discussed. */
  anchorType: 'document' | 'claim' | 'assumption' | null;
  anchorId: Id | null;
  parentCommentId: Id | null;
  resolved: boolean;
}

/** Research input that can revalidate claims/assumptions and trigger regen. */
export type ResearchUpdateType =
  | 'customer_interview'
  | 'competitor_note'
  | 'landing_result'
  | 'survey_result'
  | 'pricing_feedback'
  | 'legal_note'
  | 'local_market_note'
  | 'investor_feedback'
  | 'internal_team_note'
  | 'ai_agent_implementation_feedback';

export interface ResearchUpdate extends Timestamps, WorkspaceOwned {
  id: Id;
  projectId: Id;
  type: ResearchUpdateType;
  title: string;
  body: string;
  linkedClaimIds: Id[];
  linkedAssumptionIds: Id[];
  linkedDocumentIds: Id[];
  authorId: Id;
}

export type QualityGateStatus = 'not_run' | 'passed' | 'warnings' | 'failed';

/** A single quality-gate check outcome. */
export interface QualityGateCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  /** Document(s) the check applies to, if scoped. */
  documentIds: Id[];
}

export interface QualityGateResult extends Timestamps {
  id: Id;
  packId: Id;
  status: QualityGateStatus;
  checks: QualityGateCheck[];
  passedCount: number;
  warnCount: number;
  failCount: number;
}

/** Role bucket used to group "Vibe Coding Prompts" (execution handoff AI-agent prompts). */
export type PromptRole = 'frontend' | 'backend' | 'ai' | 'qa' | 'integration' | 'general';

/**
 * Buckets an AI-agent prompt draft into a role for display, based on which
 * Product Pack V2 sections it's tied to (`relatedSections`, e.g.
 * `frontend_pack`, `backend_pack`, `ai_agent_pack`, `qa_acceptance_pack`,
 * `api_integration_requirements`). Shared by the mobile Prompts screen and
 * the export ZIP renderers so grouping is identical everywhere.
 */
export function inferPromptRole(relatedSections: readonly string[]): PromptRole {
  const joined = relatedSections.join(' ').toLowerCase();
  if (joined.includes('frontend')) return 'frontend';
  if (joined.includes('backend')) return 'backend';
  if (joined.includes('ai_agent') || joined.includes('ai_')) return 'ai';
  if (joined.includes('qa_') || joined.includes('acceptance')) return 'qa';
  if (joined.includes('integration') || joined.includes('api_')) return 'integration';
  return 'general';
}
