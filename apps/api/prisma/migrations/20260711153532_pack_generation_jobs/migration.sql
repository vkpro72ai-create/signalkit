-- CreateEnum
CREATE TYPE "PackGenerationJobStatus" AS ENUM ('queued', 'running', 'partially_ready', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "PackGenerationStepStatus" AS ENUM ('pending', 'running', 'completed', 'repairing', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "PackGenerationMode" AS ENUM ('standard', 'strong_model');

-- CreateTable
CREATE TABLE "ProductPackGenerationJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "status" "PackGenerationJobStatus" NOT NULL DEFAULT 'queued',
    "generationMode" "PackGenerationMode" NOT NULL DEFAULT 'standard',
    "depth" TEXT NOT NULL,
    "verticalTemplate" TEXT NOT NULL,
    "language" TEXT,
    "requestedById" TEXT,
    "currentStep" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "readyDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "totalExpectedDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "buildReady" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ProductPackGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPackGenerationStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" "PackGenerationStepStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "model" TEXT,
    "maxOutputTokens" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "repairCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorReason" TEXT,
    "documentIds" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPackGenerationStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPackGenerationJob_workspaceId_idx" ON "ProductPackGenerationJob"("workspaceId");

-- CreateIndex
CREATE INDEX "ProductPackGenerationJob_packId_idx" ON "ProductPackGenerationJob"("packId");

-- CreateIndex
CREATE INDEX "ProductPackGenerationJob_nicheId_idx" ON "ProductPackGenerationJob"("nicheId");

-- CreateIndex
CREATE INDEX "ProductPackGenerationStep_jobId_idx" ON "ProductPackGenerationStep"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPackGenerationStep_jobId_stepKey_key" ON "ProductPackGenerationStep"("jobId", "stepKey");

-- AddForeignKey
ALTER TABLE "ProductPackGenerationStep" ADD CONSTRAINT "ProductPackGenerationStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProductPackGenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
