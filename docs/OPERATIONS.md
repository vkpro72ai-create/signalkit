# SignalKit — Operations Runbook

Reference for day-to-day operations of the production SignalKit stack.

---

## Quick Reference

```bash
# All commands run from ~/signalkit on the VPS

# Deploy latest code
bash scripts/deploy/deploy.sh

# Deploy without rebuilding images
bash scripts/deploy/deploy.sh --no-build

# Run migrations only
bash scripts/deploy/migrate.sh

# Health check
bash scripts/deploy/healthcheck.sh

# View all logs (follow)
bash scripts/deploy/logs.sh

# View specific service
bash scripts/deploy/logs.sh api
bash scripts/deploy/logs.sh caddy

# Restart a service
docker compose -f docker-compose.production.yml restart api

# Full stack restart
docker compose -f docker-compose.production.yml --env-file .env.production down
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

---

## Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Full check: DB + Redis. Used by Caddy upstream health probe. |
| `GET /health/live` | Liveness: always 200 if process is running. |
| `GET /health/ready` | Readiness: DB and Redis must be reachable. |

Docker HEALTHCHECK uses `/health` with a 45s start period.

### Check health directly

```bash
# Via public domain
curl https://api.yourdomain.com/health

# Via internal port (on VPS)
curl http://localhost:4000/health
```

Example response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "checks": [
    { "name": "database", "status": "ok" },
    { "name": "redis",    "status": "ok" }
  ],
  "timestamp": "2026-06-28T12:00:00.000Z"
}
```

---

## Service Management

### Check service status

```bash
docker compose -f docker-compose.production.yml ps
```

### Restart one service

```bash
docker compose -f docker-compose.production.yml restart api
docker compose -f docker-compose.production.yml restart web
docker compose -f docker-compose.production.yml restart redis
docker compose -f docker-compose.production.yml restart caddy
```

### Scale (not typical for this stack)

The stack is designed single-instance. Horizontal scaling of `api` would require a shared Redis and shared export storage (S3/MinIO), plus a load balancer in front of Caddy.

---

## Logs

### Follow logs

```bash
bash scripts/deploy/logs.sh              # all
bash scripts/deploy/logs.sh api          # API
bash scripts/deploy/logs.sh web          # Web
bash scripts/deploy/logs.sh caddy        # Caddy
bash scripts/deploy/logs.sh redis        # Redis
bash scripts/deploy/logs.sh --no-follow  # dump last 100 lines
```

### Caddy access logs

Caddy writes structured JSON logs to `/var/log/caddy/` inside the Caddy container.

```bash
docker compose -f docker-compose.production.yml exec caddy \
  tail -f /var/log/caddy/api.access.log | jq .
```

### API structured logs

NestJS logs to stdout/stderr. The Docker daemon captures these and forwards them to `docker logs`.

```bash
docker compose -f docker-compose.production.yml logs api --tail=200 | grep ERROR
```

---

## Resource Monitoring

Docker stats:

```bash
docker stats --no-stream
```

Disk usage:

```bash
docker system df
df -h /var/lib/docker
df -h /var/lib/signalkit
```

Export storage size:

```bash
docker volume inspect signalkit_exports_data
du -sh /var/lib/docker/volumes/signalkit_exports_data/
```

---

## Database (Supabase)

Postgres is managed by Supabase. Connect via:

```bash
psql "${DIRECT_URL}"
```

### Run Prisma Studio (local only)

```bash
pnpm --filter @signalkit/api exec prisma studio
```

Never run Prisma Studio against the production database from a public IP.

---

## Export Lifecycle

Export jobs follow this lifecycle:

```
queued → processing → ready → expired
                    → failed
```

- `queued`: job created, waiting for BullMQ worker
- `processing`: worker picked up the job
- `ready`: artifact available for download (`expiresAt` set to now + retention)
- `expired`: past `expiresAt`, artifact deleted
- `failed`: processing error, `errorCode` set

`ExportCleanupService` runs every hour and handles the `ready → expired` transition.

### Manually expire a job

If you need to immediately expire a job:

```bash
docker compose -f docker-compose.production.yml exec api \
  node -e "
    const {PrismaClient} = require('@prisma/client');
    const p = new PrismaClient();
    p.exportJob.update({
      where: { id: 'JOB_ID' },
      data: { status: 'expired' }
    }).then(r => { console.log(r.id, r.status); process.exit(0); });
  "
```

---

## Caddy Operations

### Reload config (no downtime)

```bash
docker compose -f docker-compose.production.yml exec caddy \
  caddy reload --config /etc/caddy/Caddyfile
```

### Check TLS certificate status

```bash
docker compose -f docker-compose.production.yml exec caddy \
  caddy list-certificates
```

### Caddy admin API

The admin API is disabled in production (`admin off` in Caddyfile). To enable temporarily:

```bash
# In Caddyfile, remove `admin off`
# Reload config
# Access admin at http://localhost:2019
```

---

## Production Smoke Test Checklist

Run after every deploy:

- [ ] `bash scripts/deploy/healthcheck.sh` — all checks pass
- [ ] `https://app.yourdomain.com` — loads SignalKit web
- [ ] `https://api.yourdomain.com/health` — `"status":"ok"`
- [ ] `https://api.yourdomain.com/docs` — Swagger UI loads
- [ ] Login works (JWT auth)
- [ ] Create/list pack — API responds correctly
- [ ] Export center loads at `/exports`
- [ ] Generate a markdown_zip export — status goes to `ready`
- [ ] Download the export — file downloads correctly
- [ ] TLS: `https://` works, `http://` redirects to HTTPS

---

## Restart Policy

All containers have `restart: unless-stopped`. They restart automatically after:
- Container crash
- Docker daemon restart
- VPS reboot

To prevent auto-restart during maintenance:

```bash
docker compose -f docker-compose.production.yml stop api
# do maintenance
docker compose -f docker-compose.production.yml start api
```

---

## Update Caddy Image

```bash
docker compose -f docker-compose.production.yml pull caddy
docker compose -f docker-compose.production.yml up -d --no-deps caddy
```
