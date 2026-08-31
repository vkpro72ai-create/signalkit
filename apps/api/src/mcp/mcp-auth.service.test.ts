import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { McpAuthService, type McpAccessTokenPayload } from './mcp-auth.service';

type Row = Record<string, unknown>;

function makeReq(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

const validPayload: McpAccessTokenPayload = {
  sub: 'user1',
  email: 'founder@example.com',
  aud: 'mcp',
  sid: 'session1',
  workspaceId: 'ws1',
  scope: 'workspace:read pack:read',
};

function makeService(opts: {
  verify?: () => McpAccessTokenPayload;
  session?: Row | null;
} = {}) {
  const session =
    opts.session === undefined
      ? {
          id: 'session1',
          workspaceId: 'ws1',
          userId: 'user1',
          clientName: 'Test Client',
          scopes: ['workspace:read', 'pack:read'],
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }
      : opts.session;

  const prisma = {
    mcpClientSession: {
      findUnique: vi.fn().mockResolvedValue(session),
      update: vi.fn().mockResolvedValue(session),
      findFirst: vi.fn().mockResolvedValue(session),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    mcpRefreshToken: { updateMany: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const jwt = {
    verify: opts.verify ?? vi.fn().mockReturnValue(validPayload),
  } as unknown as JwtService;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  const svc = new McpAuthService(prisma, jwt, audit);
  return { svc, prisma, jwt, audit };
}

describe('McpAuthService.verifyRequest', () => {
  it('rejects a missing bearer token', async () => {
    const { svc } = makeService();
    await expect(svc.verifyRequest(makeReq())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token that fails signature/expiry verification', async () => {
    const { svc } = makeService({
      verify: () => {
        throw new Error('bad signature');
      },
    });
    await expect(svc.verifyRequest(makeReq('Bearer bad-token'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid SignalKit login token that is not an MCP access token (aud mismatch)', async () => {
    const { svc } = makeService({
      verify: () => ({ ...validPayload, aud: undefined }) as unknown as McpAccessTokenPayload,
    });
    await expect(svc.verifyRequest(makeReq('Bearer login-token'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the session no longer exists', async () => {
    const { svc } = makeService({ session: null });
    await expect(svc.verifyRequest(makeReq('Bearer valid'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked session even though the JWT itself is still valid/unexpired', async () => {
    const { svc } = makeService({ session: { id: 'session1', workspaceId: 'ws1', userId: 'user1', clientName: 'x', scopes: [], revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } });
    await expect(svc.verifyRequest(makeReq('Bearer valid'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired session', async () => {
    const { svc } = makeService({ session: { id: 'session1', workspaceId: 'ws1', userId: 'user1', clientName: 'x', scopes: [], revokedAt: null, expiresAt: new Date(Date.now() - 1000) } });
    await expect(svc.verifyRequest(makeReq('Bearer valid'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves the auth context from the DB session (not the JWT claims) and bumps lastSeenAt', async () => {
    const { svc, prisma } = makeService();
    const ctx = await svc.verifyRequest(makeReq('Bearer valid'));
    expect(ctx).toEqual({
      sessionId: 'session1',
      workspaceId: 'ws1',
      userId: 'user1',
      scopes: ['workspace:read', 'pack:read'],
      clientName: 'Test Client',
    });
    expect(prisma.mcpClientSession.update).toHaveBeenCalledWith({
      where: { id: 'session1' },
      data: { lastSeenAt: expect.any(Date) },
    });
  });
});

describe('McpAuthService.revokeSession', () => {
  it('only lets the connecting user revoke their own session', async () => {
    const { svc } = makeService();
    await expect(svc.revokeSession('ws1', 'session1', 'someone-else')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revokes the session and its refresh tokens, and audits it', async () => {
    const { svc, prisma, audit } = makeService();
    await svc.revokeSession('ws1', 'session1', 'user1');
    expect(prisma.mcpClientSession.update).toHaveBeenCalledWith({
      where: { id: 'session1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.mcpRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'mcp.session_revoked', workspaceId: 'ws1', actorId: 'user1' }),
    );
  });

  it('is a no-op for an unknown session', async () => {
    const { svc, prisma } = makeService({ session: null });
    await svc.revokeSession('ws1', 'missing', 'user1');
    expect(prisma.mcpClientSession.update).not.toHaveBeenCalled();
  });
});
