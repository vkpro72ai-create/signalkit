# Data Model

The authoritative type definitions live in `packages/shared/src`. The PostgreSQL/Prisma schema (Session 2) is a direct projection of these contracts. This document is the human-readable map.

## Cross-cutting building blocks (`common.ts`)

`Timestamps`, `SoftDeletable`, `WorkspaceOwned`, `Versioned`, `Confidence` (value + level + rationale), `LocalizedText`, `GeneratedBy`, `Paginated<T>`, `ApiError`, `Result<T,E>`.

Every entity below is `WorkspaceOwned` and carries `Timestamps` unless noted.

## Identity & platform (`core.ts`)

- **User**, **Workspace**, **WorkspaceMember** (with `WorkspaceRole`), **Permission** (fine-grained; RBAC maps roles → permissions).
- **UserSettings** (interface locale, default/fallback document language, timezone, geo) and **WorkspaceSettings** (default locale, default market, LLM mode, white-label, billing plan).
- **Project**, **SearchContext** (industry/theme/audience + market + languages + local context rules).

## Geo & market (`geo.ts`)

`LocaleCode` (en, ru, tr, de, es, fr, pt, ar, hi, id), `LanguageMode`, `CountryCode`, `RegionCode`, `MarketScope`, `GeoConsentStatus`, `LocationUsageMode`. Entities: **GeoPreference**, **MarketProfile**, **Country**, **Region**.

## Sources & signals (`trend.ts`)

`SourceAdapterType`, `SignalType`. Entities: **SourceReference**, **RawSourceItem**, **NormalizedSourceItem**, **TrendSignal**.

## Niches & scoring (`trend.ts`)

**Niche**, **NicheScore** (total + confidence + `ScoringBreakdown[]` + risk penalties), **MarketScore**, **ScoringVersion**. 17 `ScoreDimension`s drive scoring.

## Evidence graph (`evidence.ts`)

**EvidenceItem**, **Claim** (with `ClaimType`), **ClaimEvidenceLink**, **Contradiction**, **ConfidenceAssessment**, **Assumption** + **AssumptionValidation**, **Constraint**, **UnresolvedQuestion**.

## Product Document Pack (`product-pack.ts`)

`ProductPackDepth`, `VerticalTemplate`, `DocumentType` (27 canonical types), `DocumentStatus`. Entities: **ProductDocumentPack**, **ProductPackDocument**, **DocumentVersion**, **DocumentComment**, **ResearchUpdate**, **QualityGateResult** (+ `QualityGateCheck`).

## LLM (`llm.ts`)

`LLMProviderType`, `LLMTaskType` (32 task types). Entities: **LLMProvider**, **LLMModel** (full catalog metadata: price, context, ratings, speed, privacy, strengths/weaknesses, supported languages, capability flags), **UserLLMConnection** (encrypted, masked), **WorkspaceLLMSettings**, **LLMRoutingRule**, **LLMUsageLog**, **LLMCostEstimate**, **LLMBenchmarkResult**.

## Exports (`export.ts`)

`ExportType`, `RoleBriefType`, `ExportStatus`. Entities: **ExportJob**, **ExportArtifact**, **ExportManifest**, **ShareLink**.

## Commercial & audit (`billing.ts`)

`PlanType`, `UsageLimitKey`. Entities: **Plan**, **UsageLimit**, **UsageCounter**, **CreditTransaction**, **BillingAccount**, **APIKey**, **RateLimitPolicy**, **AuditLogEvent** (with `AuditLogAction`).
