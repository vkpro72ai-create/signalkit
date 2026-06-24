# Security

## Secrets

- No secrets are ever committed. `.env*` is git-ignored except `*.example` files.
- Critical secrets are required at boot in production; the API **fails fast with a clear error** listing what is missing (`findMissingSecrets` in `@signalkit/config`, enforced in `apps/api/src/main.ts`). Required: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY_FOR_LLM_KEYS`.
- Secrets are never logged.

## LLM API keys (BYOK)

- Encrypted at rest using `ENCRYPTION_KEY_FOR_LLM_KEYS`.
- **Never returned to the frontend** — masked display only (e.g. `sk-...AB12`). The `UserLLMConnection` contract carries only `maskedKey`.
- Test-connection, revoke and delete flows exist. Keys can be user-level or workspace-level.

## AuthN / AuthZ

- JWT/session-based auth (Session 2).
- **RBAC by permission, not role.** Guards check fine-grained `Permission`s so the role→permission matrix can change without touching call sites.
- All workspace data is tenant-isolated via `WorkspaceOwned`.

## Audit

Critical actions emit an `AuditLogEvent` (workspace/settings changes, role changes, LLM connection changes, pack generation, approvals, exports, share creation/access, API key lifecycle). Audit metadata is redacted and never contains secrets.

## Transport & platform hardening (Session 13)

- CORS whitelist (`CORS_ORIGINS`), rate limiting, request size limits, secure cookie/session config.
- HTTPS terminated at Caddy with secure headers.

## Data handling & privacy

- Geo is used only with explicit consent and by default stores at most country/region — never precise coordinates (see `PRIVACY_GEO.md`, Session 6).
- Outcome/learning data is private by default; anonymized use only with consent (Session 20).

## Reporting

Security issues should be reported privately to the workspace owner/maintainers before public disclosure.
