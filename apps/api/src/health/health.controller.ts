import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@signalkit/shared';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness/readiness endpoint. Public. Reports a DB sub-check; redis/storage
 * checks are added as those subsystems come online (Session 7 / Session 13).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  async getHealth(): Promise<HealthResponse> {
    const checks: HealthResponse['checks'] = [];
    let dbOk = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }
    checks.push({ name: 'database', status: dbOk ? 'ok' : 'down' });

    return {
      status: dbOk ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
