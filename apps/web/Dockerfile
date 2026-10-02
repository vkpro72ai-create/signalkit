# ── SignalKit Web — Production Dockerfile ─────────────────────────────────────
#
# Multi-stage build:
#   base    — node + pnpm
#   deps    — install all workspace deps
#   builder — build workspace packages + Next.js (standalone output)
#   runner  — minimal runtime using Next.js standalone bundle
#
# next.config.mjs must have output: 'standalone' (already set).

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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

COPY apps/web/package.json                 apps/web/package.json
COPY packages/shared/package.json          packages/shared/package.json
COPY packages/i18n/package.json            packages/i18n/package.json
COPY packages/ui/package.json              packages/ui/package.json
COPY packages/config/package.json          packages/config/package.json
COPY packages/evidence/package.json        packages/evidence/package.json
COPY packages/exports/package.json         packages/exports/package.json
COPY packages/llm/package.json             packages/llm/package.json

RUN pnpm install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY tsconfig.base.json tsconfig.json ./
COPY apps/web/     apps/web/
COPY packages/     packages/

# Build workspace packages that web imports (transpilePackages handles TS,
# but they must export valid JS from dist/ for the build to resolve them)
RUN pnpm --filter @signalkit/config   build && \
    pnpm --filter @signalkit/shared   build && \
    pnpm --filter @signalkit/i18n     build && \
    pnpm --filter @signalkit/ui       build

ENV NEXT_TELEMETRY_DISABLED=1
# Enable standalone output inside Docker (Linux — no EPERM symlink issue).
# Local Windows builds use NEXT_BUILD_MODE unset → no standalone output.
ENV NEXT_BUILD_MODE=standalone

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at container runtime — they MUST be passed as build args here, not
# just as `environment:` on the runner service (that only affects the
# server process, not the already-compiled browser JS).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE=en
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_DEFAULT_LOCALE=${NEXT_PUBLIC_DEFAULT_LOCALE}

RUN pnpm --filter @signalkit/web build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 signalkit && \
    adduser --system --uid 1001 --ingroup signalkit signalkit

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone bundles server.js + all required node_modules at root
COPY --from=builder --chown=signalkit:signalkit \
  /app/apps/web/.next/standalone ./

# Static assets must be served alongside standalone bundle
COPY --from=builder --chown=signalkit:signalkit \
  /app/apps/web/.next/static ./apps/web/.next/static

# public/ dir (if present)
COPY --from=builder --chown=signalkit:signalkit \
  /app/apps/web/public ./apps/web/public

USER signalkit
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ 2>/dev/null | grep -q 'SignalKit\|html' || exit 1

CMD ["node", "apps/web/server.js"]
