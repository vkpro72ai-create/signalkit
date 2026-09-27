# infra/docker

## `Dockerfile.api` — production API image

Build context is the repository root:

```bash
docker build -f infra/docker/Dockerfile.api -t signalkit-api .
```

Runtime configuration is env-only (nothing secret is baked into the image):

| Variable                      | Required | Notes                                   |
| ----------------------------- | -------- | --------------------------------------- |
| `DATABASE_URL`                | yes      | PostgreSQL                              |
| `REDIS_URL`                   | yes      |                                         |
| `JWT_SECRET`                  | yes      |                                         |
| `ENCRYPTION_KEY_FOR_LLM_KEYS` | yes      |                                         |
| `CORS_ORIGINS`                | yes      | comma-separated origins                 |
| `PORT` / `HOST`               | no       | default `4000` / `0.0.0.0`              |
| `RUN_MIGRATIONS`              | no       | `true` runs `prisma migrate deploy` first |

Health check: `GET /health` on port 4000.

Migrations — preferably a release step with the same image:

```bash
docker run --rm -e DATABASE_URL=... signalkit-api \
  node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
```

### How the build resolves workspace packages

The API compiles to CommonJS (NestJS); `@signalkit/*` packages are ESM-only
and export their build under the `default` condition. The API loads them with
Node's native `require(esm)` — hence Node >= 22.12. `pnpm --filter
@signalkit/api build` builds the API's workspace dependencies and the Prisma
client first, and its `postbuild` step `require()`s every `@signalkit/*`
dependency to prove runtime resolution before an image is produced.
