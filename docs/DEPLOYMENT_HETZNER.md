# SignalKit — Hetzner Production Deployment

Complete guide for deploying SignalKit on a Hetzner VPS using Docker Compose and Caddy.

---

## VPS Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU      | 2 vCPU  | 4 vCPU      |
| RAM      | 4 GB    | 8 GB        |
| Disk     | 40 GB   | 80 GB SSD   |
| OS       | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Network  | 1 Gbps  | 1 Gbps      |

Hetzner plan: **CX22** (minimum) or **CX32** (recommended).

---

## Architecture

```
Internet
  │
  ▼
[Caddy :80/:443]  ← automatic TLS via Let's Encrypt
  │         │
  ▼         ▼
[web:3000] [api:4000]
             │
             ▼
          [redis:6379]  ← internal only
             │
             ▼
     [Supabase Postgres]  ← managed, external
```

Only Caddy is publicly exposed. All other containers communicate on the internal `signalkit` Docker network.

---

## Step 1: Server Bootstrap

Run once on a fresh VPS as root:

```bash
# From your local machine
ssh root@YOUR_VPS_IP 'bash -s' < scripts/deploy/hetzner-bootstrap.sh
```

This installs Docker, creates the `signalkit` deploy user, configures UFW firewall, and enables fail2ban.

### Firewall rules applied

| Port       | Purpose              |
|------------|----------------------|
| 22/tcp     | SSH                  |
| 80/tcp     | HTTP (Caddy → HTTPS redirect) |
| 443/tcp    | HTTPS                |
| 443/udp    | HTTP/3 (QUIC)        |

All other inbound ports are blocked.

---

## Step 2: DNS Setup

Point your domains to the VPS IP before starting Caddy — Let's Encrypt requires DNS to resolve for TLS issuance.

```
A  app.yourdomain.com  →  YOUR_VPS_IP
A  api.yourdomain.com  →  YOUR_VPS_IP
```

DNS propagation can take up to 48 hours (usually minutes).

---

## Step 3: Clone the Repository

```bash
ssh signalkit@YOUR_VPS_IP
cd ~/signalkit   # created by bootstrap script
git pull         # or: git clone <repo> ~/signalkit
```

---

