#!/usr/bin/env bash
# ── migrate.sh ────────────────────────────────────────────────────────────────
# Run Prisma migrations against the production database.
# Safe to run multiple times — Prisma tracks applied migrations.
#
# Rules:
#   - Always uses prisma migrate deploy (never db push)
#   - Reads DATABASE_URL / DIRECT_URL from the running api container's env
#   - Can be run before or after starting the stack (uses a one-off container)
#
# Usage:
#   bash scripts/deploy/migrate.sh
#
# Check migration status:
#   bash scripts/deploy/migrate.sh --status
#
# Local dev (against local DB):
#   pnpm --filter @signalkit/api exec prisma migrate dev

set -euo pipefail

COMPOSE="docker compose -f docker-compose.production.yml --env-file .env.production"

if [ "${1:-}" = "--status" ]; then
  echo "==> Checking migration status"
  $COMPOSE run --rm api \
    sh -c "cd /app && npx prisma migrate status --schema ./prisma/schema.prisma"
  exit 0
fi

echo "==> Running: prisma migrate deploy"
$COMPOSE run --rm api \
  sh -c "cd /app && npx prisma migrate deploy --schema ./prisma/schema.prisma"

echo "==> Migrations complete."
