-- Layer 2 / Phase L2.1: self-improvement pipeline audit trail. Additive only.
-- Does not alter McpClientSession, McpOAuthClient, or any Product Pack /
-- Layer 1 table. mcpClientSessionId is SetNull (never Cascade) — revoking or
-- deleting an MCP session must never erase proposal/PR/review/deploy history.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SelfImprovementRunStatus') THEN
    CREATE TYPE "SelfImprovementRunStatus" AS ENUM (
      'proposed', 'generating', 'testing', 'review_pending',
      'human_review_pending', 'failed', 'rolled_back', 'circuit_broken'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MigrationSafetyClass') THEN
    CREATE TYPE "MigrationSafetyClass" AS ENUM (
      'none', 'safe_additive_candidate', 'manual_review_required', 'destructive_blocked'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SelfImprovementRun" (
    "id"                  TEXT NOT NULL,
    "actorUserId"         TEXT NOT NULL,
    "actorWorkspaceId"    TEXT,
    "mcpClientSessionId"  TEXT,
    "requestSummary"      TEXT NOT NULL,
    "objective"           TEXT NOT NULL,
    "constraints"         JSONB NOT NULL DEFAULT '[]',
    "acceptanceCriteria"  JSONB NOT NULL DEFAULT '[]',
    "baseSha"             TEXT NOT NULL,
    "generatedBranchName" TEXT,
    "generatedCommitSha"  TEXT,
    "prNumber"            INTEGER,
    "prUrl"               TEXT,
    "mergeCommitSha"      TEXT,
    "status"              "SelfImprovementRunStatus" NOT NULL DEFAULT 'proposed',
    "failureStage"        TEXT,
    "failureReason"       TEXT,
    "testsPassed"         BOOLEAN,
    "reviewFindings"      JSONB NOT NULL DEFAULT '[]',
    "migrationSafety"     "MigrationSafetyClass" NOT NULL DEFAULT 'none',
    "healthcheckOk"       BOOLEAN,
    "deployedAt"          TIMESTAMP(3),
    "rolledBackAt"        TIMESTAMP(3),
    "rollbackReason"      TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SelfImprovementRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SelfImprovementRun_status_idx" ON "SelfImprovementRun"("status");
CREATE INDEX IF NOT EXISTS "SelfImprovementRun_actorUserId_idx" ON "SelfImprovementRun"("actorUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SelfImprovementRun_mcpClientSessionId_fkey'
  ) THEN
    ALTER TABLE "SelfImprovementRun"
      ADD CONSTRAINT "SelfImprovementRun_mcpClientSessionId_fkey"
      FOREIGN KEY ("mcpClientSessionId") REFERENCES "McpClientSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
