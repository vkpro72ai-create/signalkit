import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@signalkit/shared';
import { optionalEnv } from '@signalkit/config';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health endpoints — all public (no auth required).
 *
 * GET /health        — full check: DB + Redis. Used by Caddy upstream health.
 * GET /health/live   — liveness: always 200 if process is running.
 * GET /health/ready  — readiness: DB + Redis must both be reachable.
 *
 * Docker HEALTHCHECK uses /health. Kubernetes liveness/readiness probes
 * would use /health/live and /health/ready respectively.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Full health check (DB + Redis)' })
  async getHealth(): Promise<HealthResponse> {
    const [dbOk, redisOk] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const checks: HealthResponse['checks'] = [
      { name: 'database', status: dbOk ? 'ok' : 'down' },
      { name: 'redis', status: redisOk ? 'ok' : 'down' },
    ];
    const allOk = dbOk && redisOk;
    return {
      status: allOk ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('live')
  @HttpCode(200)
  @ApiOperation({ summary: 'Liveness probe — always 200 if process is running' })
  getLive(): HealthResponse {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.1.0',
      checks: [],
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @HttpCode(200)
  @ApiOperation({ summary: 'Readiness probe — DB and Redis must be reachable' })
  async getReady(): Promise<HealthResponse> {
    const [dbOk, redisOk] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const checks: HealthResponse['checks'] = [
      { name: 'database', status: dbOk ? 'ok' : 'down' },
      { name: 'redis', status: redisOk ? 'ok' : 'down' },
    ];
    const allOk = dbOk && redisOk;
    return {
      status: allOk ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const redisUrl = optionalEnv('REDIS_URL', '');
    if (!redisUrl) return true; // Redis optional in dev; don't fail if not configured

    let client: import('ioredis').default | null = null;
    try {
      const IORedis = (await import('ioredis')).default;
      client = new IORedis(redisUrl, {
        maxRetriesPerRequest: 0,
        connectTimeout: 3000,
        lazyConnect: true,
      });
      await client.connect();
      await client.ping();
      return true;
    } catch {
      return false;
    } finally {
      await client?.quit().catch(() => undefined);
    }
  }
}
