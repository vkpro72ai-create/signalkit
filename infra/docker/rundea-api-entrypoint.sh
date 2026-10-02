#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

redis-server \
  --bind 127.0.0.1 \
  --protected-mode yes \
  --port 6379 \
  --dir /var/lib/signalkit/redis \
  --appendonly yes \
  --save 60 1 \
  --daemonize yes \
  --pidfile /tmp/signalkit-redis.pid \
  --logfile ""

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if redis-cli -h 127.0.0.1 ping >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" = "10" ]; then
    echo "Redis failed to start" >&2
    exit 1
  fi
  sleep 1
done

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
fi

exec node dist/main.js
