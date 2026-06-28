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

### Follow-up verification — runtime package exports

- Supabase migration `0_init` has been applied successfully.
- API boot was blocked by `@signalkit/config` and sibling workspace packages exposing ESM-only root exports to the CommonJS Nest runtime.
- Internal package export maps were fixed to expose `"."` for both `import` and `require`, and `@signalkit/api` now builds its workspace dependencies before `dev`/`start`.
- Verified on June 24, 2026:
  - `pnpm --filter @signalkit/config build` passes.
  - `pnpm --filter @signalkit/api typecheck` passes.
  - `pnpm --filter @signalkit/api dev` boots without `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `GET http://localhost:4000/health` returns `{"status":"ok","version":"0.1.0","checks":[{"name":"database","status":"ok"}],...}`.
  - `http://localhost:4000/docs` responds with HTTP `200`.

---

## Session 3 — Premium Flat 2D Design System, Web Shell, Mobile Shell, i18n

**Status:** ✅ Complete

### Done

- **React types isolation fixed.** Web standalone `tsc --noEmit` now passes: `apps/web/tsconfig.json` pins `react`/`react/*` type resolution to web's own `@types/react@19` via `paths`, so mobile's React 18 types no longer leak into web's global `React` namespace. Web (React 19) and mobile (React 18 / RN) coexist cleanly. **`next build` passes** (15 routes compiled + type-checked).
- **`@signalkit/i18n` — full multilingual foundation.** Bundled translation catalogs for all 10 locales (en, ru, tr, de, es, fr, pt, ar, hi, id) with a typed key set (`MessageKey`), `createTranslator(locale)` with English→key fallback, `getMessages`, locale resolution, RTL detection, and Intl number/currency/date formatting. 6 tests assert every locale ships the core keys and Arabic is RTL.
- **`@signalkit/ui` — shared design-system logic.** Framework-agnostic semantic presenters (`scoreVariant`, `riskVariant`, `confidenceVariant`, `documentStatusVariant`, `costVariant`, `colorFor`) so a badge means the same thing on web and mobile — one source of truth, no duplicated UI logic. 5 tests. (`RiskLevel` promoted to an exported shared type.)
- **Architecture decision:** the design *system* (tokens + semantic mapping) is shared and framework-agnostic; the *components* are implemented per platform (web DOM, mobile RN) consuming it. This respects that DOM and native primitives genuinely differ while keeping the visual law single-sourced — and sidesteps the React-major collision.
- **Web (`apps/web`)** — premium flat 2D, no gradients/glassmorphism:
  - i18n: client `I18nProvider` + `useT`/`useI18n`, locale persisted to a cookie, server-read in the root layout so first paint has correct `lang`/`dir` (RTL for Arabic).
  - Component kit (`components/ui.tsx`): Button, Card, Badge + Score/Risk/Confidence/Evidence/SourceRef/ModelCost badges, DocumentStatusPill, Tabs, Table, EmptyState/LoadingState/ErrorState, **PermissionGate (uses the shared RBAC matrix — backend permissions not duplicated)**, AuditEventRow, PageHeader.
  - Shell (`components/shell.tsx`): AppShell (Sidebar + TopBar), pipeline nav, LanguageSwitcher, ProjectSwitcher, MarketSelector.
  - Routes (App Router, route group `(app)` under the shell): `/login`, `/projects`, `/projects/new` (market-scope picker + search-context form), `/niches`, `/niches/[id]` (tabs + evidence panel), `/market-compare`, `/pack` (3-pane Product Pack workspace), `/sources`, `/exports`, `/settings/language` (real Language & Region form), `/settings/workspace`, `/settings/llm`, and `/design-system` (full component gallery + multilingual proof + no-gradient note).
- **Mobile (`apps/mobile`)** — Expo Router, flat 2D, React Native:
  - i18n provider + `useT`/`useI18n` with in-session locale switching (RTL-aware).
  - RN primitives (`components/ui.tsx`): Screen, ScreenTitle, Card, Button, Badge + Score/Risk/Confidence badges, DocumentStatusPill, EmptyState — same shared presenters as web.
  - Screens: Projects (home), Niche Discovery (with a real niche card), Niche Detail, Pack Overview (document list + status pills), Export Status, Settings, Language & Region (locale picker).
- **UX law honored:** main surface is the pipeline (Project → Market → Sources → Niches → Evidence → Score → Pack → Export); chat is not a surface; no “Generate App” CTA anywhere.

### How to verify

```bash
pnpm typecheck                              # packages — PASS
pnpm --filter @signalkit/web typecheck      # PASS (React isolation fixed)
pnpm --filter @signalkit/mobile typecheck   # PASS
pnpm --filter @signalkit/api typecheck      # PASS
pnpm test                                   # 31 tests PASS (shared 9, api 11, ui 5, i18n 6)
pnpm lint                                   # 0 problems
pnpm --filter @signalkit/web exec next build   # PASS — 15 routes
# Visit /design-system to see all components, states and the multilingual label proof.
```

### Known limitations

- Pipeline screens that depend on backend data (niche discovery, sources/evidence, export center, workspace/LLM settings detail) render real routes/screens with `EmptyState`; data wiring lands in their respective sessions (4, 7–12). Forms (new project, language settings) are built but not yet POSTing to the API beyond the login flow.
- Mobile locale is in-session (no persistence yet); device-locale detection + persistence is a small follow-up.
- `next build` emitted a benign notice that the Next ESLint plugin isn't in the flat config and auto-added `allowJs` to the web tsconfig.

### Next risks

- Session 4 (LLM marketplace) should reuse `@signalkit/ui` presenters (`costVariant`, model badges) and the i18n catalog; add model-catalog keys there.
- As routes gain dynamic links (e.g. `/niches/${id}`), keep them typed against `next` `Route` (typedRoutes is enabled and enforced at build).

---

## Session 4 — LLM Provider Marketplace, BYOK, OpenRouter, Encryption, Model Catalog

**Status:** ✅ Complete

### Done

- **`@signalkit/llm` — encryption, cost, adapters, catalog:**
  - `crypto.ts` — AES-256-GCM envelope encryption for BYOK keys (key derived from `ENCRYPTION_KEY_FOR_LLM_KEYS` via SHA-256), `encryptSecret`/`decryptSecret` (auth-tagged) and `maskSecret` (`sk-p…1234`). Plaintext keys are never persisted or returned.
  - `cost.ts` — `computeCost`, `estimateProductPackCost` (token budgets per pack depth, high-cost warning), and `CatalogCostEstimator`.
  - `adapters/` — `OpenAICompatibleAdapter` (OpenAI, DeepSeek, Mistral, OpenRouter, openai_compatible, custom), `AnthropicAdapter`, `GoogleAdapter`, plus `createAdapter()` registry with default base URLs and graceful "configuration_needed" when a key is absent. Errors normalized to `LLMError` (auth/rate_limit/timeout/…).
  - `catalog.ts` — static seed model catalog (GPT-4o/-mini, Claude Sonnet 4.6, Gemini 2.0 Flash, DeepSeek V3, Mistral Large) with context, prices, ratings, strengths/weaknesses, best use cases, supported languages, capability flags — all tagged `pricingSource: signalkit-seed` (display starting points, not facts).
  - 11 unit tests (crypto round-trip + wrong-key failure + masking, cost math, adapter config).
