import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RegisterClientDto } from './dto/register-client.dto';

/**
 * RFC 7591 Dynamic Client Registration — public clients only (PKCE, no
 * secret) for A1. Client registration is platform-level, not
 * workspace-scoped (no workspace has been chosen yet), so it is not written
 * to AuditLog (which requires a real workspaceId) — the audit trail starts
 * at consent/token issuance instead, where a workspace is actually granted.
 */
@Injectable()
export class OAuthClientService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterClientDto) {
    const redirectUris = dto.redirect_uris ?? [];
    if (redirectUris.length === 0) {
      throw new BadRequestException({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
    }
    for (const uri of redirectUris) {
      if (!this.isAcceptableRedirectUri(uri)) {
        throw new BadRequestException({
          error: 'invalid_redirect_uri',
          error_description: `Redirect URI must be https (or http://localhost for local testing): ${uri}`,
        });
      }
    }

    const client = await this.prisma.mcpOAuthClient.create({
      data: {
        clientName: dto.client_name ?? 'Unnamed MCP client',
        redirectUris,
        grantTypes: dto.grant_types ?? ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'none',
        softwareId: dto.software_id ?? null,
      },
    });

    return {
      client_id: client.id,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    };
  }

  async findById(clientId: string) {
    return this.prisma.mcpOAuthClient.findUnique({ where: { id: clientId } });
  }

  private isAcceptableRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      if (url.protocol === 'https:') return true;
      if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
      return false;
    } catch {
      return false;
    }
  }
}
