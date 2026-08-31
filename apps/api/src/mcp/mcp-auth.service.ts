import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Claims on an MCP access token — a JWT signed with the same secret as SignalKit
 * login tokens, distinguished by `aud: 'mcp'` so a normal login token can never
 * be replayed against `/mcp`, and vice versa. */
export interface McpAccessTokenPayload {
  sub: string; // userId
  email: string;
  aud: 'mcp';
  sid: string; // McpClientSession id
  workspaceId: string;
  scope: string; // space-separated scope strings (workspace Permission strings, plus possibly SELF_IMPROVE_SCOPE)
}

export interface McpAuthContext {
  sessionId: string;
  workspaceId: string;
  userId: string;
  /** Workspace Permission strings, plus possibly the platform-superadmin SELF_IMPROVE_SCOPE — not
   * narrowed to Permission[] because that second scope deliberately isn't a workspace Permission. */
  scopes: string[];
  clientName: string;
}

@Injectable()
export class McpAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Verifies the Bearer access token on an `/mcp` request and resolves the live session. */
  async verifyRequest(req: Request): Promise<McpAuthContext> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);

    let payload: McpAccessTokenPayload;
    try {
      payload = this.jwt.verify<McpAccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (payload.aud !== 'mcp' || !payload.sid) {
      throw new UnauthorizedException('Token is not a valid MCP access token');
    }

    const session = await this.prisma.mcpClientSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('MCP session is revoked or expired');
    }

    await this.prisma.mcpClientSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      userId: session.userId,
      scopes: session.scopes,
      clientName: session.clientName,
    };
  }

  async listSessions(workspaceId: string) {
    return this.prisma.mcpClientSession.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        clientName: true,
        clientVersion: true,
        scopes: true,
        userId: true,
        issuedAt: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
      },
    });
  }

  /** Self-service revoke: only the connecting user may revoke their own session. */
  async revokeSession(workspaceId: string, sessionId: string, actorId: string): Promise<void> {
    const session = await this.prisma.mcpClientSession.findFirst({ where: { id: sessionId, workspaceId } });
    if (!session) return;
    if (session.userId !== actorId) {
      throw new ForbiddenException('Only the connecting user can revoke this session');
    }
    await this.prisma.$transaction([
      this.prisma.mcpClientSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }),
      this.prisma.mcpRefreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      workspaceId,
      action: 'mcp.session_revoked',
      actorId,
      subjectType: 'mcp_client_session',
      subjectId: sessionId,
      metadata: { clientName: session.clientName },
    });
  }
}
