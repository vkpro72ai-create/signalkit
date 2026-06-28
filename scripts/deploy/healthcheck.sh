#!/usr/bin/env bash
# ── healthcheck.sh ────────────────────────────────────────────────────────────
# Verify that all SignalKit services are healthy.
# Exits 0 if all checks pass; exits 1 if any fail.
#
# Usage:
#   bash scripts/deploy/healthcheck.sh
#   bash scripts/deploy/healthcheck.sh --verbose

set -euo pipefail

VERBOSE=false
[ "${1:-}" = "--verbose" ] && VERBOSE=true

PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expect="${3:-}"

  local response
  if response=$(curl -sf --max-time 5 "$url" 2>/dev/null); then
    if [ -n "$expect" ] && ! echo "$response" | grep -q "$expect"; then
      echo "FAIL  $name — unexpected response (expected: $expect)"
      FAIL=$((FAIL + 1))
    else
      echo "OK    $name"
      $VERBOSE && echo "      $response"
      PASS=$((PASS + 1))
    fi
  else
    echo "FAIL  $name — no response from $url"
    FAIL=$((FAIL + 1))
  fi
}

echo "==> SignalKit health checks ($(date -u '+%Y-%m-%dT%H:%M:%SZ'))"
echo ""

# Load domains from env file if present
if [ -f .env.production ]; then
  # shellcheck disable=SC1091
  source .env.production 2>/dev/null || true
fi

WEB_DOMAIN="${WEB_DOMAIN:-app.example.com}"
API_DOMAIN="${API_DOMAIN:-api.example.com}"

check "API /health"       "https://${API_DOMAIN}/health"        '"status"'
check "API /health/live"  "https://${API_DOMAIN}/health/live"   '"status":"ok"'
check "API /health/ready" "https://${API_DOMAIN}/health/ready"  '"status"'
check "Web root"          "https://${WEB_DOMAIN}/"

# Docker-internal checks (direct to containers)
check "API internal"      "http://localhost:4000/health"         '"status"' 2>/dev/null || true
check "Web internal"      "http://localhost:3000/"                        2>/dev/null || true

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed. Inspect logs:"
  echo "  docker compose -f docker-compose.production.yml logs api   --tail=50"
  echo "  docker compose -f docker-compose.production.yml logs web   --tail=50"
  echo "  docker compose -f docker-compose.production.yml logs caddy --tail=50"
  exit 1
fi
