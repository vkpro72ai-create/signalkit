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

## Cross-cutting invariants

Every persisted entity is workspace-owned and carries timestamps; significant entities add versioning, confidence and audit. Geo stores at most country/region and only with consent. Secrets are encrypted at rest and never serialized to clients.
