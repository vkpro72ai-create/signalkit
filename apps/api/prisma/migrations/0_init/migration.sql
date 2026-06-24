-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'strategist', 'product_manager', 'designer', 'engineer', 'growth', 'viewer', 'client_viewer');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'invited', 'suspended');

-- CreateEnum
CREATE TYPE "GeoConsentStatus" AS ENUM ('unknown', 'granted', 'denied', 'revoked');

-- CreateEnum
CREATE TYPE "LocationUsageMode" AS ENUM ('off', 'country_only', 'region_only');

-- CreateEnum
CREATE TYPE "MarketScope" AS ENUM ('current_location', 'country_of_residence', 'manual_country', 'manual_region', 'multi_country', 'global');

-- CreateEnum
CREATE TYPE "RegulatorySensitivity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "LlmMode" AS ENUM ('byok', 'platform');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('free', 'founder_pro', 'agency', 'studio', 'enterprise');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('empty', 'generating', 'draft', 'in_review', 'changes_requested', 'approved', 'locked', 'archived', 'failed');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('queued', 'processing', 'ready', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "SourceItemStatus" AS ENUM ('collected', 'parsed', 'failed', 'excluded');

-- CreateEnum
CREATE TYPE "LlmConnectionStatus" AS ENUM ('active', 'invalid', 'revoked');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "interfaceLocale" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'viewer',
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interfaceLocale" TEXT NOT NULL DEFAULT 'en',
    "defaultDocumentLanguage" TEXT NOT NULL DEFAULT 'en',
    "fallbackLanguage" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "geoConsentStatus" "GeoConsentStatus" NOT NULL DEFAULT 'unknown',
    "locationUsageMode" "LocationUsageMode" NOT NULL DEFAULT 'off',
    "detectedCountry" TEXT,
    "detectedRegion" TEXT,
    "countryOfResidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "defaultMarketCountry" TEXT,
    "defaultMarketRegion" TEXT,
    "defaultLlmMode" "LlmMode" NOT NULL DEFAULT 'byok',
    "billingPlan" "PlanType" NOT NULL DEFAULT 'free',
    "whiteLabelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "brandName" TEXT,
    "logoUrl" TEXT,
    "accentTokenName" TEXT,
    "footerText" TEXT,
    "customDisclaimer" TEXT,
    "hideSignalKitBrand" BOOLEAN NOT NULL DEFAULT false,
    "clientName" TEXT,
    "preparedBy" TEXT,
    "agencyContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "code" TEXT NOT NULL,
    "names" JSONB NOT NULL DEFAULT '{}',
    "primaryLanguage" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'USD',

    CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Region" (
    "code" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "names" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Region_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "marketScope" "MarketScope" NOT NULL DEFAULT 'global',
    "targetCountry" TEXT,
    "targetRegion" TEXT,
    "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "marketLanguage" TEXT NOT NULL DEFAULT 'en',
    "regulatorySensitivity" "RegulatorySensitivity" NOT NULL DEFAULT 'medium',
    "defaultOutputLanguage" TEXT NOT NULL DEFAULT 'en',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchContext" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "industry" TEXT,
    "theme" TEXT,
    "audience" TEXT,
    "productFormat" TEXT,
    "marketScope" "MarketScope" NOT NULL DEFAULT 'global',
    "targetCountry" TEXT,
    "targetRegion" TEXT,
    "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "marketLanguage" TEXT NOT NULL DEFAULT 'en',
    "outputLanguage" TEXT NOT NULL DEFAULT 'en',
    "languageMode" TEXT NOT NULL DEFAULT 'follow_interface',
    "localContextRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceReference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "publisher" TEXT,
    "language" TEXT,
    "country" TEXT,
    "userProvided" BOOLEAN NOT NULL DEFAULT false,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSourceItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceRefId" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "language" TEXT,
    "country" TEXT,
    "status" "SourceItemStatus" NOT NULL DEFAULT 'collected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawSourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedSourceItem" (
    "id" TEXT NOT NULL,
    "rawSourceItemId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "extractedEntities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detectedMarket" TEXT,
    "detectedLanguage" TEXT,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NormalizedSourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "strengthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freshnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "industry" TEXT,
    "topic" TEXT,
    "audience" TEXT,
    "sourceRefIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Niche" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "oneLiner" TEXT NOT NULL DEFAULT '',
    "problem" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "whyNow" TEXT NOT NULL DEFAULT '',
    "useCases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mvpConcept" TEXT NOT NULL DEFAULT '',
    "monetization" TEXT NOT NULL DEFAULT '',
    "recommendedProductFormat" TEXT NOT NULL DEFAULT '',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'medium',
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Niche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NicheScore" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "scoringVersionId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'low',
    "breakdown" JSONB NOT NULL DEFAULT '[]',
    "riskPenalties" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NicheScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceRefId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "sourceLanguage" TEXT,
    "summary" TEXT NOT NULL,
    "summaryLanguage" TEXT NOT NULL DEFAULT 'en',
    "country" TEXT,
    "region" TEXT,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freshnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extractionMethod" TEXT NOT NULL DEFAULT 'manual',
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nicheId" TEXT,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "confidenceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'low',
    "market" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "generatedBy" TEXT NOT NULL DEFAULT 'llm',
    "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimEvidenceLink" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "evidenceItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'supports',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "ClaimEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contradiction" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "conflictingEvidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT NOT NULL,
    "suggestedQuestion" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contradiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumption" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "rationale" TEXT NOT NULL DEFAULT '',
    "validationStatus" TEXT NOT NULL DEFAULT 'untested',
    "impactIfWrong" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Constraint" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'technical',
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Constraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnresolvedQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnresolvedQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDocumentPack" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "depth" TEXT NOT NULL,
    "verticalTemplate" TEXT NOT NULL,
    "primaryLanguage" TEXT NOT NULL DEFAULT 'en',
    "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
    "confidenceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'low',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDocumentPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPackDocument" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
    "confidenceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'low',
    "qualityGateStatus" TEXT NOT NULL DEFAULT 'not_run',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPackDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT,
    "generatedBy" TEXT NOT NULL DEFAULT 'llm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMProvider" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "baseUrl" TEXT,
    "docsUrl" TEXT,
    "hasAdapter" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMModel" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "contextWindow" INTEGER NOT NULL DEFAULT 0,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "inputTokenPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputTokenPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "pricingSource" TEXT,
    "pricingFetchedAt" TIMESTAMP(3),
    "ratingOverall" DOUBLE PRECISION,
    "ratingReasoning" DOUBLE PRECISION,
    "ratingResearch" DOUBLE PRECISION,
    "ratingDocumentWriting" DOUBLE PRECISION,
    "ratingCodingContext" DOUBLE PRECISION,
    "ratingMultilingual" DOUBLE PRECISION,
    "speedRating" DOUBLE PRECISION,
    "privacyRating" DOUBLE PRECISION,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bestUseCases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportedLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportsJsonMode" BOOLEAN NOT NULL DEFAULT false,
    "supportsTools" BOOLEAN NOT NULL DEFAULT false,
    "supportsVision" BOOLEAN NOT NULL DEFAULT false,
    "supportsReasoning" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "lastBenchmarkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLLMConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "baseUrl" TEXT,
    "status" "LlmConnectionStatus" NOT NULL DEFAULT 'active',
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLLMConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceLLMSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mode" "LlmMode" NOT NULL DEFAULT 'byok',
    "defaultModelId" TEXT,
    "fallbackModelId" TEXT,
    "routingRules" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceLLMSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMUsageLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "packId" TEXT,
    "documentId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCost" DOUBLE PRECISION,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "roleBrief" TEXT,
    "applyBranding" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExportStatus" NOT NULL DEFAULT 'queued',
    "requestedById" TEXT NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportArtifact" (
    "id" TEXT NOT NULL,
    "exportJobId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "hideInternalEvidence" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL DEFAULT 'free',
    "paymentProvider" TEXT,
    "externalCustomerId" TEXT,
    "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "taskType" TEXT,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "APIKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Region_countryCode_idx" ON "Region"("countryCode");

