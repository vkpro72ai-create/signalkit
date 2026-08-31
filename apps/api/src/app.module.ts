import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsModule } from './permissions/permissions.module';
import { PermissionsGuard } from './permissions/guards/permissions.guard';
import { AuditModule } from './audit/audit.module';
import { CryptoModule } from './crypto/crypto.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { SettingsModule } from './settings/settings.module';
import { ProjectsModule } from './projects/projects.module';
import { GeoModule } from './geo/geo.module';
import { LlmModule } from './llm/llm.module';
import { SourcesModule } from './sources/sources.module';
import { EvidenceModule } from './evidence/evidence.module';
import { NichesModule } from './niches/niches.module';
import { PacksModule } from './packs/packs.module';
import { ImplementationProjectsModule } from './implementation-projects/implementation-projects.module';
import { ExportsModule } from './exports/exports.module';
import { McpModule } from './mcp/mcp.module';
import { SelfImproveModule } from './self-improve/self-improve.module';
import { HealthController } from './health/health.controller';

/**
 * Root module. Auth is enforced globally (JwtAuthGuard) with @Public opt-out,
 * and RBAC is enforced globally (PermissionsGuard) via @RequirePermissions.
 * Guard order matters: authentication runs before authorization.
 */
@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    AuditModule,
    CryptoModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    SettingsModule,
    ProjectsModule,
    GeoModule,
    LlmModule,
    SourcesModule,
    EvidenceModule,
    NichesModule,
    PacksModule,
    ImplementationProjectsModule,
    ExportsModule,
    SelfImproveModule,
    McpModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
