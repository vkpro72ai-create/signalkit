# SignalKit / NicheOS

AI-first B2B/SaaS platform for **evidence-backed market opportunity discovery** and generation of a deep, multilingual, build-ready **Product Document Pack**.

> SignalKit is **not** an app generator. It does not generate finished applications and is not a Lovable/Bolt/v0 clone. Its primary output is an evidence-backed, multilingual, build-ready Product Document Pack that founders, PMs, designers, engineers, growth teams, investors and AI coding agents can act on. See [docs/PRODUCT_CONTEXT.md](docs/PRODUCT_CONTEXT.md).

## Monorepo layout

```
apps/
  web/        Next.js web application
  mobile/     Expo React Native app
  api/        NestJS backend
packages/
  shared/     Shared types, enums, schemas, API contracts (the platform spine)
  config/     tsconfig / eslint / prettier base configs
  ui/         Design tokens & shared UI primitives (premium flat 2D)
  i18n/       Translations, locale utils, formatting rules
  llm/        Provider interfaces, routing contracts, model metadata types
  evidence/   Claim / evidence / confidence schemas
  exports/    Export schemas & file conventions
docs/         Product, architecture, agent rules, security, deployment docs
infra/        Docker, Caddy, scripts, GitHub Actions
```

## Requirements

- Node.js >= 20
- pnpm >= 10

## Getting started

```bash
pnpm install          # install all workspace dependencies
pnpm typecheck        # typecheck all packages (tsc -b)
pnpm lint             # lint the monorepo
pnpm test             # run unit tests
pnpm build            # build all packages
pnpm dev              # run apps in dev mode (parallel)
```

### Per-app

```bash
pnpm --filter @signalkit/web dev      # Next.js web
pnpm --filter @signalkit/api dev      # NestJS API
pnpm --filter @signalkit/mobile start # Expo mobile
```

Copy the relevant `.env.example` to `.env` for each app before running. Real secrets are never committed.

## Stack

TypeScript end-to-end · Next.js · Expo React Native / Expo Router · NestJS · PostgreSQL + Prisma · Redis + BullMQ · S3-compatible / MinIO · GitHub Actions · Docker Compose on Hetzner · Expo/EAS for APK.

## Engineering & product laws

Before contributing (human or AI agent), read [docs/AGENT_RULES.md](docs/AGENT_RULES.md). Non-negotiables:

- No app generator, no "Generate App" CTA, chat is not the main UX.
- No gradients / glassmorphism / neon — premium flat 2D only ([docs/UI_UX_PRINCIPLES.md](docs/UI_UX_PRINCIPLES.md)).
- No claims without evidence/assumptions; no unsupported claims as facts.
- No hardcoded English-only UI; every core entity supports language, market, evidence, versioning.
- One system each for language / geo / LLM / evidence / documents — never duplicated.

## Build progress

This repository is built across 20 sequenced sessions. See [docs/BUILD_LOG.md](docs/BUILD_LOG.md) for what is implemented per session.
