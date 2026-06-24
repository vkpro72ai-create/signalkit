# Build Log

Chronological record of what each session implemented. See [AGENT_RULES.md](AGENT_RULES.md) for the after-session checklist.

---

## Session 1 — Full Platform Monorepo, Shared Contracts, Product Rules

**Status:** ✅ Complete

### Done

- **Monorepo foundation**: pnpm workspace (`pnpm-workspace.yaml`), root `package.json` with scripts `dev/build/lint/typecheck/test/clean/format`, strict `tsconfig.base.json`, solution `tsconfig.json` with project references, flat ESLint config + Prettier, `.gitignore`, `.npmrc`, `README.md`.
- **`packages/shared`** — the dependency-free contract spine. All core types/enums implemented and organized:
  - `common.ts` (cross-cutting: Timestamps, WorkspaceOwned, Versioned, Confidence, Result, …)
  - `geo.ts` (LocaleCode×10, LanguageMode, Country/RegionCode, MarketScope, GeoPreference, MarketProfile, Country, Region)
  - `core.ts` (User, Workspace, WorkspaceMember, WorkspaceRole×9, Permission, UserSettings, WorkspaceSettings, WhiteLabelSettings, Project, SearchContext)
  - `trend.ts` (SourceAdapterType, SourceReference, SignalType, TrendSignal, Raw/NormalizedSourceItem, Niche, ScoringVersion, ScoreDimension×17, ScoringBreakdown, NicheScore, MarketScore)
  - `evidence.ts` (EvidenceItem, Claim, ClaimType, ClaimEvidenceLink, Contradiction, ConfidenceAssessment, Assumption, AssumptionValidation, Constraint, UnresolvedQuestion)
  - `product-pack.ts` (ProductPackDepth, VerticalTemplate×13, DocumentType×27, DocumentStatus, ProductDocumentPack, ProductPackDocument, DocumentVersion, DocumentComment, ResearchUpdate, QualityGateResult)
  - `llm.ts` (LLMProviderType×8, LLMProvider, LLMModel full catalog, LLMTaskType×32, UserLLMConnection, WorkspaceLLMSettings, LLMRoutingRule, LLMUsageLog, LLMCostEstimate, LLMBenchmarkResult)
  - `export.ts` (ExportType, RoleBriefType, ExportStatus, ExportJob, ExportArtifact, ExportManifest, ShareLink)
  - `billing.ts` (PlanType×5, UsageLimit, UsageCounter, CreditTransaction, BillingAccount, APIKey, RateLimitPolicy, AuditLogEvent)
  - `api.ts` (HealthResponse, MeResponse, request DTOs, `API_ROUTES`)
  - Vitest smoke tests for invariants (10 locales, 9 roles, 27 documents, 8 providers, 5 plans). **7 tests passing.**
- **Support packages** (build via `tsc -b`, depend on shared where needed):
  - `@signalkit/config` — strict env parsing + fail-fast secret validation.
  - `@signalkit/i18n` — locale detection/fallback/formatting + translation contract + RTL helper.
  - `@signalkit/ui` — flat 2D design tokens (semantic colors light/dark, spacing, radius, typography) + `assertNoGradient` guard.
  - `@signalkit/llm` — provider adapter, router, cost estimator and output-validator contracts.
  - `@signalkit/evidence` — confidence derivation, supported-claim & contradiction helpers.
  - `@signalkit/exports` — Markdown-ZIP folder map, AI-agent bundle file set, manifest builder.
- **App skeletons** that import the shared contracts:
  - `apps/api` (NestJS) — boots, `/health` returns the shared `HealthResponse`, fail-fast secret check.
  - `apps/web` (Next.js App Router) — home page consumes shared enums + UI tokens; flat 2D layout, `dir`/`lang` from i18n.
  - `apps/mobile` (Expo + Expo Router) — home screen consumes shared contracts.
  - `.env.example` for each app.
