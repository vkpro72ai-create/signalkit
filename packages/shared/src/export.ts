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

/** Manifest describing the contents of an export bundle. */
export interface ExportManifest {
  packId: Id;
  exportType: ExportType;
  language: LocaleCode;
  generatedAt: string;
  files: { path: string; docType: string | null; bytes: number }[];
  documentCount: number;
  evidenceCount: number;
  claimCount: number;
  schemaVersion: string;
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
