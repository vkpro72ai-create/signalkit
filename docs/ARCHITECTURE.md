# Architecture

## High level

SignalKit is a TypeScript-end-to-end pnpm monorepo. Three applications (web, mobile, api) share a single set of contract and utility packages. The shared package is dependency-free and is the single source of truth for the domain.

```
┌────────────┐   ┌────────────┐   ┌────────────┐
│  apps/web  │   │ apps/mobile│   │  apps/api  │
│  Next.js   │   │ Expo RN    │   │  NestJS    │
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      │                │                │
      └────────────────┼────────────────┘
                       │  import
        ┌──────────────┴───────────────────────────┐
        │ packages/shared  (types, enums, contracts)│  ← zero runtime deps
        ├───────────────────────────────────────────┤
        │ config · i18n · ui · llm · evidence ·exports│
        └───────────────────────────────────────────┘
```

## Apps

- **apps/web** — Next.js (App Router). Premium flat 2D workspace UI.
- **apps/mobile** — Expo React Native + Expo Router. Serious companion app for reviewing, reading, approving and monitoring exports.
- **apps/api** — NestJS backend. PostgreSQL + Prisma, Redis + BullMQ queues, S3-compatible storage. Boots with a health endpoint today; feature modules are added per session.

## Packages

| Package | Responsibility |
| --- | --- |
| `@signalkit/shared` | All domain types, enums and API contracts. No runtime dependencies. |
| `@signalkit/config` | Strict environment parsing; fail-fast secret validation. |
| `@signalkit/i18n` | Locale detection, fallback, formatting; translation contract. |
| `@signalkit/ui` | Flat 2D design tokens (and, from Session 3, shared components). |
| `@signalkit/llm` | Provider adapter & router contracts. All AI flows through here. |
| `@signalkit/evidence` | Trust-layer helpers: confidence derivation, contradiction handling. |
| `@signalkit/exports` | Export file conventions and manifest contracts. |

## Core domain modules (built over the 20 sessions)

Identity/RBAC · Geo/Market · Projects/Search Context · Source ingestion/Signals · Niches/Scoring · Evidence graph · Product Document Pack · LLM marketplace/router · Exports · Billing/Usage · Collaboration · White-label · Public API · Quality intelligence · Growth/outcome tracking.

## Build system

- TypeScript strict mode everywhere. Packages use TS project references (`tsc -b`).
- Apps use their native toolchains (`next build`, `nest build`, `expo`).
- Tests: Vitest. Lint: ESLint (flat config) + Prettier.

## Production Deployment (Session 13)

```
Internet
  │
  ▼
[Caddy :80/:443]  — automatic TLS, gzip, secure headers
  │         │
  ▼         ▼
[web:3000] [api:4000]
             │
             ├── [redis:6379]  BullMQ queues (export + ingestion)
             │
             └── [Supabase]    Managed PostgreSQL (external)
```

- `docker-compose.production.yml` — full production stack
- `apps/api/Dockerfile` — 4-stage pnpm monorepo build
- `apps/web/Dockerfile` — Next.js standalone output
- `infra/caddy/Caddyfile` — reverse proxy + TLS
- `scripts/deploy/` — bootstrap, deploy, migrate, healthcheck, logs

Only Caddy exposes public ports. All other services are on the internal `signalkit` Docker network.

See `docs/DEPLOYMENT_HETZNER.md` for the full setup guide.

## Cross-cutting invariants

Every persisted entity is workspace-owned and carries timestamps; significant entities add versioning, confidence and audit. Geo stores at most country/region and only with consent. Secrets are encrypted at rest and never serialized to clients.

## Breakout Opportunity Engine & Build Blueprint (Session 14)

On top of niches/evidence/packs, SignalKit derives venture-scale opportunities
and build-ready blueprints. Four scores are kept **strictly separate**:
Opportunity and Confidence (`scoring.ts`), Venture Scale (`venture.ts`) and Build
Readiness (`blueprint.ts`).

- **Venture Thesis + Venture Scale Score** — per niche. Computed from the
  project's real signals + evidence whenever a niche is scored, persisted to
  `VentureThesis`. No fabricated TAM; weak dimensions become assumptions /
  unresolved questions. See `docs/BREAKOUT_OPPORTUNITY_ENGINE.md`.
- **Build Blueprint + Build Readiness Score** — per pack. Derived from the same
  canonical `PackContext` (features → screens → entities → endpoints), so screen
  contracts, state matrix, API↔screen map, component contracts, permission
  matrix, analytics events and DO_NOT_BUILD are consistent by construction.
  Persisted to `BuildBlueprint`. See `docs/BUILD_BLUEPRINT.md`.

Both are **additive and backwards-compatible**: the canonical 27 documents,
existing quality gates and exports are unchanged; new behavior activates only
when venture/blueprint data is present. New pack document types
(`venture_thesis`, `breakout_opportunity_memo`, `build_blueprint`,
`do_not_build`) are appended to build-oriented depths and routed to a new
`10_blueprint/` export folder. Additive migration `20260629_breakout_venture_blueprint`.
