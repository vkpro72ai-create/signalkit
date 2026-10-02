#!/usr/bin/env bash
# ── deploy.sh ─────────────────────────────────────────────────────────────────
# Pull latest code and restart the production stack.
# Run from the repository root on the VPS as the deploy user.
#
# Usage:
#   bash scripts/deploy/deploy.sh
#   bash scripts/deploy/deploy.sh --no-migrate   # skip migrations
#   bash scripts/deploy/deploy.sh --no-build     # restart without rebuilding

set -euo pipefail

COMPOSE="docker compose -f docker-compose.production.yml --env-file .env.production"
RUN_MIGRATE=true
RUN_BUILD=true

for arg in "$@"; do
  case $arg in
    --no-migrate) RUN_MIGRATE=false ;;
    --no-build)   RUN_BUILD=false   ;;
  esac
done

echo "==> [$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Starting deploy"

echo "==> Pulling latest code"
git fetch --all
git pull --ff-only

if [ "$RUN_BUILD" = true ]; then
  echo "==> Building images"
  $COMPOSE build --pull
fi

if [ "$RUN_MIGRATE" = true ]; then
  echo "==> Running database migrations"
  bash scripts/deploy/migrate.sh
fi

echo "==> Starting / restarting stack"
$COMPOSE up -d --remove-orphans

echo "==> Waiting for services to become healthy (up to 120s)"
sleep 10
bash scripts/deploy/healthcheck.sh

echo "==> Pruning old Docker images"
docker image prune -f --filter "until=48h"

echo ""
echo "Deploy complete."
echo "Run 'bash scripts/deploy/healthcheck.sh' at any time to verify."
