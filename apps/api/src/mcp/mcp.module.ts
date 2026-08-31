import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ProjectsModule } from '../projects/projects.module';
import { NichesModule } from '../niches/niches.module';
import { PacksModule } from '../packs/packs.module';
import { ImplementationProjectsModule } from '../implementation-projects/implementation-projects.module';
import { McpController } from './mcp.controller';
import { McpAuthService } from './mcp-auth.service';
import { McpServerService } from './mcp-server.service';
import { McpToolsService } from './mcp-tools.service';
import { McpOAuthModule } from './oauth/oauth.module';

/**
 * Remote MCP server (Phase A1, read-only). PermissionsService/AuditService
 * are provided globally; JwtService comes from AuthModule (same secret as
 * SignalKit login — MCP tokens are distinguished by an `aud: 'mcp'` claim,
 * never by a separate signer).
 */
@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    NichesModule,
    PacksModule,
    ImplementationProjectsModule,
    McpOAuthModule,
  ],
  controllers: [McpController],
  providers: [McpAuthService, McpServerService, McpToolsService],
})
export class McpModule {}
