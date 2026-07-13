import { Module } from '@nestjs/common';
import { ImplementationProjectsController } from './implementation-projects.controller';
import { ImplementationProjectsService } from './implementation-projects.service';

/**
 * Human decision layer: per-user founder verdicts, readiness badges, the
 * two-gate promotion flow, and the resulting founder-committed
 * ImplementationProjects (with object lineage). AuditService is provided
 * globally (AuditModule) and PrismaService via PrismaModule.
 */
@Module({
  controllers: [ImplementationProjectsController],
  providers: [ImplementationProjectsService],
  exports: [ImplementationProjectsService],
})
export class ImplementationProjectsModule {}
