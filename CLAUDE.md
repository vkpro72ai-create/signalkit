# Agent instructions — SignalKit

## Deployment

Before any deployment to production, read `docs/DEPLOYMENT_HETZNER.md` in full. It is the
source of truth for how this app is deployed and referenced directly from
`docker-compose.production.yml`. Do not deploy from memory or from a prior session's
summary of it.

The production VPS (`nofida-production`, root@178.105.237.128) is shared with unrelated
projects (`nofida-core-*`, Penpot). Only ever rebuild/restart the `api` and `web` services
for SignalKit changes — never touch `signalkit-redis-1` or any `nofida-core-*`/Penpot
container.

Migrations: `prisma migrate deploy` only, run via `bash scripts/deploy/migrate.sh` (or
`bash scripts/deploy/migrate.sh --status` to check first). Never `prisma db push` or
`prisma migrate reset` against production.

After deploying, verify with `docker ps`, `bash scripts/deploy/healthcheck.sh`, and
`git log -1 --oneline` on the server.
