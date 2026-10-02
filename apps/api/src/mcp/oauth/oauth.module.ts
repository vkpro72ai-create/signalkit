import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { WorkspacesModule } from '../../workspaces/workspaces.module';
import { SelfImproveModule } from '../../self-improve/self-improve.module';
import { OAuthMetadataController } from './oauth-metadata.controller';
import { OAuthFlowController } from './oauth-flow.controller';
import { OAuthClientService } from './oauth-client.service';
import { OAuthCodeService } from './oauth-code.service';
import { OAuthTokenService } from './oauth-token.service';
import { OAuthConsentService } from './oauth-consent.service';

/**
 * OAuth 2.1 + PKCE authorization server for the remote MCP endpoint
 * (discovery metadata, Dynamic Client Registration, the browser consent
 * flow, and the token endpoint). PermissionsService/AuditService/
 * PrismaService are provided globally; JwtService and AuthService.login()
 * come from AuthModule — the consent-page mini-login reuses the same
 * credential verification as /auth/login, never duplicates it.
 */
@Module({
  imports: [AuthModule, WorkspacesModule, SelfImproveModule],
  controllers: [OAuthMetadataController, OAuthFlowController],
  providers: [OAuthClientService, OAuthCodeService, OAuthTokenService, OAuthConsentService],
})
export class McpOAuthModule {}
