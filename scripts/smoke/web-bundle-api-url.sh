#!/usr/bin/env bash
set -euo pipefail

IMAGE_OR_CONTAINER="${1:-signalkit-web}"

echo "Checking web bundle API URL..."

docker exec "$IMAGE_OR_CONTAINER" sh -lc '
  set -e
  cd /app/apps/web

  if grep -R "http://localhost:4000" -n .next 2>/dev/null; then
    echo "FAIL: web bundle contains localhost API URL"
    exit 1
  fi

  if grep -R "https://api.signalkit.sys.bachopus.com" -n .next 2>/dev/null | head -5; then
    echo "OK: production API URL is baked into web bundle"
    exit 0
  fi

  echo "FAIL: production API URL not found in web bundle"
  exit 1
'
