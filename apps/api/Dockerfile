# ── SignalKit API — Production Dockerfile ─────────────────────────────────────
#
# Multi-stage build:
#   base    — node + pnpm
#   deps    — install all workspace deps (with devDeps for build)
#   builder — build workspace packages + API, then pnpm deploy to /deploy
#   runner  — minimal runtime image with only production artifacts
#
# Migrations are NOT run automatically. Run them separately via:
#   docker compose run --rm api node -e "require('./dist/main')" -- false
# or use scripts/deploy/migrate.sh
#
# Build args:
#   PNPM_VERSION — must match packageManager field in root package.json

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.32.1

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Copy all package.json files needed to resolve the workspace graph
COPY apps/api/package.json                 apps/api/package.json
COPY packages/config/package.json          packages/config/package.json
COPY packages/shared/package.json          packages/shared/package.json
COPY packages/evidence/package.json        packages/evidence/package.json
COPY packages/exports/package.json         packages/exports/package.json
COPY packages/llm/package.json             packages/llm/package.json
COPY packages/i18n/package.json            packages/i18n/package.json
COPY packages/ui/package.json              packages/ui/package.json

RUN pnpm install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Root tsconfig files referenced by all packages via "extends": "../../tsconfig.base.json"
COPY tsconfig.base.json tsconfig.json ./

# Copy source for API and all workspace packages it depends on
COPY apps/api/                apps/api/
COPY packages/config/         packages/config/
COPY packages/shared/         packages/shared/
COPY packages/evidence/       packages/evidence/
COPY packages/exports/        packages/exports/
COPY packages/llm/            packages/llm/
COPY packages/i18n/           packages/i18n/
COPY packages/ui/             packages/ui/

# Build in dependency order, then generate Prisma client, then build API
RUN pnpm --filter @signalkit/config   build && \
    pnpm --filter @signalkit/shared   build && \
    pnpm --filter @signalkit/evidence build && \
    pnpm --filter @signalkit/exports  build && \
    pnpm --filter @signalkit/llm      build && \
    pnpm --filter @signalkit/i18n     build && \
    pnpm --filter @signalkit/ui       build

RUN pnpm --filter @signalkit/api exec prisma generate
RUN pnpm --filter @signalkit/api build

# pnpm v10 requires --legacy for non-injected workspace deploys
RUN pnpm --filter @signalkit/api deploy --prod --legacy /deploy/api

# Copy Prisma schema + migrations into the deploy dir (needed for migrate deploy)
RUN cp -r apps/api/prisma /deploy/api/prisma

# pnpm deploy only follows the dependency graph (package.json + dist/), not
# arbitrary asset directories — copy the embedded PDF fonts explicitly so
# Cyrillic/Unicode text renders correctly at runtime (see src/exports/pdf/fonts.ts).
RUN cp -r apps/api/assets /deploy/api/assets

# pnpm deploy creates a fresh node_modules but does not run postinstall scripts,
# so .prisma/client (native engine) is missing. Regenerate inside the deploy
# dir where prisma is now a production dependency.
RUN cd /deploy/api && node_modules/.bin/prisma generate --schema ./prisma/schema.prisma

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 signalkit && \
    adduser --system --uid 1001 --ingroup signalkit signalkit

# Production deployment from builder
COPY --from=builder --chown=signalkit:signalkit /deploy/api ./

# Export storage volume mount point
RUN mkdir -p /var/lib/signalkit/exports && \
    chown signalkit:signalkit /var/lib/signalkit/exports

USER signalkit

ENV NODE_ENV=production
ENV PORT=4000
ENV EXPORT_STORAGE_PATH=/var/lib/signalkit/exports

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:4000/health 2>/dev/null | grep -q '"status"' || exit 1

CMD ["node", "dist/main.js"]
