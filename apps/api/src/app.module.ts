import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsModule } from './permissions/permissions.module';
import { PermissionsGuard } from './permissions/guards/permissions.guard';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { SettingsModule } from './settings/settings.module';
import { ProjectsModule } from './projects/projects.module';
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
    AuthModule,
    UsersModule,
    WorkspacesModule,
    SettingsModule,
    ProjectsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
