#!/usr/bin/env bash
# ── logs.sh ───────────────────────────────────────────────────────────────────
# Tail production logs. Defaults to following all services.
#
# Usage:
#   bash scripts/deploy/logs.sh              # all services, follow
#   bash scripts/deploy/logs.sh api          # API only
#   bash scripts/deploy/logs.sh web          # Web only
#   bash scripts/deploy/logs.sh caddy        # Caddy only
#   bash scripts/deploy/logs.sh --no-follow  # dump last 100 lines, exit

set -euo pipefail

COMPOSE="docker compose -f docker-compose.production.yml --env-file .env.production"
FOLLOW="-f"
SERVICE=""

for arg in "$@"; do
  case $arg in
    --no-follow) FOLLOW="" ;;
    api|web|redis|caddy) SERVICE="$arg" ;;
  esac
done

# shellcheck disable=SC2086
$COMPOSE logs $FOLLOW --tail=100 $SERVICE
