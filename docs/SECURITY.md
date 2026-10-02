# SignalKit — Security Reference

Security principles, controls, and production hardening guide.

---

## Core Security Laws

These are enforced in code and must never be violated:

1. **No secrets in client bundle.** `NEXT_PUBLIC_*` vars are baked into the browser bundle. Never put JWT secrets, encryption keys, or API keys in `NEXT_PUBLIC_*`.
2. **No raw LLM keys returned.** LLM provider API keys are encrypted at rest (AES-256-GCM via `CryptoModule`). They are never returned to the client, even to the workspace owner.
3. **No secrets in logs.** The API bootstrap logs missing secret *names*, never their values. Services that receive keys (LLM, crypto) must not log them.
4. **No secrets in exports.** Export renderers strip provider credentials, JWT secrets, and encryption keys from all output formats.
5. **No secrets baked into Docker images.** All secrets come from environment variables at runtime. Dockerfiles contain no hardcoded secrets.
6. **CORS locked to known origins.** In production, `CORS_ORIGINS` must be a comma-separated list of HTTPS origins. Never use `*` in production.

---

## Authentication

- JWT-based authentication with `@nestjs/jwt`
- Global `JwtAuthGuard` protects all routes by default
- Routes opt out with `@Public()` decorator (only `/health`, `/health/live`, `/health/ready`, `/auth/login`, `/auth/register`)
- Tokens expire based on `JWT_EXPIRES_IN` (default: 7 days)
- `JWT_SECRET` must be at least 32 characters; generate with `openssl rand -hex 32`

---

## Authorization (RBAC)

- Global `PermissionsGuard` enforces workspace-level RBAC
- Roles: `owner`, `admin`, `strategist`, `product_manager`, `designer`, `engineer`, `viewer`
- Permissions are checked per-endpoint via `@RequirePermissions()` decorator
- Users cannot access resources from workspaces they do not belong to
- Export downloads are RBAC-protected — the API verifies workspace membership before streaming any file

---

## LLM API Key Encryption

- BYOK (Bring Your Own Key) model: workspace owners provide their own LLM provider keys
- Keys are encrypted with AES-256-GCM before storage using `ENCRYPTION_KEY_FOR_LLM_KEYS`
- The encryption key must be exactly 32 bytes (64 hex chars)
- Encrypted keys are never returned in API responses (write-only in the UI)
- LLM calls go through `LlmRouterService` only — direct provider calls from feature modules are forbidden

---

## Export File Security

- Export files are written to a mounted Docker volume, not a public-facing directory
- Files are not served directly via static URL — they require authenticated API download
- The download endpoint (`GET /workspaces/:wsId/exports/:exportId/download`) verifies:
  - Valid JWT
  - User belongs to the workspace
  - Export job status is `ready`
- Export content is sanitized: no API keys, no encryption secrets, no internal credentials

---

## Network Security

- Only Caddy (ports 80/443) is publicly exposed
- API (4000) and Web (3000) communicate on the internal `signalkit` Docker network only
- Redis (6379) is internal only, password-protected
- UFW firewall allows only 22, 80, 443 (see `hetzner-bootstrap.sh`)
- fail2ban protects SSH against brute force

---

## HTTP Security Headers (Caddy)

Applied to all responses:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` (web) / `DENY` (api) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-XSS-Protection` | `1; mode=block` |
| `Server` header | Removed |

---

## Geo / Privacy

- Geo is **opt-in only** — the API never collects precise location without explicit consent
- No IP-based geolocation is performed silently
- Market targeting uses country-level data only by default
- See `docs/PRIVACY_GEO.md` for full details

---

## Database Security

- Supabase manages PostgreSQL
- Connection strings are passed via environment variables, never hardcoded
- `DATABASE_URL` uses the pooled connection (PgBouncer, port 6543) for runtime queries
- `DIRECT_URL` uses the direct connection (port 5432) for migrations only
- Both URLs must be kept secret; never commit them

---

## Dependency Security

Run periodically:

```bash
pnpm audit
pnpm audit --audit-level=high
```

---

## Secrets Rotation

### JWT Secret rotation

1. Generate a new secret: `openssl rand -hex 32`
2. Update `JWT_SECRET` in `.env.production`
3. Restart the API: `docker compose -f docker-compose.production.yml restart api`
4. All existing tokens are immediately invalidated — users must re-login

### Encryption key rotation (LLM keys)

Rotating `ENCRYPTION_KEY_FOR_LLM_KEYS` invalidates all stored BYOK keys:
1. Notify workspace owners to re-enter their LLM provider keys after rotation
2. Update `ENCRYPTION_KEY_FOR_LLM_KEYS` in `.env.production`
3. Restart the API
4. Users re-enter keys which are re-encrypted with the new key

### Redis password rotation

1. Update `REDIS_PASSWORD` in `.env.production`
2. Restart the full stack (Redis and API must agree on the password)

---

## What Is NOT in Supabase

These items require separate backup or protection:

| Item | Location | Risk if lost |
|------|----------|-------------|
| Export artifact files | Docker volume `exports_data` | Exports are re-generable; inconvenient |
| `.env.production` | VPS filesystem | Critical — back up encrypted off-VPS |
| `infra/caddy/Caddyfile` | Git repository | Low — in git |
| Caddy TLS certs | Docker volume `caddy_data` | Low — Caddy auto-renews |

---

## Secrets Management Checklist

- [ ] `.env.production` is in `.gitignore` and never committed
- [ ] All secrets generated with `openssl rand -hex 32`, not hand-typed
- [ ] `CORS_ORIGINS` set to explicit HTTPS origins (not `*`)
- [ ] `NEXT_PUBLIC_API_URL` uses HTTPS in production
- [ ] No secrets printed in logs (review on any new service)
- [ ] BYOK keys validated as non-empty before encryption
- [ ] Export downloads behind RBAC (verified on any new export type)
