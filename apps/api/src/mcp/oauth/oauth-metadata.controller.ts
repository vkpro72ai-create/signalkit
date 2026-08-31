import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { optionalEnv } from '@signalkit/config';
import { Public } from '../../auth/decorators/public.decorator';
import { MCP_SUPPORTED_SCOPES } from '../mcp.constants';
import { OAuthClientService } from './oauth-client.service';
import { RegisterClientDto } from './dto/register-client.dto';

/** Resolves this server's own public origin — prefer the explicit env var behind
 * a reverse proxy (Caddy in production); fall back to the request for local dev. */
function resolveIssuer(req: Request): string {
  const configured = optionalEnv('MCP_PUBLIC_URL', '');
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** OAuth 2.1 discovery metadata + Dynamic Client Registration. All public — this
 * is how a remote MCP client bootstraps auth before it has any credential. */
@ApiExcludeController()
@Controller()
export class OAuthMetadataController {
  constructor(private readonly clients: OAuthClientService) {}

  @Public()
  @Get('.well-known/oauth-protected-resource')
  protectedResourceMetadata(@Req() req: Request) {
    const issuer = resolveIssuer(req);
    return {
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
    };
  }

  @Public()
  @Get('.well-known/oauth-authorization-server')
  authorizationServerMetadata(@Req() req: Request) {
    const issuer = resolveIssuer(req);
    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/register`,
      scopes_supported: MCP_SUPPORTED_SCOPES,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    };
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterClientDto) {
    return this.clients.register(dto);
  }
}
