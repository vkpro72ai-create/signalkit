-- Session 8: project-scope + claim links for the evidence graph (additive, nullable).

ALTER TABLE "EvidenceItem" ADD COLUMN "projectId" TEXT;
CREATE INDEX "EvidenceItem_projectId_idx" ON "EvidenceItem"("projectId");

ALTER TABLE "Claim" ADD COLUMN "projectId" TEXT;
CREATE INDEX "Claim_projectId_idx" ON "Claim"("projectId");

ALTER TABLE "Assumption" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Assumption" ADD COLUMN "claimId" TEXT;
CREATE INDEX "Assumption_projectId_idx" ON "Assumption"("projectId");
CREATE INDEX "Assumption_claimId_idx" ON "Assumption"("claimId");

ALTER TABLE "Constraint" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Constraint" ADD COLUMN "projectId" TEXT;
CREATE INDEX "Constraint_projectId_idx" ON "Constraint"("projectId");

ALTER TABLE "UnresolvedQuestion" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "UnresolvedQuestion" ADD COLUMN "projectId" TEXT;
ALTER TABLE "UnresolvedQuestion" ADD COLUMN "claimId" TEXT;
CREATE INDEX "UnresolvedQuestion_projectId_idx" ON "UnresolvedQuestion"("projectId");
CREATE INDEX "UnresolvedQuestion_claimId_idx" ON "UnresolvedQuestion"("claimId");
