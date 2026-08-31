import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Permission } from '@signalkit/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { McpAccessTokenPayload } from '../mcp-auth.service';
import {
  MCP_ACCESS_TOKEN_TTL_SECONDS,
  MCP_REFRESH_TOKEN_TTL_SECONDS,
  MCP_SESSION_TTL_SECONDS,
} from '../mcp.constants';
import { generateOpaqueToken, hashToken } from './oauth-crypto.util';

export interface TokenSet {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

@Injectable()
export class OAuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Authorization-code exchange: creates a NEW McpClientSession (one per grant). */
  async issueForNewSession(input: {
    clientId: string;
    clientName: string;
    workspaceId: string;
    userId: string;
    scopes: Permission[];
  }): Promise<TokenSet> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { email: true } });

    const session = await this.prisma.mcpClientSession.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        clientId: input.clientId,
        clientName: input.clientName,
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + MCP_SESSION_TTL_SECONDS * 1000),
      },
    });

    await this.audit.record({
      workspaceId: input.workspaceId,
      action: 'mcp.session_created',
      actorId: input.userId,
      subjectType: 'mcp_client_session',
      subjectId: session.id,
      metadata: { clientName: input.clientName, scopes: input.scopes },
    });

    return this.mintTokenSet({
      sessionId: session.id,
      clientId: input.clientId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      email: user.email,
      scopes: input.scopes,
    });
  }

  /** Refresh-token grant: rotates the refresh token (revoke old, issue new) bound to the same session. */
  async refresh(rawRefreshToken: string, clientId: string): Promise<TokenSet> {
    const tokenHash = hashToken(rawRefreshToken);
    const record = await this.prisma.mcpRefreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now() || record.clientId !== clientId) {
      throw new UnauthorizedException('Invalid, expired or revoked refresh token');
    }

    const session = await this.prisma.mcpClientSession.findUnique({ where: { id: record.sessionId } });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('The connection this refresh token belongs to has been revoked');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId }, select: { email: true } });

    await this.prisma.$transaction([
      this.prisma.mcpRefreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } }),
      this.prisma.mcpClientSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }),
    ]);

    return this.mintTokenSet({
      sessionId: session.id,
      clientId,
      workspaceId: record.workspaceId,
      userId: record.userId,
      email: user.email,
      scopes: record.scopes as Permission[],
    });
  }

  private async mintTokenSet(input: {
    sessionId: string;
    clientId: string;
    workspaceId: string;
    userId: string;
    email: string;
    scopes: Permission[];
  }): Promise<TokenSet> {
    const scope = input.scopes.join(' ');
    const accessPayload: McpAccessTokenPayload = {
      sub: input.userId,
      email: input.email,
      aud: 'mcp',
      sid: input.sessionId,
      workspaceId: input.workspaceId,
      scope,
    };
    const access_token = this.jwt.sign(accessPayload, { expiresIn: MCP_ACCESS_TOKEN_TTL_SECONDS });

    const rawRefreshToken = generateOpaqueToken();
    await this.prisma.mcpRefreshToken.create({
      data: {
        tokenHash: hashToken(rawRefreshToken),
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        sessionId: input.sessionId,
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + MCP_REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: MCP_ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: rawRefreshToken,
      scope,
    };
  }
}
