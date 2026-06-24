# Deployment Overview

The full production deployment runbook is built in Session 13 (`DEPLOY_HETZNER.md`). This is the high-level picture.

## Target

Self-hosted on **Hetzner** via Docker Compose, fronted by **Caddy** (HTTPS, secure headers, reverse proxy, upload limits).

## Services

| Service | Role |
| --- | --- |
| `web` | Next.js web app |
| `api` | NestJS API |
| `worker` | BullMQ queue workers (ingestion, generation, exports) |
| `postgres` | Primary database (Prisma migrations) |
| `redis` | Queue + cache backing store |
| `minio` | S3-compatible object storage for export artifacts |
| `caddy` | TLS termination + reverse proxy |

## Environments

- `.env.example` per app for local development.
- `.env.production.example` (Session 13) documents production secrets: `DATABASE_URL`, `REDIS_URL`, `STORAGE_*`, `JWT_SECRET`, `ENCRYPTION_KEY_FOR_LLM_KEYS`, `WEB_URL`, `API_URL`, `CORS_ORIGINS`, `OPENROUTER_BASE_URL`, optional provider keys.

## CI/CD

GitHub Actions:
- **CI**: install → lint → typecheck → test → build.
- **Deploy**: SSH to Hetzner → pull → build → run migrations → restart → health check, with rollback notes.

## Mobile

Expo / EAS produces an Android **APK** (not only AAB) via GitHub Actions, with an iOS-ready configuration (Session 14, `MOBILE_BUILD.md`).

## Operations

Health endpoints (`/health`), worker/queue health, structured logs, error logging, Postgres + storage backup scripts with documented restore and retention.
