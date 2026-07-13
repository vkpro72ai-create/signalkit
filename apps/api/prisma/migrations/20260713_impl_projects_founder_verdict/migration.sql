-- CreateEnum
CREATE TYPE "FounderDecision" AS ENUM ('undecided', 'explore', 'generate_pack', 'postpone', 'reject', 'ready_to_commit');

-- CreateEnum
CREATE TYPE "AmbitionMode" AS ENUM ('cash_flow_business', 'venture_scale', 'unicorn_ambition');

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "model" TEXT;

-- CreateTable
CREATE TABLE "OpportunityFounderVerdict" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT NOT NULL DEFAULT '',
    "decision" "FounderDecision" NOT NULL DEFAULT 'undecided',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityFounderVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "researchProjectId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "founderRatingSnapshot" INTEGER,
    "founderCommentSnapshot" TEXT NOT NULL DEFAULT '',
    "ambitionMode" "AmbitionMode" NOT NULL,
    "buildReadySnapshot" BOOLEAN NOT NULL DEFAULT false,
    "ventureReadySnapshot" BOOLEAN NOT NULL DEFAULT false,
    "unicornPotentialSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "topRisksSnapshot" JSONB NOT NULL DEFAULT '[]',
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunityFounderVerdict_nicheId_idx" ON "OpportunityFounderVerdict"("nicheId");

-- CreateIndex
CREATE INDEX "OpportunityFounderVerdict_workspaceId_idx" ON "OpportunityFounderVerdict"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityFounderVerdict_nicheId_userId_key" ON "OpportunityFounderVerdict"("nicheId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationProject_packId_key" ON "ImplementationProject"("packId");

-- CreateIndex
CREATE INDEX "ImplementationProject_workspaceId_idx" ON "ImplementationProject"("workspaceId");

-- CreateIndex
CREATE INDEX "ImplementationProject_nicheId_idx" ON "ImplementationProject"("nicheId");

-- CreateIndex
CREATE INDEX "ImplementationProject_researchProjectId_idx" ON "ImplementationProject"("researchProjectId");

-- AddForeignKey
ALTER TABLE "OpportunityFounderVerdict" ADD CONSTRAINT "OpportunityFounderVerdict_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFounderVerdict" ADD CONSTRAINT "OpportunityFounderVerdict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationProject" ADD CONSTRAINT "ImplementationProject_researchProjectId_fkey" FOREIGN KEY ("researchProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationProject" ADD CONSTRAINT "ImplementationProject_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationProject" ADD CONSTRAINT "ImplementationProject_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ProductDocumentPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationProject" ADD CONSTRAINT "ImplementationProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
