import { Injectable } from '@nestjs/common';
import type { ExportManifest, ExportType, LocaleCode, RoleBriefType, WhiteLabelSnapshot } from '@signalkit/shared';
import { createManifest } from '@signalkit/exports';

export interface ManifestInput {
  exportId: string | null;
  workspaceId: string;
  packId: string;
  exportType: ExportType;
  outputLanguage: LocaleCode;
  createdBy: string | null;
  roleBriefType: RoleBriefType | null;
  whiteLabelSettings: WhiteLabelSnapshot | null;
  pack: {
    version: number;
    projectId: string;
    documents: { docType: string; body: string }[];
  };
  fileList: { path: string; docType: string | null; bytes: number }[];
  qualityGate: { status: string; passedCount: number; warnCount: number; failCount: number } | null;
  evidence: { id: string }[];
  claims: { id: string }[];
  assumptions: { id: string }[];
  constraints: { id: string }[];
  unresolvedQuestions: { id: string }[];
  sourceRefs: { id: string; url: string | null; title: string | null; adapter: string }[];
  includedDocuments: string[];
  excludedDocuments: string[];
  checksum: string | null;
}

@Injectable()
export class ExportManifestService {
  build(input: ManifestInput): ExportManifest {
    return createManifest({
      exportId: input.exportId,
      workspaceId: input.workspaceId,
      projectId: input.pack.projectId,
      packId: input.packId,
      packVersion: input.pack.version,
      exportType: input.exportType,
      outputLanguage: input.outputLanguage,
      createdBy: input.createdBy,
      documentList: input.pack.documents.map((d) => d.docType),
      includedDocuments: input.includedDocuments,
      excludedDocuments: input.excludedDocuments,
      qualityGateSummary: input.qualityGate,
      evidenceSummary: { count: input.evidence.length, ids: input.evidence.map((e) => e.id) },
      assumptionsSummary: { count: input.assumptions.length, ids: input.assumptions.map((a) => a.id) },
      constraintsSummary: { count: input.constraints.length, ids: input.constraints.map((c) => c.id) },
      unresolvedQuestionsSummary: { count: input.unresolvedQuestions.length, ids: input.unresolvedQuestions.map((q) => q.id) },
      sourceRefs: input.sourceRefs,
      roleBriefType: input.roleBriefType,
      whiteLabelSettings: input.whiteLabelSettings,
      fileList: input.fileList,
      checksum: input.checksum,
    });
  }
}