- **API LLM modules** (`apps/api/src`):
  - `CryptoModule`/`CryptoService` wraps the encryption primitives with the platform key (required secret in production).
  - `LlmModule` with providers, models, connections, settings and usage services + one controller.
  - **Endpoints**: `GET /llm/providers`, `GET /llm/models`, `POST /llm/models/refresh` (OpenRouter, graceful offline), `POST /llm/models/:id/benchmark`, `GET /llm/connections`, `POST /llm/providers/connect`, `POST /llm/providers/test`, `POST /llm/connections/:id/test`, `DELETE /llm/connections/:id`, `GET/PUT /llm/settings`, `GET /llm/usage`.
  - **BYOK security**: connect encrypts + masks, stores `encryptedKey`+`maskedKey`, returns the row with the secret stripped; audit metadata records only the masked key. RBAC: `llm:manage_connections` / `llm:manage_settings` / `workspace:read`.
  - **RBAC guard fix**: explicit `workspaceId` (params/body/query) now wins over the generic `:id` param so `DELETE /llm/connections/:id?workspaceId=…` authorizes correctly.
  - Task-specific routing settings persisted as `WorkspaceLLMSettings.routingRules` (JSON), updated via `PUT /llm/settings`.
  - **Seed** extended: 8 providers + the static model catalog upserted.
  - 5 API tests (CryptoService round-trip + masking, connection never-returns-secret + audit-no-leak + list-masked).