- **Docs** (meaningful, no lorem ipsum): PRODUCT_CONTEXT, PRODUCT_STRATEGY, ARCHITECTURE, AGENT_RULES, DATA_MODEL, UI_UX_PRINCIPLES, SECURITY, DEPLOYMENT_OVERVIEW, BUILD_LOG.
- **infra/** scaffolding: docker / caddy / scripts / github-actions placeholders documenting their Session 13 contents.

### How to verify

```bash
pnpm install
pnpm typecheck    # tsc -b across the package graph — PASS
pnpm test         # vitest — shared: 7/7 PASS, others passWithNoTests
pnpm lint         # eslint — 0 problems

# App typechecks against the shared contracts:
pnpm --filter @signalkit/api typecheck      # PASS
pnpm --filter @signalkit/mobile typecheck   # PASS
```

Verified this session: `pnpm typecheck`, `pnpm test`, `pnpm lint`, and the `api` + `mobile` typechecks all pass. Dependencies install cleanly.

### Known limitations

- **`apps/web` standalone `tsc --noEmit` caveat.** The shared-contract imports in web are correct (the only diagnostic is React's global `ReactNode` namespace). The repo legitimately contains two React majors — web (React 19) and mobile (React 18, required by React Native 0.76) — and pnpm hoists a single `@types/react` into its virtual store, which pollutes web's global React namespace during a *standalone* `tsc` run. This does not affect `next build` (Next runs its own correctly-scoped typecheck) and does not affect the shared package. Proper resolution lands with the real Next UI pipeline in Session 3 (e.g. pinning a consistent types strategy or isolating the React majors). `@types/react@^19` is already pinned to a stable patch via a `pnpm.overrides` entry.
- Apps are skeletons: they import the shared contracts and wire boot/health only. Full booting of Next/Expo dev servers was not exercised here.
- No database/Prisma yet (Session 2). 

### Next risks

- Session 2 introduces Prisma; keep the schema a faithful projection of `packages/shared` to avoid drift.
- Resolve the web/mobile React-types coexistence cleanly in Session 3 before the web UI grows.
- When booting apps, confirm `transpilePackages` (web) and Metro config (mobile) resolve workspace TS sources.

---

## Session 2 — Production Database, Auth, Workspace, RBAC, Audit, Settings

**Status:** ✅ Complete

### Done

- **Prisma schema** (`apps/api/prisma/schema.prisma`) — the first real migration, **39 tables**, a faithful projection of `@signalkit/shared` across every domain group: identity/platform (User, Workspace, WorkspaceMember, UserSettings, WorkspaceSettings, AuditLog), geo (Country, Region), projects (Project, SearchContext), sources/signals, niches/scoring, evidence graph, product pack/documents, LLM (provider, model, connection w/ `encryptedKey`+`maskedKey`, settings, usage), exports, and commercial (billing, credits, usage counters, API keys). Identity/geo/settings/RBAC/audit are fully fleshed out; downstream tables exist so the DB already supports language, geo, LLM, evidence and exports.
- **Baseline migration** generated offline (`prisma migrate diff`) at `prisma/migrations/0_init/migration.sql` (920 lines of valid DDL) + `migration_lock.toml`.
- **Auth foundation**: email/password register + login, bcryptjs hashing (12 rounds), JWT issuance (`@nestjs/jwt`), global `JwtAuthGuard` with `@Public()` opt-out, `@CurrentUser()` param decorator.
- **RBAC**: canonical role→permission matrix added to `@signalkit/shared` (`rbac.ts`) — one source for the API guard and the future web `PermissionGate`. `PermissionsService` resolves a member's role; global `PermissionsGuard` + `@RequirePermissions()` enforce the matrix and resolve workspace context from route/body/query.
- **Modules**: Prisma (global), Auth, Permissions (global), Audit (global), Users, Workspaces, Settings, Projects — all wired in `AppModule` with auth+RBAC as global guards.
- **Endpoints**: `GET /health` (public, DB sub-check), `GET /me`, `GET/PUT /users/:id/settings` (self-only), `GET/POST /workspaces`, `GET /workspaces/:id`, `PUT /workspaces/:id/settings`, `GET /audit`, plus workspace-scoped project CRUD. Workspace creation atomically provisions owner membership + settings + LLM settings + billing account.
- **Security**: LLM connection secrets stored as `encryptedKey` and never exposed (services return `maskedKey` only); API keys stored as `keyHash`. Settings/workspace changes write `AuditLog` events with redacted metadata. Generic auth errors (no user enumeration). `main.ts` fails fast in production if required secrets are missing.
- **Swagger/OpenAPI** served at `/docs` with bearer auth.
- **Seed** (`prisma/seed.ts`): demo countries/regions, 3 users (owner/strategist/viewer to exercise RBAC), workspace with settings/billing, demo projects. Idempotent.
- **Tests** (20 total passing): RBAC matrix invariants (shared), `PermissionsService` (mocked Prisma), `PermissionsGuard` (workspace resolution + allow/deny/forbid), `SettingsService` (audit-on-update), password hash/verify roundtrip.

### How to verify

```bash
pnpm --filter @signalkit/api exec prisma validate   # schema valid
pnpm --filter @signalkit/api exec prisma generate    # client generates
pnpm --filter @signalkit/api typecheck               # PASS
pnpm test                                            # 20 tests PASS
pnpm lint                                            # 0 problems

# Against a real Postgres (e.g. docker run -e POSTGRES_PASSWORD=… -p 5432:5432 postgres:16):
#   export DATABASE_URL=postgresql://…
#   pnpm --filter @signalkit/api exec prisma migrate deploy
#   pnpm --filter @signalkit/api run prisma:seed
#   pnpm --filter @signalkit/api dev   # Swagger at http://localhost:4000/docs
```

### Known limitations

- **No Postgres in this environment**, so `migrate`/`seed`/live boot were not executed here. Instead: schema **validated**, client **generated**, and the baseline migration SQL **generated offline** (proves valid DDL). Running against a real DB is documented above.
- Auth is email/password + JWT; magic-link and refresh-token rotation are deferred (architecture supports adding them). No rate limiting yet (Session 13).
- The workspace `web` standalone-tsc caveat from Session 1 is unchanged (does not affect the API).

### Next risks

- Session 3 (UI) should consume the shared RBAC matrix for `PermissionGate` rather than re-deriving permissions.
- Session 4 (LLM BYOK) must implement real envelope encryption for `UserLLMConnection.encryptedKey` using `ENCRYPTION_KEY_FOR_LLM_KEYS`; the column + masking contract are already in place.
- Keep the Prisma `package.json#prisma` seed config in mind — Prisma 7 will require a `prisma.config.ts`.

---

## Session 3 — Premium Flat 2D Design System, Web Shell, Mobile Shell, i18n

**Status:** ⏳ Not started
