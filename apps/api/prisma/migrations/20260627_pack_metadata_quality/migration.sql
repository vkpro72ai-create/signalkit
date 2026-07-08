-- Session 10: per-document metadata + quality gate results (additive).

ALTER TABLE "ProductPackDocument" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "QualityGateResult" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_run',
    "checks" JSONB NOT NULL DEFAULT '[]',
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "warnCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QualityGateResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QualityGateResult_packId_idx" ON "QualityGateResult"("packId");
