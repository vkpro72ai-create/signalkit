# infra/

Infrastructure for SignalKit. Most contents are implemented in **Session 13** (Hetzner production deployment); Session 1 establishes the structure.

```
infra/
  docker/          Dockerfiles + docker-compose.production.yml (Session 13)
  caddy/           Caddyfile: HTTPS, reverse proxy, secure headers (Session 13)
  scripts/         Deploy, migrate, backup/restore scripts (Session 13)
  github-actions/  Reusable workflow fragments (Session 13)
```

The active CI workflow lives at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