## Step 4: Configure Environment

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in **all required values**. See [Environment Reference](#environment-reference) below.

Generate secrets:

```bash
# JWT secret (minimum 32 chars)
openssl rand -hex 32

# Encryption key for LLM API keys (must be exactly 64 hex chars = 32 bytes)
openssl rand -hex 32

# Redis password
openssl rand -hex 24
```

---

## Step 5: Run Database Migrations

Run migrations before starting the stack (or after any schema change):

```bash
bash scripts/deploy/migrate.sh
```

This runs `prisma migrate deploy` inside a temporary API container. It uses the `DIRECT_URL` (port 5432, bypassing PgBouncer) which is required for migrations.

**Never use** `prisma db push` in production — it bypasses the migration history.

Check migration status at any time:

```bash
bash scripts/deploy/migrate.sh --status
```

---

## Step 6: Start the Stack

```bash
bash scripts/deploy/deploy.sh
```

This builds images, runs migrations, and starts all services.

On subsequent deploys (code updates):

```bash
cd ~/signalkit
bash scripts/deploy/deploy.sh
```

---

## Step 7: Verify

```bash
bash scripts/deploy/healthcheck.sh
```

Expected output:
```
OK    API /health
OK    API /health/live
OK    API /health/ready
OK    Web root
```

---

## Ongoing Operations

### View logs

```bash
bash scripts/deploy/logs.sh           # all services
bash scripts/deploy/logs.sh api       # API only
bash scripts/deploy/logs.sh caddy     # Caddy only
bash scripts/deploy/logs.sh --no-follow  # dump and exit
```

### Restart a service

```bash
docker compose -f docker-compose.production.yml restart api
docker compose -f docker-compose.production.yml restart web
```

### Restart the full stack

```bash
docker compose -f docker-compose.production.yml --env-file .env.production down
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

### Stop the stack

```bash
docker compose -f docker-compose.production.yml --env-file .env.production down
```

---

## Environment Reference

### Root `.env.production` (complete list)

| Variable | Required | Description |
|----------|----------|-------------|
| `WEB_DOMAIN` | Yes | Public domain for Next.js web (e.g. `app.example.com`) |
| `API_DOMAIN` | Yes | Public domain for NestJS API (e.g. `api.example.com`) |
| `NEXT_PUBLIC_API_URL` | Yes | HTTPS API URL as seen by browsers (e.g. `https://api.example.com`) |
| `CADDY_ACME_EMAIL` | Yes | Email for Let's Encrypt notifications |
| `DATABASE_URL` | Yes | Supabase pooled connection (port 6543, PgBouncer) |
| `DIRECT_URL` | Yes | Supabase direct connection (port 5432, for migrations) |
| `REDIS_PASSWORD` | Yes | Password for the Redis container |
| `JWT_SECRET` | Yes | JWT signing secret (≥ 32 chars) |
| `JWT_EXPIRES_IN` | No | Token lifetime. Default: `7d` |
| `ENCRYPTION_KEY_FOR_LLM_KEYS` | Yes | AES-256-GCM key for BYOK (64 hex chars) |
| `CORS_ORIGINS` | Yes | Comma-separated HTTPS origins (e.g. `https://app.example.com`) |
| `EXPORT_STORAGE_PATH` | No | Container path for exports. Default: `/var/lib/signalkit/exports` |
| `EXPORT_RETENTION_DAYS` | No | Days before expired exports are deleted. Default: `7` |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | No | Default UI locale. Default: `en` |

---

## Prisma Migration Discipline

### Local development

```bash
# Create a new migration after schema change
pnpm --filter @signalkit/api exec prisma migrate dev --name my_change

# Apply pending migrations locally
pnpm --filter @signalkit/api exec prisma migrate deploy
```

### Production

```bash
# Always use migrate deploy — never db push
bash scripts/deploy/migrate.sh

# Or directly:
docker compose -f docker-compose.production.yml --env-file .env.production \
  run --rm api sh -c "cd /app && npx prisma migrate deploy --schema ./prisma/schema.prisma"
```

### Rollback limitation

Prisma does not support automatic migration rollback. To revert a migration:
1. Write a new migration that undoes the schema change
2. Apply it via `prisma migrate deploy`
3. Never delete or modify already-applied migration files

### Check status

```bash
bash scripts/deploy/migrate.sh --status
```

---

## Redis / Queue Setup

### Production

Redis is **required** in production. Without it, export jobs and ingestion queue jobs cannot run through BullMQ.

The `redis` container is defined in `docker-compose.production.yml` and starts with password auth.

The API's `REDIS_URL` is built automatically by the compose file:
```
redis://:${REDIS_PASSWORD}@redis:6379
```

If Redis fails to start, the API will log a warning and fall back to inline export processing (without queue persistence).

### Local development

Redis is optional locally. Without `REDIS_URL` set in `.env`, the API runs inline export processing.

To test Redis locally:

```bash
docker run -d -p 6379:6379 redis:7-alpine
export REDIS_URL=redis://localhost:6379
```

### Queue behavior

| Environment | Redis | Export processing |
|-------------|-------|-------------------|
| Local dev   | absent | Inline (setImmediate) |
| Local dev   | present | BullMQ queue |
| Production  | required | BullMQ queue |

---

## Export Storage

### Production path

Exports are written to `/var/lib/signalkit/exports` inside the API container, mapped to the `exports_data` Docker named volume.

```yaml
volumes:
  - exports_data:/var/lib/signalkit/exports
```

### Dev path

Without `EXPORT_STORAGE_PATH` set, exports go to `.signalkit/exports/` in the working directory. This path is gitignored.

### S3/MinIO compatibility

The `ExportStorageService` interface (write/read/stream) is designed to be swapped for an S3-compatible backend. To add S3 support:
1. Implement an `S3ExportStorageService` with the same interface
2. Swap it in `exports.module.ts`
3. Add `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` to env

### Export retention and cleanup

`ExportCleanupService` runs hourly:
1. Marks `ready` jobs whose `expiresAt < now` as `expired`
2. Deletes artifact files for jobs that have been `expired` for longer than `EXPORT_RETENTION_DAYS`

Default retention: 7 days.

---

## Caddy Configuration

`infra/caddy/Caddyfile` provides:

- Automatic TLS via Let's Encrypt (ACME HTTP-01 challenge)
- HTTP → HTTPS redirect
- gzip + zstd compression
- Secure headers (CSP, HSTS, X-Frame-Options, etc.)
- 50 MB request body limit (export uploads)
- Real IP forwarding to API
- Structured JSON access logs

To reload Caddy config without restart:

```bash
docker compose -f docker-compose.production.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Common Failures

### API won't start — missing secrets

The API refuses to start if required secrets are missing. Check:

```bash
docker compose -f docker-compose.production.yml logs api | head -20
```

Look for: `Cannot start API: missing required secrets: ...`

Fix: add the missing values to `.env.production` and restart.

### Caddy can't get TLS certificate

- DNS not pointing to VPS yet — wait for propagation
- Port 80 or 443 blocked by firewall — check `ufw status`
- ACME email not set — set `CADDY_ACME_EMAIL` in `.env.production`

### Redis connection refused

- Redis container not running: `docker compose ... ps`
- Wrong password: check `REDIS_PASSWORD` in `.env.production`
- Redis is healthy but API can't reach it: check they're on the same Docker network

### Migrations fail — pool timeout

Use `DIRECT_URL` (port 5432) for migrations, not the pooled URL (port 6543). The migrate script already enforces this via the `DIRECT_URL` env var.

### Export files not persisted after restart

Check the `exports_data` volume is mounted:
```bash
docker volume inspect signalkit_exports_data
```

The volume persists across container restarts. It only disappears if you run `docker compose down -v` (removes volumes).