-- CreateIndex
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- CreateIndex
CREATE INDEX "SearchContext_projectId_idx" ON "SearchContext"("projectId");

-- CreateIndex
CREATE INDEX "SourceReference_projectId_idx" ON "SourceReference"("projectId");

-- CreateIndex
CREATE INDEX "RawSourceItem_sourceRefId_idx" ON "RawSourceItem"("sourceRefId");

-- CreateIndex
CREATE INDEX "NormalizedSourceItem_rawSourceItemId_idx" ON "NormalizedSourceItem"("rawSourceItemId");

-- CreateIndex
CREATE INDEX "TrendSignal_projectId_idx" ON "TrendSignal"("projectId");

-- CreateIndex
CREATE INDEX "Niche_projectId_idx" ON "Niche"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringVersion_version_key" ON "ScoringVersion"("version");

-- CreateIndex
CREATE INDEX "NicheScore_nicheId_idx" ON "NicheScore"("nicheId");

-- CreateIndex
CREATE INDEX "EvidenceItem_sourceRefId_idx" ON "EvidenceItem"("sourceRefId");

-- CreateIndex
CREATE INDEX "Claim_nicheId_idx" ON "Claim"("nicheId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimEvidenceLink_claimId_evidenceItemId_key" ON "ClaimEvidenceLink"("claimId", "evidenceItemId");

-- CreateIndex
CREATE INDEX "Contradiction_claimId_idx" ON "Contradiction"("claimId");

-- CreateIndex
CREATE INDEX "ProductDocumentPack_nicheId_idx" ON "ProductDocumentPack"("nicheId");

-- CreateIndex
CREATE INDEX "ProductPackDocument_packId_idx" ON "ProductPackDocument"("packId");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "LLMProvider_type_key" ON "LLMProvider"("type");

-- CreateIndex
CREATE UNIQUE INDEX "LLMModel_provider_modelId_key" ON "LLMModel"("provider", "modelId");

-- CreateIndex
CREATE INDEX "UserLLMConnection_workspaceId_idx" ON "UserLLMConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceLLMSettings_workspaceId_key" ON "WorkspaceLLMSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "LLMUsageLog_workspaceId_createdAt_idx" ON "LLMUsageLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportJob_workspaceId_idx" ON "ExportJob"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExportArtifact_exportJobId_key" ON "ExportArtifact"("exportJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_workspaceId_idx" ON "ShareLink"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_workspaceId_key" ON "BillingAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "CreditTransaction_workspaceId_idx" ON "CreditTransaction"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_workspaceId_key_period_key" ON "UsageCounter"("workspaceId", "key", "period");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_keyHash_key" ON "APIKey"("keyHash");

-- CreateIndex
CREATE INDEX "APIKey_workspaceId_idx" ON "APIKey"("workspaceId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchContext" ADD CONSTRAINT "SearchContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSourceItem" ADD CONSTRAINT "RawSourceItem_sourceRefId_fkey" FOREIGN KEY ("sourceRefId") REFERENCES "SourceReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedSourceItem" ADD CONSTRAINT "NormalizedSourceItem_rawSourceItemId_fkey" FOREIGN KEY ("rawSourceItemId") REFERENCES "RawSourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendSignal" ADD CONSTRAINT "TrendSignal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Niche" ADD CONSTRAINT "Niche_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NicheScore" ADD CONSTRAINT "NicheScore_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NicheScore" ADD CONSTRAINT "NicheScore_scoringVersionId_fkey" FOREIGN KEY ("scoringVersionId") REFERENCES "ScoringVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_sourceRefId_fkey" FOREIGN KEY ("sourceRefId") REFERENCES "SourceReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidenceLink" ADD CONSTRAINT "ClaimEvidenceLink_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidenceLink" ADD CONSTRAINT "ClaimEvidenceLink_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contradiction" ADD CONSTRAINT "Contradiction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocumentPack" ADD CONSTRAINT "ProductDocumentPack_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackDocument" ADD CONSTRAINT "ProductPackDocument_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ProductDocumentPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProductPackDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLLMConnection" ADD CONSTRAINT "UserLLMConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLLMConnection" ADD CONSTRAINT "UserLLMConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceLLMSettings" ADD CONSTRAINT "WorkspaceLLMSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_exportJobId_fkey" FOREIGN KEY ("exportJobId") REFERENCES "ExportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

