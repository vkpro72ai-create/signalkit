-- Session 11: Document Governance — editing, versioning, research updates, comments
-- Additive migration: extends DocumentVersion; adds ResearchUpdate and DocumentComment.

-- Extend DocumentVersion with governance context
ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "packId" TEXT;
ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "linkedResearchUpdateId" TEXT;
ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "affectedClaimIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "affectedAssumptionIds" JSONB NOT NULL DEFAULT '[]';

-- Fix generatedBy default to match governance context (human edits, not llm)
-- (existing rows keep their value; new rows default to human unless specified)
ALTER TABLE "DocumentVersion" ALTER COLUMN "generatedBy" SET DEFAULT 'human';

CREATE INDEX IF NOT EXISTS "DocumentVersion_packId_idx" ON "DocumentVersion"("packId");

-- Research Updates: customer interviews, competitor notes, landing results, etc.
CREATE TABLE IF NOT EXISTS "ResearchUpdate" (
    "id"                  TEXT NOT NULL,
    "packId"              TEXT NOT NULL,
    "workspaceId"         TEXT NOT NULL,
    "projectId"           TEXT,
    "title"               TEXT NOT NULL,
    "type"                TEXT NOT NULL DEFAULT 'internal_team_note',
    "content"             TEXT NOT NULL DEFAULT '',
    "language"            TEXT NOT NULL DEFAULT 'en',
    "marketContext"       TEXT,
    "sourceRefs"          JSONB NOT NULL DEFAULT '[]',
    "linkedDocumentIds"   JSONB NOT NULL DEFAULT '[]',
    "linkedClaimIds"      JSONB NOT NULL DEFAULT '[]',
    "linkedAssumptionIds" JSONB NOT NULL DEFAULT '[]',
    "linkedQuestionIds"   JSONB NOT NULL DEFAULT '[]',
    "confidenceImpact"    TEXT,
    "createdById"         TEXT NOT NULL,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchUpdate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ResearchUpdate_packId_idx" ON "ResearchUpdate"("packId");
CREATE INDEX IF NOT EXISTS "ResearchUpdate_workspaceId_idx" ON "ResearchUpdate"("workspaceId");

-- Document Comments: open / resolved per document, claim, or assumption
CREATE TABLE IF NOT EXISTS "DocumentComment" (
    "id"           TEXT NOT NULL,
    "workspaceId"  TEXT NOT NULL,
    "projectId"    TEXT,
    "packId"       TEXT NOT NULL,
    "documentId"   TEXT,
    "claimId"      TEXT,
    "assumptionId" TEXT,
    "authorId"     TEXT NOT NULL,
    "body"         TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'open',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"   TIMESTAMP(3),
    "resolvedBy"   TEXT,
    CONSTRAINT "DocumentComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DocumentComment_packId_idx" ON "DocumentComment"("packId");
CREATE INDEX IF NOT EXISTS "DocumentComment_documentId_idx" ON "DocumentComment"("documentId");