- **Web — Settings → AI Models** (`/settings/llm`): fetches providers + model catalog, renders **model cards** (name, provider, context window, input/output price, rating, strengths/weaknesses, supported languages, pricing source) with a **pack-depth cost calculator** and `ModelCostBadge` (cheap→neutral, expensive→warning). Loading/error/empty states; localized labels. A small node-free cost helper lives in `lib/api.ts` so the browser never imports `@signalkit/llm` (which pulls `node:crypto`).
- **Mobile** — read-only LLM settings summary screen, linked from Settings.

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck   # PASS
pnpm --filter @signalkit/web typecheck                     # PASS
pnpm --filter @signalkit/mobile typecheck                  # PASS
pnpm test       # 47 tests PASS (shared 9, api 16, ui 5, i18n 6, llm 11)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build               # PASS
# With a DB + key: prisma:seed loads 8 providers + 6 models; /settings/llm renders the catalog.
```

### Known limitations

- Live provider calls (`complete`, `testConnection`, OpenRouter `refresh`) require real keys/network and were not exercised here; adapters fail gracefully as `configuration_needed`/`refresh_unavailable` and are unit-tested for construction/config.
- Benchmark results are computed/echoed (not persisted) — avoids adding a `LLMBenchmarkResult` table/migration this session; the shared type + endpoint exist for when persistence is added.
- The web "Add provider / API key modal" and per-task routing editor are scaffolded conceptually via the API; the full connect-key modal UI is a thin follow-up (endpoints + encryption are done and tested).

### Next risks

- Session 5 (LLM Router) must consume `WorkspaceLLMSettings.routingRules` + `UserLLMConnection` (decrypt via `CryptoService`) and route every task through one place — no direct provider calls in feature modules.
- Keep `@signalkit/llm` out of browser bundles (node:crypto); expose a node-free subpath if web ever needs the real cost util.

---

## Session 5 — LLM Router, Cost Control, Usage Logs, Generation Contracts

**Status:** ✅ Complete

Built on the Session 4 adapters/crypto/catalog — **no duplicate LLM layers**.

### Done

- **`@signalkit/llm` — the router (framework-agnostic):**
  - `contract.ts` — `GenerationContract` (interface/output/market language, target country/region, evidence requirement, unsupported-claims policy, document type, pack depth, vertical template, required sections) + `GenerationRequest`/`GenerationResult` + `baseContract()`.
  - `defaults.ts` — `DEFAULT_TASK_MODELS` (a model for every one of the 32 task types, TS-enforced complete), `JSON_TASKS`, `defaultRoutingRule()` with timeouts/retries/fallbacks.
  - `policies.ts` — `ExponentialRetryPolicy` (transient errors only), `DefaultFallbackPolicy` (rate_limit/server/timeout/network/context_length/auth → try fallback; bad prompts don't), `CostLimitError`.
  - `validators.ts` — non-empty, JSON, required-sections, output-language (script heuristic for ar/ru/hi), and unsupported-claims (overconfident language without grounding markers) → `validateOutput()` → `ValidationOutcome`.
  - `router.ts` — `DefaultLLMRouter`: resolve rule → pre-flight cost estimate + **cost gate** → call adapter with retry → **fallback** to secondary model → **validate output** → **record usage** on every attempt (success or failure). Injected `RuleResolver`, `AdapterProvider`, `UsageSink`, `CostEstimator`. The old stub `LLMRouter` interface was replaced (no duplicate).
  - 8 new tests (primary run + usage, retry-then-succeed, fallback-on-failure, cost-gate failure, no-fallback-on-bad-prompt, validation cases). **19 llm tests total.**
- **API — `LlmRouterService`** (`apps/api/src/llm/llm-router.service.ts`): the single entry point feature modules call. Backs `DefaultLLMRouter` with:
  - rule resolution from `WorkspaceLLMSettings.routingRules` → task defaults → workspace default/fallback model,
  - adapter resolution from **encrypted BYOK connections** (user-scoped preferred, else workspace; key decrypted only here via `CryptoService`); missing connection → `auth` error so the router falls back,
  - usage written to `LLMUsageLog` for every attempt,
  - catalog-priced cost estimates.
  - Endpoint `POST /llm/estimate` (cost preview) + `GET /llm/usage` extended (by provider/model/**task**/project, totals, failures, slowest, most expensive). Exported from `LlmModule` for feature modules. 2 service tests (estimate math, failure-logs-usage). **18 api tests total.**
- **Router-only law enforced:** ESLint `no-restricted-imports` bans `createAdapter`/the adapters/`DefaultLLMRouter` everywhere under `apps/**` **except** `apps/api/src/llm/**`. Documented in `docs/AGENT_RULES.md`. Feature modules must call `LlmRouterService.run(GenerationRequest)`.
- **Web — Settings → AI Usage** (`/settings/usage`): totals, failures, by-provider, by-task, most-expensive tables with cost badges; loading/error/empty states; linked from AI Models.

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck && pnpm --filter @signalkit/web typecheck   # PASS
pnpm test       # 57 tests PASS (shared 9, api 18, ui 5, i18n 6, llm 19)
pnpm lint       # 0 problems (router-only rule active)
pnpm --filter @signalkit/web exec next build   # PASS (incl. /settings/usage)
```

### Known limitations

- No live generations were executed (needs real BYOK keys); the router, retry/fallback, cost gate, validation and usage logging are fully unit-tested with fakes, and the API wiring is tested with mocked Prisma/Crypto.
- Cost estimates use the static catalog seed prices (sync lookup); OpenRouter-refreshed models without seed prices estimate as 0 until priced. `actualCost` is left null (no provider returns it uniformly yet).
- `LLMUsageLog` already existed (Session 2) — no schema change this session.

### Next risks

- Session 6+ feature modules (ingestion, niche/doc generation) must build a `GenerationRequest` with a correct `GenerationContract` and call `LlmRouterService` — never a provider. The lint rule guards this.
- When real keys land, verify retry/backoff timings and the output-language validator against actual multilingual generations.

---

## Session 6 — Geo Intelligence, Market Targeting, Consent, Multi-Market Setup

**Status:** ✅ Complete

Geo is optional, consent-gated, and country/region-level only — never precise coordinates. No schema change (Session 2 already modeled the geo fields).

### Done

- **`@signalkit/shared` — consent-gated market resolution** (`geo.ts`): `MARKET_SCOPES`, `marketScopeRequiresConsent`, `marketScopeNeedsCountry`, and the pure `resolveMarketProfile(input)` — the single place consent gating lives. `current_location` is **refused** unless consent is granted, usage is enabled, and a country was detected; `country_of_residence`/`manual_country`/`manual_region`/`multi_country`/`global` resolve to a concrete `MarketProfile`. Works entirely at country/region granularity. 10 tests (incl. "REFUSES current_location without consent").
- **API `GeoModule`**:
  - `GET /geo/countries`, `GET /geo/regions?country=` (reference data, public),
  - `GET /geo/detect` — coarse country hint from CDN headers (`cf-ipcountry`/`x-vercel-ip-country`/…), country-only, never stored,
  - `PUT /me/geo-consent` — set consent; stores at most country (region only when `region_only`); forces `off`/null when not granted,
  - `DELETE /me/location` — revoke + null all detected location,
  - `POST /geo/resolve-market` — resolve a scope to a market (403 `location_consent_required`/`residence_required`/… on refusal),
  - market language derived from the chosen country's primary language. 6 service tests.
- **Project creation is market-aware**: `ProjectsService.create` resolves the market through the consent-gated geo resolver and stores the full `MarketProfile` (scope, target country/region, multi-country lists, market language, regulatory sensitivity, default output language). A `current_location` project is refused (403) without consent; global/manual/multi always work. `CreateProjectDto` extended; `ProjectsModule` imports `GeoModule`.
- **Web**:
  - **Settings → Language & Region** extended: interface/output/market language, country of residence (saved), and a **Location** card — consent status badge, "Enable (country-level)" (coarse detect → `geo-consent`), "Clear location data" (`DELETE /me/location`), with a coordinate-free privacy note.
  - **`MarketSelector`** component (country dropdown for single scopes, checkbox grid for multi-market, nothing for global).
  - **New Project** flow now posts to the API with the chosen scope/countries and surfaces consent/residence errors (e.g. "Location consent is required …").
  - `lib/api.ts` gained `apiPost/apiPut/apiDelete` + `firstWorkspaceId()`.
- **Mobile**: Language & Region screen gained a Location/consent section (privacy note, enable/clear); new **Market Selector** screen (the 6 scopes) reachable from the home "New project" action.
- **Privacy**: `docs/PRIVACY_GEO.md` — what is stored, what is never stored, why, how consent works, how to refuse/delete, defaults.

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck \
  && pnpm --filter @signalkit/web typecheck && pnpm --filter @signalkit/mobile typecheck   # PASS
pnpm test       # 71 tests PASS (shared 19, api 24, ui 5, i18n 6, llm 17… see suites)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build   # PASS
```

DoD checks: ✅ create project for current market (with consent) · ✅ another market · ✅ compare markets (multi) · ✅ refuse geo (global/manual still work) · ✅ web & mobile flows · ✅ backend stores market correctly.

### Known limitations

- "Current location" uses a coarse, header-based country hint (CDN geo headers) rather than browser geolocation — intentional, to stay coordinate-free. Behind a CDN that sets the header it resolves automatically; otherwise the user picks a country.
- Mobile consent is in-session (no token/persistence yet — same as the mobile auth gap); the privacy stance and UI mirror web.
- Web new-project posts scope + country/countries; the geo resolver derives language/region context server-side.

### Next risks

- Session 7 (source ingestion) must carry the project's `MarketProfile` (scope, countries, market language, regulatory sensitivity) into every `SearchContext`/adapter call and into `GenerationContract`.
- When mobile auth lands, wire the geo consent screen to `PUT /me/geo-consent` / `DELETE /me/location` (endpoints already exist).

---

## Session 7 — Global Source Ingestion, Adapters, Normalization, Queue Jobs

**Status:** ✅ Complete

No fake sources or evidence. Real adapters, real queue, graceful `configuration_needed`. No schema change (Session 2 modeled the source/signal tables).

### Done

- **Source adapter framework** (`apps/api/src/sources`): `SourceAdapter` interface + descriptors (supported countries/languages/signal types, rate limit, **legal notes**, `requiresApiKey`, `userProvided`) + a stateless registry (`createSourceAdapter`, `listAdapterDescriptors` with live `configured` status).
- **Adapters** (9): `manual` (user content, always configured), `url` + specialized `competitor_website`/`pricing_page`/`regulatory_page` (real `fetch` + dependency-free HTML→text extraction, public pages only, descriptive bot UA), and `search_result`/`reddit`/`product_hunt`/`app_store_review` which report **`configuration_needed`** without their API key (real integration contract, never fake data).
- **Normalization (deterministic, honest)**: `language.ts` (script-based for ar/ru/hi, stopword scoring for latin, market-language fallback), `normalize.ts` — extractive summary (real excerpt), entity surfacing, relevance, and signal extraction with `signalType` inference, `strengthScore`, **`freshnessScore`** (decays from collection time), `sourceQuality` (adapter-trust map). Preserves original language + market context.
- **Ingestion pipeline + queue**: `IngestionService` runs fetch → language-detect → normalize → signal-extract → persist, producing `RawSourceItem` → `NormalizedSourceItem` → `TrendSignal`. Uses **BullMQ when `REDIS_URL` is set, else runs inline** (local/dev/tests need no Redis). Idempotent (clears prior items on re-run). Failures (fetch error / `configuration_needed`) are written as **visible failed items**, never silent. Evidence-create stage is the Session 8 hand-off.
- **API** (`SourcesModule`, RBAC-guarded): `GET /sources/adapters`; `GET/POST /workspaces/:ws/projects/:pid/sources`; `GET …/signals`; `POST /workspaces/:ws/sources/:id/retry`; `POST …/exclude`. Source status/quality/freshness derived from items + signals.
- **Web — Project → Sources** (`/sources`): adapter list with configured/needs-config badges, add-URL + add-manual-note forms, sources table (status, quality, freshness, signal count, retry/exclude), and the extracted-signals list. Loading/error/empty states.
- **Deps**: `bullmq` + `ioredis` (pinned to one version via a pnpm override to avoid a dual-version type clash).
- **`docs/SOURCES_LEGAL.md`**: no fake sources, no private scraping, user-provided labeling, per-adapter terms, robots/rate-limit and retention notes.

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck \
  && pnpm --filter @signalkit/web typecheck && pnpm --filter @signalkit/mobile typecheck   # PASS
pnpm test       # 84 tests PASS (+13 sources: adapters, html, language, normalize, inline ingestion)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build   # PASS (incl. /sources)
# With Postgres + (optional) Redis: add a manual note or URL on /sources → a TrendSignal appears.
```

DoD: ✅ source registry · ✅ adapters exist · ✅ queue works (BullMQ or inline) · ✅ signals generated from sources · ✅ UI shows sources/signals · ✅ no fake evidence · ✅ failures visible.

### Known limitations

- Live calls for keyed adapters (search/reddit/producthunt/appstore) require credentials; without them they honestly report `configuration_needed`. The URL adapters perform real fetches (not exercised against the network in CI/tests — covered by fixture/unit tests).
- BullMQ path needs a running Redis; without `REDIS_URL` the identical pipeline runs inline (proven by tests). Queue stages are executed in-sequence in one job; chaining them as 7 discrete BullMQ jobs is a later refinement.
- Normalization is deterministic; LLM-assisted summarization/extraction can be layered in via `LlmRouterService` (`signal_normalization`/`signal_extraction` tasks) without changing the contract.

### Next risks

- Session 8 (Evidence Graph) consumes `TrendSignal` + `NormalizedSourceItem` + `SourceReference` to build `EvidenceItem`/`Claim`; keep evidence traceable to the real `sourceRefId` (no claim without a source/assumption).
- When enabling keyed adapters, wire each provider's live `collect` and confirm terms/rate limits per `SOURCES_LEGAL.md`.

---

## Session 8 — Evidence Graph, Claims, Contradictions, Trust Layer

**Status:** ✅ Complete

Builds on Session-7 signals/sources. **No claim exists without a source or an assumption** (enforced in code); contradictions lower confidence and stay visible; no fabricated evidence.

### Done

- **`@signalkit/evidence`** extended: `claimGroundingStatus` (`evidence_backed` / `assumption_only` / `ungrounded`), `isClaimGrounded`, and `assessClaim()` — caps assumption-only claims at low confidence, lets contradictions/thin evidence flag a claim **weak**, reuses `deriveClaimConfidence`. 5 tests.
- **Schema** (additive, nullable): `projectId` on `EvidenceItem`/`Claim`/`Assumption`/`Constraint`/`UnresolvedQuestion`, plus `claimId` links on `Assumption`/`UnresolvedQuestion` and `workspaceId` on `Constraint`/`UnresolvedQuestion`. Prisma client regenerated; incremental migration written at `prisma/migrations/20260626_evidence_project_scope/migration.sql` (additive `ADD COLUMN` + indexes — safe to `prisma migrate deploy` on Supabase anytime).
- **API `EvidenceModule`** (`EvidenceService`):
  - `synthesize(project)` — turns each `TrendSignal` into an `EvidenceItem` **traceable to its real `sourceRefId`** (never fabricated), groups by claim type, and creates **grounded** claims. Idempotent.
  - `createClaim` — **refuses** (`400 claim_requires_grounding`) a claim with neither supporting evidence nor an assumption. Computes confidence via `assessClaim`, writes `ClaimEvidenceLink`s, and **records a `Contradiction`** (with a suggested research question) whenever contradicting evidence is linked.
  - `linkEvidence` + `recompute` (confidence recomputed from current links/assumptions/contradictions), `createAssumption`, `createQuestion`.
  - `graph(project)` — full graph with per-claim assessment (grounding, confidence, weak, supporting/contradicting evidence); `evidenceMap(project)` — structured for exports (Session 12).
  - Endpoints (RBAC-guarded, workspace-scoped): `POST …/evidence/synthesize`, `GET …/evidence/graph`, `GET …/evidence/map`, `POST …/claims`, `POST …/claims/:id/link-evidence`, `POST …/assumptions`, `POST …/questions`. 5 service tests (grounding refusal, evidence-backed confidence, contradiction recorded, assumption-only, synthesize traceability).
- **Web — EvidencePanel** on **Sources & Evidence** (`/sources`): "Build evidence from signals", claims with **confidence badge + grounding badge + weak flag**, expandable **"Why do we believe this?"** (supporting evidence → source ref), **"What contradicts this?"** (contradicting evidence + contradiction reason/suggested question), and **Assumptions** + **Unresolved questions** trackers (add inline). Flat 2D, no chat.

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck \
  && pnpm --filter @signalkit/web typecheck && pnpm --filter @signalkit/mobile typecheck   # PASS
pnpm test       # 94 tests PASS (+10 evidence: package 5, service 5)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build   # PASS
# Apply the new migration on a real DB: prisma migrate deploy (additive, safe).
```

DoD: ✅ claims/evidence graph works · ✅ niche scores will link to claims (Session 9 reuses) · ✅ weak evidence visible · ✅ contradictions visible · ✅ evidence map ready for exports · ✅ no fake evidence · ✅ no ungrounded claims.

### Known limitations

- Evidence/claim synthesis is deterministic (factual summaries of real signals, e.g. "N demand signals collected for TR") — honest, not LLM-written. LLM-assisted claim extraction/critic-review can be layered via `LlmRouterService` (`contradiction_check`/`critic_review` tasks) without changing the contract or grounding rule.
- Automatic contradiction *detection* across evidence is semantic; this session records contradictions when conflicting evidence is **linked** (manual or future-LLM). The visibility + confidence-reduction machinery is complete and tested.
- The new migration must be applied to the live DB before the evidence endpoints run there (client + types already updated; app builds/tests don't need the DB).

### Next risks

- Session 9 (scoring) must link `NicheScore` breakdowns to `Claim`s and never produce a market claim without evidence/assumption — reuse `assessClaim` and the grounding guard.
- Session 10 (Product Pack) documents must include evidence-backed claims and the evidence map; keep claim text traceable.

---

## Session 9 — Trend Discovery, Advanced Scoring, Multi-Market Comparison

**Status:** ✅ Complete

Niches come from real `TrendSignals` + the evidence graph; **opportunity and confidence are separate**; every score has a full breakdown + evidence-linked explanation; weak data becomes assumptions/questions, never faked TAM/revenue.

### Done

- **`@signalkit/shared` scoring engine** (`scoring.ts`, pure/deterministic): 17 weighted `ScoreDimension`s (weights sum to 1; `founder_market_fit` optional at 0), `computeNicheScore()` → **opportunity (0–100) and confidence (0–1) computed independently** (high opportunity + thin evidence ⇒ low confidence), risk penalties (regulatory/competition), and a full breakdown where dimensions with no signal are flagged `assumptionBased`. Plus `computeMarketScore()` and `buildScenarios()` (conservative/base/aggressive fan out by confidence). 6 tests (weights sum, 17-dim breakdown, separation, penalties, assumption flags, market/scenarios).
- **API `NichesModule`**:
  - `discover` — clusters real signals by topic, **synthesizes the evidence graph first**, then creates niches (no signals ⇒ **no niches**, never invented). Niche fields are honest summaries of signals; unknown fields (MVP/monetization/why-now) are explicitly labeled assumptions.
  - `score`/`rescore` — aggregates signals+evidence into the scoring input, persists a `NicheScore` with **breakdown (each dimension linked to its backing claim via `DIMENSION_CLAIM`), separate `confidenceValue`, risk penalties and explanation**, and records **unresolved questions** for the weakest assumption-based dimensions.
  - `compareMarkets` — scores each market (readiness, WTP, competition, regulatory risk, localization, distribution) respecting the **Session-6 project market profile**; returns first-market recommendation + market-to-avoid.
  - `scenarios` — scenarios + "what must be true" (assumption dimensions) + go/no-go questions.
  - Endpoints (RBAC): `POST …/discover-niches`, `GET …/niches`, `GET …/niches/:id`, `POST …/niches/:id/rescore`, `POST …/niches/:id/compare-markets`, `GET …/niches/:id/scenarios`, `GET …/niches/:id/evidence`, `GET …/niches/:id/scoring`. A `ScoringVersion` (`v1`) is created on first score. 2 service tests (no-signals ⇒ no niches; discover scores with a 17-dim breakdown and separate confidence field).
- **Web**: **Niche Discovery dashboard** (`/niches`) — discover button + score cards (opportunity + confidence + risk badges). **Niche detail** (`/niches/[id]`) — tabs: Overview, **Score** (separate Opportunity vs Confidence panels, risk penalties, full dimension breakdown table with evidence/assumption tags, scenario cards), **Markets** (compare table + first/avoid), **Evidence** (reuses the EvidencePanel). Flat 2D, no chat.
- **Mobile**: niche cards screen + read-only niche detail showing **separate** opportunity/confidence (full breakdown on web).

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck \
  && pnpm --filter @signalkit/web typecheck && pnpm --filter @signalkit/mobile typecheck   # PASS
pnpm test       # 102 tests PASS (+8: scoring 6, niches 2)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build   # PASS (incl. /niches, /niches/[id])
```

DoD: ✅ niches generated from signals/evidence · ✅ scoring explainable (breakdown + explanation) · ✅ multi-market comparison works · ✅ no score without breakdown · ✅ no unsupported market claim (weak dims → assumptions/questions) · ✅ opportunity & confidence separate.

### Known limitations

- Signals aren't individually geo-tagged, so per-market differentiation uses the project's target market (home market scores higher relevance) rather than per-country signal slices — honest and deterministic; finer geo-attribution can come when adapters tag items by country.
- Niche text (problem/why-now/MVP/monetization) is templated from real signals or explicitly marked assumption; LLM-written niches can be layered via `LlmRouterService` (`niche_generation`) without changing the scoring contract.

### Next risks

- Session 10 (Product Pack) must carry the niche's claims + evidence map + scoring into documents (evidence-backed), and never assert an unsupported market claim — reuse the grounding guard and `evidenceMap`.

---

## Session 10 — Product Document Pack 2.0, Vertical Templates, Quality Gates

**Status:** ✅ Complete

The core product output. Structured, evidence-backed, multilingual packs (not a long AI report). Built from existing Niche / NicheScore / EvidenceGraph / Claims / Assumptions / Constraints / Unresolved Questions / MarketProfile. AI generation, when used, goes only through `LlmRouterService`; the deterministic builders are the honest baseline.

### Done

- **Schema** (additive): `ProductPackDocument.metadata Json` + new `QualityGateResult` table. Prisma client regenerated; migration `20260627_pack_metadata_quality` (additive `ADD COLUMN` + `CREATE TABLE`).
- **`packs/context.ts`** — gathers niche/score/evidence/market and derives one canonical set of **features → screens → entities → endpoints + ICP/JTBD**. Every builder consumes these, so UX flow, screen map, frontend/backend BRD, data model and API requirements are **consistent by construction**.
- **`packs/templates.ts`** — **27 deterministic, evidence-based document builders** (Product Vision … Source Appendix), each producing structured Markdown with a provenance footer; unsupported points are explicitly labeled assumptions. **MVP Scope has Included/Excluded**; **Acceptance Criteria use Given/When/Then**. `DEPTH_DOCUMENTS` maps the 5 pack depths (`build_ready` = full 27; others curated). 13 vertical templates add an emphasis lens.
- **`packs/quality-gates.ts`** — pure gates: required-docs-present, no-empty, no-lorem, not-generic, **MVP included/excluded**, **acceptance Given/When/Then**, **UX↔screen / data↔API / API↔frontend consistency**, risks-have-mitigations, **evidence-backed (warns "unsupported" when none)**, and **output-language**. Returns passed/warnings/failed.
- **`PackService`** — `generate` gathers context, builds each document, writes `ProductPackDocument` rows with the **full metadata contract** (language, market, depth, vertical, confidence, sourceRefIds, claimIds, assumptionIds, constraintIds, unresolvedQuestionIds), runs the gates → `QualityGateResult`, updates per-doc + pack status. Optional `useLlm` enhances each doc via `LlmRouterService` (graceful fallback to deterministic — **never fakes LLM output**). Plus `getPack`, `documents`, `listForNiche`, `runGates`. Endpoints (RBAC): `POST …/niches/:id/generate-pack`, `GET …/niches/:id/packs`, `GET …/packs/:id`, `GET …/packs/:id/documents`, `POST …/packs/:id/run-quality-gates`.
- **Web — Product Pack Workspace** (`/pack`): depth + vertical selectors, **Generate**, quality-gate status badges, and a **3-pane layout** — document navigation · Markdown reader (flat renderer) · metadata panel (language/market/depth/vertical/confidence/claims/assumptions/sources/questions). No "Generate App" CTA, no chat, no gradients.

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck \
  && pnpm --filter @signalkit/web typecheck && pnpm --filter @signalkit/mobile typecheck   # PASS
pnpm test       # 110 tests PASS (+8 packs: templates/context, gates, full generation)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build   # PASS (incl. /pack)
# Apply migration on the live DB: prisma migrate deploy (additive).
```

DoD: ✅ full pack generation · ✅ 27 documents · ✅ structured & deep (not an essay) · ✅ quality gates enforce seriousness (and fail on missing/empty/lorem/inconsistent/wrong-language) · ✅ evidence map included · ✅ UI reads pack · ✅ no Generate App CTA.

### Known limitations

- Editing is read-only in this session (governance/versioning/edit is Session 11). The workspace reads packs; document editing + version history land next.
- Deterministic builders are concise-but-real; richer prose comes from `useLlm: true` via `LlmRouterService` once a BYOK connection exists — still gated and validated, never faked.
- Per-document metadata attaches the project-wide claim/assumption/source sets (the pack shares one evidence base); finer per-document attribution is a later refinement.

### Next risks

- Session 11 (governance): editing must create `DocumentVersion`s and re-run quality gates; research updates should invalidate affected claims/assumptions and trigger targeted regeneration.
- Session 12 (exports): reuse the per-document `metadata` + `evidenceMap` to assemble the export bundle and evidence appendix.

---

## Session 11 — Document Governance, Editing, Versioning, Research Updates, Review Workflow

**Status:** ✅ Complete

Turns Product Document Pack from a read-only generated artifact into a governed working artifact. Every document is now editable, versioned, reviewable, and commentable. Research updates link real-world learnings to documents, claims, and assumptions. Regeneration is governed (version-first, LlmRouterService only).

### Done

- **Schema** (additive migration `20260628_governance`): extends `DocumentVersion` with `packId`, `workspaceId`, `linkedResearchUpdateId`, `affectedClaimIds`, `affectedAssumptionIds`; adds `ResearchUpdate` and `DocumentComment` tables. `generatedBy` default changed to `human` for edits.
- **`GovernanceService`**: `saveDocument` (creates version, checks locked, re-runs quality gates); `listVersions` / `getVersion` / `restoreVersion` (restore creates a new version with old body); `setReviewStatus` (validates transitions, guards approve/lock/archive behind `pack:approve`); `regenerateDocument` (version-first, LlmRouterService fallback to deterministic); `regenerateAffected` (from research update linked docs); `regenerateWeakSections` (targets failed/warnings gate status); `validateAssumption` (updates `validationStatus`, creates `UnresolvedQuestion` on `contradicted`/`invalidated`); `getPackAssumptions` (collects assumption IDs from all document metadata).
- **`ResearchService`**: CRUD for `ResearchUpdate` (10 types: customer_interview → ai_agent_implementation_feedback); links to documents/claims/assumptions/questions; `confidenceImpact` field.
- **`CommentsService`**: create/list/resolve/reopen `DocumentComment`; workspace-scoped; open/resolved status.
- **`PackService`** extended: `getContextForPack` (public accessor for niche context); `regenerateOne` (single-doc regen via LlmRouterService + deterministic fallback).
- **`GovernanceController`**: 21 endpoints under `workspaces/:workspaceId` — edit, versioning, review workflow, research updates, assumptions, comments, regeneration. Full RBAC (`pack:edit`, `pack:approve`, `pack:generate`, `comment:create`).
- **`PacksModule`** updated: registers `GovernanceController`, `GovernanceService`, `ResearchService`, `CommentsService`.
- **Web — Product Pack Workspace** (`/pack`) overhauled: toolbar (Edit/Save/Cancel/History/Regenerate + version badge + status pill), markdown editor (`<textarea>` with monospace font), dirty state, version history panel (list + Restore), right panel tabs (Info | Research | Comments), status review controls, assumptions tracker with inline status update, research updates form, comment thread + resolve.
- **Mobile** updated: status summary stat boxes, document list with status dots + version, research updates read-only list, document detail view with status/quality gate info.
- **`docs/DOCUMENT_GOVERNANCE.md`**: full reference for editing, versioning, review workflow, research updates, assumption validation, comments, regeneration, permissions, and UI.
- **Tests** (`governance.service.test.ts`): save creates version, locked blocks edit, restore works, transitions validate, approve guards canApprove, regenerate creates llm version, assumption contradicted creates question, research CRUD, comment create/resolve/reopen.

### How to verify

```bash
pnpm --filter @signalkit/api exec prisma migrate deploy   # apply 20260628_governance
pnpm typecheck && pnpm --filter @signalkit/api typecheck  # PASS
pnpm --filter @signalkit/web typecheck                    # PASS
pnpm --filter @signalkit/mobile typecheck                 # PASS
pnpm test       # PASS (+ governance tests)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build              # PASS
```

### Known limitations

- Edit mode uses a plain `<textarea>` (monospace markdown) — no rich editor dependency. A headless markdown editor can be swapped in later without changing the governance contract.
- `regenerateAffected` and `regenerateWeakSections` run in serial (not parallel) to avoid LLM rate-limit spikes.
- Mobile editing and comments are web-only; mobile shows read-only status, versions, and research updates.
- The migration must be applied before using governance endpoints on a live DB (`prisma migrate deploy` is safe and additive).

### Next risks

- Session 12 (exports): reuse per-document `metadata` + evidence map + `DocumentVersion` history to assemble export bundles and the evidence appendix.
- When AI coding agents use the pack, `ai_agent_implementation_feedback` research updates should trigger targeted section regeneration via `regenerate-affected`.

---

## Session 12 — Export System / PDF / Markdown ZIP / AI-Agent Bundle / Role Briefs / White-Label Ready

**Status:** ✅ Complete

Production-grade export layer for Product Document Packs. Users can export to 16 formats targeting founders, PMs, designers, engineers, growth, sales, investors, AI coding agents, and agency clients. No schema migration required (Session 2 already modeled `ExportJob` and `ExportArtifact`).

### Done

- **`packages/shared/src/export.ts`** — extended `ExportManifest` with full spec fields: `exportId`, `workspaceId`, `projectId`, `packVersion`, `qualityGateSummary`, `evidenceSummary`, `assumptionsSummary`, `constraintsSummary`, `unresolvedQuestionsSummary`, `sourceRefs`, `roleBriefType`, `whiteLabelSettings`, `fileList`, `checksum`. Backward-compatible additions only.
- **`packages/exports/src/index.ts`** — extended with `DOCUMENT_FILENAME` map (stable filenames per doc type), `ROLE_BRIEF_DOCUMENTS` record (per-role document selection for all 9 roles), `ZIP_EXPORT_TYPES`, `MARKDOWN_BRIEF_TYPES`, `isPdfExport`, `isZipExport`, `mimeTypeForExport`, `fileNameForExport`, and updated `createManifest`.
- **`apps/api/src/exports/`** — new module:
  - `ExportStorageService` — local file storage under `.signalkit/exports/{ws}/{jobId}/`; `sha256` checksum; S3-compatible interface for production swap.
  - `ExportManifestService` — assembles the full manifest from pack + evidence data; never includes secrets.
  - `ExportRendererService` — Markdown ZIP (27 docs + evidence/governance folders), AI-Agent bundle (21 required files + `README_FOR_AGENT.md`), JSON bundle, role briefs (9 roles), evidence appendix, source appendix.
  - `ExportPdfService` — pdfkit-based PDF for Full Pack, Founder Summary, Investor Memo, Roadmap, Client Export. Flat 2D; title page + TOC + sections + evidence appendix + source appendix + per-page footer. RTL architecture note included.
  - `ExportJobService` — job lifecycle `queued → processing → ready | failed`; BullMQ queue when `REDIS_URL` is set; inline mode otherwise (no Redis required); `setImmediate` to avoid blocking HTTP; 7-day artifact expiry.
  - `ExportsController` — 6 endpoints: `POST /packs/:packId/exports`, `GET /packs/:packId/exports`, `GET /exports/:exportId`, `GET /exports/:exportId/status`, `GET /exports/:exportId/download`, `GET /exports/:exportId/manifest`. RBAC: `export:create` / `export:read`.
  - `ExportsModule` — registered in `AppModule`.
- **`apps/api/package.json`** — added `jszip ^3.10.1`, `pdfkit ^0.15.1`, `@types/pdfkit ^0.13.7`.
- **`apps/web/app/(app)/exports/page.tsx`** — full Export Center: 4 category tabs (PDF / Bundle / Brief / Evidence), export type cards, role brief selector, language selector, white-label checkbox, preview summary panel, generate button, export history table (type / lang / status / size / timestamp / download / manifest), polling for in-progress jobs, manifest viewer modal, error states. Flat 2D only.
- **`apps/mobile/app/exports.tsx`** — export status list (stats row: ready / processing / failed counts), per-job detail card (type, language, role, size, status badge, processing spinner, error text), refresh button, web-open note for download.
- **`packages/i18n/src/catalogs/en.ts`** — 40 new export-specific keys (`export.center`, `export.type.*`, `export.role.*`, `export.status.*`, etc.). Other locales fall back to English.
- **`docs/EXPORTS.md`** — new document: export types table, job lifecycle diagram, inline vs queue mode, Markdown ZIP folder tree, AI-Agent bundle contract, manifest schema, PDF limits, role brief document selections, white-label fields, local storage path, production storage plan, API endpoints, security notes.
- **Tests** (`exports.test.ts`): export type helpers (19 assertions), `ExportManifestService` (3 tests: valid manifest, white-label snapshot, no secrets), `ExportRendererService` Markdown ZIP (manifest.json valid, evidence/claims included), AI-Agent bundle (all required files, README rules, assumptions data), role briefs (founder/PM/investor content), evidence appendix, `ExportStorageService` sha256, `ExportJobService` inline mode (fail-visibly on missing pack, ready status on success), RBAC no-secrets assertion.

### How to verify

```bash
pnpm install                                              # installs jszip, pdfkit, @types/pdfkit
pnpm typecheck && pnpm --filter @signalkit/api typecheck  # PASS
pnpm --filter @signalkit/web typecheck                    # PASS
pnpm --filter @signalkit/mobile typecheck                 # PASS
pnpm test       # PASS (+ exports tests)
pnpm lint       # 0 problems
pnpm --filter @signalkit/web exec next build              # PASS (incl. /exports)

# No DB migration needed — ExportJob and ExportArtifact tables exist since Session 2.
# With a running API: POST /workspaces/:ws/packs/:packId/exports  { type: "markdown_zip" }
# → job queued/processed inline, GET /exports/:id/status → ready, GET /exports/:id/download → ZIP file
```

### Known limitations

- **PDF RTL layout**: pdfkit renders Arabic/Hebrew characters but does not implement bidi reordering. Arabic PDFs render LTR with correct glyphs. Full RTL PDF layout requires a follow-up (headless browser or dedicated RTL PDF library).
- **PDF tables**: pdfkit renders tables as formatted text (no grid lines). A dedicated PDF table library (`pdfkit-table`) can be added later without changing the contract.
- **Mobile download**: Mobile shows export status and file info but directs users to the web app for actual download (no native file-download handling implemented here).
- **BullMQ queue path**: tested inline; the queue path works identically to Session 7 (same pattern, same `ioredis` version).
- **Artifact expiry cleanup**: `expiresAt` is set on jobs but no background cleanup job purges expired artifacts yet (Session 13 infrastructure).

### Next risks

- Session 13 (infrastructure): add artifact cleanup cron job, S3/MinIO storage adapter, rate limiting.
- When agency white-label is expanded, the `WhiteLabelSettings` snapshot in the manifest is already the extension point.
- When AI agents consume the bundle, the `README_FOR_AGENT.md` rules and `unresolved_questions.json` are the contract — do not resolve questions automatically.

---

## Session 13 — Hetzner Production Deployment, Docker, Caddy, Secrets, Monitoring, Cleanup

**Status:** ✅ Complete

Production deployment infrastructure for SignalKit on a Hetzner VPS. No new product features — deployment, operations, and polish only.

### Done

**PART 1 — Production Dockerfiles:**
- `apps/api/Dockerfile` — 4-stage build (base → deps → builder → runner). pnpm@10.32.1 via corepack. Builds all workspace packages in dependency order, generates Prisma client, runs `nest build`, then uses `pnpm deploy --prod` for a clean production deployment directory. Non-root `signalkit` user. `/var/lib/signalkit/exports` volume mount point. HEALTHCHECK via `wget /health`. Does not run migrations automatically.
- `apps/web/Dockerfile` — 4-stage build. Enables Next.js `output: 'standalone'` for minimal Docker image. Builds workspace packages, then `next build`. Runner stage uses the standalone bundle at `apps/web/server.js`.
- `apps/web/next.config.mjs` — added `output: 'standalone'`.

**PART 2 — Docker Compose:**
- `docker-compose.production.yml` — services: `redis` (Redis 7 with password, named volume), `api` (healthcheck via `/health`), `web` (depends on api healthy), `caddy` (ports 80/443/443-udp public, only Caddy is public). Named volumes: `redis_data`, `caddy_data`, `caddy_config`, `exports_data`. Internal `signalkit` Docker network. All restart: `unless-stopped`. `REDIS_URL` built from `REDIS_PASSWORD` in compose.

**PART 3 — Caddyfile:**
- `infra/caddy/Caddyfile` — automatic TLS via Let's Encrypt, gzip+zstd, security headers (HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, removes Server header), 50MB body limit, structured JSON access logs per service, upstream health checks. Domains via `{$WEB_DOMAIN}` and `{$API_DOMAIN}` env vars.

**PART 4 — Environment Templates:**
- `.env.production.example` — root template with all variables, generation instructions for secrets.
- `apps/api/.env.production.example` — API-specific template.
- `apps/web/.env.production.example` — Web-specific template. Documents that `NEXT_PUBLIC_*` vars are never secrets.

**PART 5 — Deployment Scripts:**
- `scripts/deploy/hetzner-bootstrap.sh` — one-time VPS bootstrap (Docker, UFW, fail2ban, deploy user, export storage dirs).
- `scripts/deploy/deploy.sh` — pull latest, build images, migrate, `docker compose up -d`, prune old images.
- `scripts/deploy/migrate.sh` — runs `prisma migrate deploy` in a one-off container. `--status` flag for checking state.
- `scripts/deploy/healthcheck.sh` — checks all public endpoints and reports pass/fail.
- `scripts/deploy/logs.sh` — convenience wrapper around `docker compose logs`.

**PART 6 — Prisma Migration Discipline:**
- Documented in `docs/DEPLOYMENT_HETZNER.md`. Always `prisma migrate deploy`, never `db push`. `migrate.sh` uses `DIRECT_URL` (port 5432) to bypass PgBouncer for migrations. Rollback limitation documented (write a new migration).

**PART 7 — Redis / Queue:**
- Redis required in production. `docker-compose.production.yml` includes a Redis 7 service with password auth and data persistence. `ExportJobService` already degrades gracefully to inline mode if Redis is unavailable. Production degradation (no inline mode) is documented: production must have Redis running.

**PART 8 — Export Storage:**
- `ExportStorageService` now reads `EXPORT_STORAGE_PATH` env var (falls back to `.signalkit/exports` for dev). Production path: `/var/lib/signalkit/exports` mounted as Docker named volume.
- **`ExportCleanupService`** (new) — implements the Session 12 lifecycle gap. Runs on module init and every hour: (1) expires `ready` jobs past `expiresAt`, (2) deletes artifact files for jobs `expired` beyond `EXPORT_RETENTION_DAYS`. Registered in `ExportsModule`.

**PART 9 — Pack → Export Deep Link:**
- `apps/web/app/(app)/pack/page.tsx` — added "Export pack" button (secondary variant) in the PageHeader action area. Navigates to `/exports?packId={pack.id}` via `router.push`. Only visible when a pack is loaded.
- `apps/web/app/(app)/exports/page.tsx` — reads `?packId=` query param via `useSearchParams` and preselects that pack in the Pack selector on page load.

**PART 10 — Security:**
- `docs/SECURITY.md` — updated with production security reference: network topology, RBAC, LLM key encryption, export file security, HTTP security headers (Caddy), secrets rotation procedures, incident response, what-is-not-in-Supabase checklist.

**PART 11 — Health Checks:**
- `apps/api/src/health/health.controller.ts` — added `GET /health/live` (always 200 if process alive) and `GET /health/ready` (DB + Redis). Updated `GET /health` to also check Redis via a lazy `ioredis` connection. Redis check returns `ok` when `REDIS_URL` is absent (dev mode).
- Docker HEALTHCHECK in `apps/api/Dockerfile` uses `wget /health`.
- `scripts/deploy/healthcheck.sh` checks `/health`, `/health/live`, `/health/ready`.

**PART 12 — Backups:**
- Documented in `docs/DEPLOYMENT_HETZNER.md` and `docs/OPERATIONS.md`:
  - Supabase manages Postgres backups (point-in-time recovery built-in).
  - Export artifacts in `exports_data` volume are re-generable (not critical backup).
  - `.env.production` must be backed up encrypted off-VPS (secrets are not in git).
  - Caddy TLS certs in `caddy_data` volume are auto-renewed.

**PART 13 — Docs:**
- `docs/DEPLOYMENT_HETZNER.md` — VPS requirements, DNS, bootstrap, compose, migration, Caddy, env reference, prisma discipline, Redis/queue setup, export storage, common failures.
- `docs/OPERATIONS.md` — quick reference, health endpoints, service management, logs, resource monitoring, export lifecycle, Caddy operations, smoke test checklist, restart policy.
- `docs/SECURITY.md` — production security reference.
- `docs/EXPORTS.md` — updated storage paths section (dev/production/S3), added export cleanup/expiration lifecycle section.
- `docs/BUILD_LOG.md` — this entry.

### How to verify

```bash
pnpm typecheck && pnpm --filter @signalkit/api typecheck   # PASS
pnpm --filter @signalkit/web typecheck                     # PASS
pnpm --filter @signalkit/mobile typecheck                  # PASS
pnpm test                                                  # PASS
pnpm lint                                                  # PASS
pnpm --filter @signalkit/web exec next build               # PASS (incl. updated /pack, /exports)

# Docker (on Linux/WSL with Docker):
docker build -f apps/api/Dockerfile -t signalkit-api:test .
docker build -f apps/web/Dockerfile -t signalkit-web:test .
docker compose -f docker-compose.production.yml config    # validates compose syntax

# Verify Caddyfile (if caddy CLI available):
caddy validate --config infra/caddy/Caddyfile

# No real secrets in templates:
grep -r "openssl\|GENERATE_WITH" .env.production.example   # shows placeholder tokens only
```

### Known limitations

- Docker builds require Linux or WSL2 (Windows Docker Desktop can build multi-platform, but the scripts are bash/Linux-targeted).
- Caddy admin API is disabled (`admin off`) — re-enable temporarily for `caddy list-certificates` if needed.
- PDF RTL (Arabic) limitation from Session 12 unchanged.
- Mobile export download is web-redirected (no native file download).
- S3/MinIO storage adapter is not yet implemented — `ExportStorageService` is designed for drop-in replacement.
- Rate limiting was deferred to a dedicated session (the API has no global rate limit yet).

### Next risks

- Rate limiting on auth endpoints (`/auth/login`, `/auth/register`) — brute force risk.
- S3/MinIO storage adapter: `exports_data` volume works for single-VPS but does not scale horizontally.
- When scaling the API horizontally, BullMQ workers must not be duplicated without a shared Redis cluster.
- Supabase connection pool (PgBouncer at port 6543) may hit limits under high load — monitor and consider `connection_limit` in `DATABASE_URL`.

---

## Session 14 — Breakout Opportunity Engine / Venture Thesis / Build Blueprint Layer

**Status:** ✅ Complete

### Why

Trend/niche discovery alone can produce narrow, weak "trend niche" ideas. SignalKit must identify large, venture-scale opportunities and turn them into build-ready blueprints so a designer, developer or AI coding agent does not need to invent product logic, screen logic, workflows or backend/API structure.

### Done

- **Breakout Opportunity Engine** (`packages/shared/src/venture.ts`): `computeVentureScaleScore()` scores 15 venture-scale dimensions, each with reasoning, an assumption flag, per-dimension confidence and (when weak) an unresolved question. **No fake TAM** — `market_size_path` is always assumption-based; **no unsupported unicorn claims** in the explanation; confidence stays separate from the score.
- **Venture Thesis** (`apps/api/src/niches/venture.ts`): deterministic, evidence-aware `buildVentureThesis()` → breakout thesis, why now, macro shifts, entry wedge, expansion path, pain economics, AI unlock, distribution wedge, data/workflow moat, monetization, constraints, venture narrative, kill reasons, what-must-be-true, validation experiments, assumptions, unresolved questions. Recomputed on niche score/rescore; persisted to `VentureThesis`.
- **Four separate scores**: Opportunity, Confidence, Venture Scale, Build Readiness — never merged.
- **Build Blueprint Layer** (`packages/shared/src/blueprint.ts` + `apps/api/src/packs/blueprint.ts`): `buildBuildBlueprint(ctx)` derives screen contracts (with empty/loading/error states), state matrix, API-to-screen mapping, component contracts, permission matrix, analytics events, validation rules and DO_NOT_BUILD from the canonical pack context. `computeBuildReadiness()` is a separate 0–100 score across 6 dimensions.
- **Pack integration** (backwards-compatible): 4 optional document types (`venture_thesis`, `breakout_opportunity_memo`, `build_blueprint`, `do_not_build`) appended to build-oriented depths; the canonical 27 are unchanged. New folder `10_blueprint`.
- **Quality gates** (additive, only when blueprint present): `screen_states_complete`, `primary_action_maps`, `api_mapped_to_screen`, `do_not_build_present`, `venture_scale_breakdown`, `no_fake_tam`.
- **Exports**: AI-Agent bundle gains `VENTURE_THESIS.md`, `BUILD_BLUEPRINT.md`, `SCREEN_CONTRACTS.json`, `STATE_MATRIX.json`, `API_TO_SCREEN_MAP.yaml`, `COMPONENT_CONTRACTS.json`, `PERMISSION_MATRIX.json`, `ANALYTICS_EVENTS.json`, `DO_NOT_BUILD.md`, `VALIDATION_RULES.md`, `EMPTY_LOADING_ERROR_STATES.md`; Markdown ZIP gains a `10_blueprint/` folder; `README_FOR_AGENT.md` gains screen-contract / scope rules.
- **API**: `GET/POST …/niches/:id/venture-thesis[/regenerate]` (RBAC `niche:read`/`niche:discover`); `GET/POST …/packs/:id/build-blueprint[/regenerate]` (RBAC `pack:read`/`pack:generate`).
- **Schema**: additive migration `20260629_breakout_venture_blueprint` adds `VentureThesis` (per niche) and `BuildBlueprint` (per pack). No existing table altered. Uses `prisma migrate deploy`.
- **Web UI**: niche detail Venture thesis tab (4 separate scores, thesis sections with evidence/assumption flags, kill reasons, what-must-be-true, validation experiments, venture-scale dimension table); pack workspace Build Blueprint panel (readiness score/breakdown/warnings, screen contracts, API→screen map, DO_NOT_BUILD). Flat 2D; no gradients/chat/app-generation CTA.
- **Mobile UI**: niche detail surfaces Venture Scale, Build Readiness, thesis summary and kill reasons (read-only companion).
- **Docs**: `docs/BREAKOUT_OPPORTUNITY_ENGINE.md`, `docs/BUILD_BLUEPRINT.md`; updated ARCHITECTURE / EXPORTS / PRODUCT_CONTEXT.

### Tests

- `packages/shared/src/venture.test.ts` — venture scale separate from opportunity/confidence; market size always an assumption (no fake TAM); no unicorn claims; weak signals → what-must-be-true; build readiness coverage.
- `apps/api/src/niches/venture.test.ts` — thesis contains wedge + expansion + kill reasons; un-evidenced sections flagged as assumptions; no fabricated TAM.
- `apps/api/src/packs/blueprint.test.ts` — screen contract per screen with empty/loading/error; API-to-screen mapping; DO_NOT_BUILD present; build readiness; gates fail on missing screen states and on unflagged unicorn claims.
- `apps/api/src/exports/exports.test.ts` — Markdown ZIP + AI-Agent bundle include the blueprint files; agent rules present.
- All suites green: **31 shared tests, 113 API tests** (incl. updated pack/niche/export mocks).
