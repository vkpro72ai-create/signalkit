#!/bin/sh
# SignalKit API container entrypoint.
#
#   RUN_MIGRATIONS=true  run `prisma migrate deploy` before starting the API.
#                        Default: off — prefer a separate release step when the
#                        platform has one, so replicas never race on migrations.
set -eu

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "==> prisma migrate deploy"
  node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
fi

exec "$@"
