/**
 * Export system contracts: export types, jobs, manifests, role briefs and
 * share links. Exports are the primary commercial deliverable.
 */
import type { Id, Timestamps, WorkspaceOwned, UserId } from './common.js';
import type { LocaleCode } from './geo.js';

export type ExportType =
  | 'full_pdf_pack'
  | 'founder_summary_pdf'
  | 'investor_memo_pdf'
  | 'pm_brief'
  | 'designer_brd'
  | 'frontend_brd'
  | 'backend_brd'
  | 'growth_brief'
  | 'sales_brief'
  | 'ai_agent_engineering_bundle'
  | 'markdown_zip'
  | 'json_bundle'
  | 'evidence_appendix'
  | 'source_appendix'
  | 'roadmap_pdf'
  | 'client_agency_export';

/** Role-targeted brief variants. */
export type RoleBriefType =
  | 'founder'
  | 'pm'
  | 'designer'
  | 'frontend'
  | 'backend'
  | 'growth'
  | 'sales'
  | 'investor'
  | 'ai_agent';

export type ExportStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'expired';

export interface ExportJob extends Timestamps, WorkspaceOwned {
  id: Id;
  packId: Id;
  type: ExportType;
  language: LocaleCode;
  roleBrief: RoleBriefType | null;
  /** White-label branding applied at render time. */
  applyBranding: boolean;
  status: ExportStatus;
  requestedBy: UserId;
  retries: number;
  errorCode: string | null;
  artifactId: Id | null;
  expiresAt: string | null;
}

export interface ExportArtifact extends Timestamps {
  id: Id;
  exportJobId: Id;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export interface ExportManifestFile {
  path: string;
  docType: string | null;
  bytes: number;
}

export interface ExportManifestSummary {
  count: number;
  ids: string[];
}

export interface WhiteLabelSnapshot {
  brandName: string | null;
  logoUrl: string | null;
  preparedBy: string | null;
  clientName: string | null;
  footerText: string | null;
  customDisclaimer: string | null;
  hideSignalKitBrand: boolean;
}

/** Full manifest written into every export bundle. */
export interface ExportManifest {
  schemaVersion: string;
  exportId: string | null;
  workspaceId: string;
  projectId: string | null;
  packId: Id;
  packVersion: number;
  exportType: ExportType;
  outputLanguage: LocaleCode;
  createdBy: string | null;
  generatedAt: string;
  /** All document types included in this export. */
  documentList: string[];
  includedDocuments: string[];
  excludedDocuments: string[];
  qualityGateSummary: {
    status: string;
    passedCount: number;
    warnCount: number;
    failCount: number;
  } | null;
  evidenceSummary: ExportManifestSummary;
  assumptionsSummary: ExportManifestSummary;
  constraintsSummary: ExportManifestSummary;
  unresolvedQuestionsSummary: ExportManifestSummary;
  sourceRefs: { id: string; url: string | null; title: string | null; adapter: string }[];
  roleBriefType: RoleBriefType | null;
  whiteLabelSettings: WhiteLabelSnapshot | null;
  fileList: ExportManifestFile[];
  checksum: string | null;
  /** Legacy compatibility fields */
  language: LocaleCode;
  files: ExportManifestFile[];
  documentCount: number;
  evidenceCount: number;
  claimCount: number;
}

export interface ShareLink extends Timestamps, WorkspaceOwned {
  id: Id;
  packId: Id;
  /** What the link exposes. */
  variant: 'niche_memo' | 'product_pack' | 'founder_summary' | 'investor_memo';
  token: string;
  passwordProtected: boolean;
  expiresAt: string | null;
  revoked: boolean;
  /** Hide internal evidence in the client-facing view. */
  hideInternalEvidence: boolean;
  viewCount: number;
}
