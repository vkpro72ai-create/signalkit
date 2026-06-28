-- Session 14: Breakout Opportunity Engine + Build Blueprint Layer
-- Additive migration only. Adds VentureThesis (per niche) and BuildBlueprint
-- (per pack). Does not alter or recreate any existing table.

-- Venture Thesis + Venture Scale Score (separate from opportunity/confidence).
CREATE TABLE IF NOT EXISTS "VentureThesis" (
    "id"                     TEXT NOT NULL,
    "workspaceId"            TEXT NOT NULL,
    "nicheId"                TEXT NOT NULL,
    "projectId"              TEXT NOT NULL,
    "thesis"                 JSONB NOT NULL DEFAULT '{}',
    "ventureScaleScore"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ventureScaleConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ventureScaleLevel"      TEXT NOT NULL DEFAULT 'low',
    "ventureScaleBreakdown"  JSONB NOT NULL DEFAULT '[]',
    "whatMustBeTrue"         JSONB NOT NULL DEFAULT '[]',
    "version"                INTEGER NOT NULL DEFAULT 1,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VentureThesis_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VentureThesis_nicheId_idx" ON "VentureThesis"("nicheId");
CREATE INDEX IF NOT EXISTS "VentureThesis_projectId_idx" ON "VentureThesis"("projectId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'VentureThesis_nicheId_fkey'
  ) THEN
    ALTER TABLE "VentureThesis"
      ADD CONSTRAINT "VentureThesis_nicheId_fkey"
      FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Build Blueprint (per pack): screen contracts, state matrix, API↔screen map,
-- component contracts, permission matrix, analytics events, DO_NOT_BUILD.
CREATE TABLE IF NOT EXISTS "BuildBlueprint" (
    "id"                      TEXT NOT NULL,
    "workspaceId"             TEXT NOT NULL,
    "packId"                  TEXT NOT NULL,
    "nicheId"                 TEXT NOT NULL,
    "projectId"               TEXT NOT NULL,
    "screenContracts"         JSONB NOT NULL DEFAULT '[]',
    "stateMatrix"             JSONB NOT NULL DEFAULT '[]',
    "apiToScreenMap"          JSONB NOT NULL DEFAULT '[]',
    "componentContracts"      JSONB NOT NULL DEFAULT '[]',
    "permissionMatrix"        JSONB NOT NULL DEFAULT '[]',
    "analyticsEvents"         JSONB NOT NULL DEFAULT '[]',
    "doNotBuild"              JSONB NOT NULL DEFAULT '[]',
    "validationRules"         JSONB NOT NULL DEFAULT '[]',
    "buildReadinessScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buildReadinessLevel"     TEXT NOT NULL DEFAULT 'low',
    "buildReadinessBreakdown" JSONB NOT NULL DEFAULT '[]',
    "warnings"                JSONB NOT NULL DEFAULT '[]',
    "version"                 INTEGER NOT NULL DEFAULT 1,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildBlueprint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BuildBlueprint_packId_idx" ON "BuildBlueprint"("packId");
CREATE INDEX IF NOT EXISTS "BuildBlueprint_nicheId_idx" ON "BuildBlueprint"("nicheId");
