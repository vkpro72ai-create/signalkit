import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import { OAuthTokenService } from './oauth-token.service';
import { hashToken } from './oauth-crypto.util';

type Row = Record<string, unknown>;

function makeService(opts: { refreshTokenRow?: Row | null; session?: Row | null } = {}) {
  const createdSessions: Row[] = [];
  const createdRefreshTokens: Row[] = [];
  const updatedRefreshTokens: Row[] = [];

  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ email: 'founder@example.com' }) },
    mcpClientSession: {
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        const row = { id: 'session1', ...data };
        createdSessions.push(row);
        return Promise.resolve(row);
      }),
      findUnique: vi.fn().mockResolvedValue(
        opts.session === undefined
          ? { id: 'session1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }
          : opts.session,
      ),
      update: vi.fn(),
    },
    mcpRefreshToken: {
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        createdRefreshTokens.push(data);
        return Promise.resolve({ id: 'rt1', ...data });
      }),
      findUnique: vi.fn().mockResolvedValue(
        opts.refreshTokenRow === undefined
          ? {
              id: 'rt1',
              tokenHash: 'x',
              clientId: 'client1',
              workspaceId: 'ws1',
              userId: 'user1',
              sessionId: 'session1',
              scopes: ['workspace:read'],
              revokedAt: null,
              expiresAt: new Date(Date.now() + 60_000),
            }
          : opts.refreshTokenRow,
      ),
      update: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        updatedRefreshTokens.push(data);
        return Promise.resolve(data);
      }),
    },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const jwt = { sign: vi.fn().mockReturnValue('signed-jwt') } as unknown as JwtService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  const svc = new OAuthTokenService(prisma, jwt, audit);
  return { svc, prisma, jwt, audit, createdSessions, createdRefreshTokens, updatedRefreshTokens };
}

describe('OAuthTokenService.issueForNewSession', () => {
  it('creates exactly one McpClientSession per authorization-code grant and audits it', async () => {
    const { svc, createdSessions, audit } = makeService();
    const tokens = await svc.issueForNewSession({
      clientId: 'client1',
      clientName: 'Test Client',
      workspaceId: 'ws1',
      userId: 'user1',
      scopes: ['workspace:read', 'pack:read'],
    });
    expect(createdSessions).toHaveLength(1);
    expect(createdSessions[0]).toMatchObject({ workspaceId: 'ws1', userId: 'user1', clientId: 'client1' });
    expect(tokens).toMatchObject({ access_token: 'signed-jwt', token_type: 'Bearer', scope: 'workspace:read pack:read' });
    expect(tokens.refresh_token).toBeTruthy();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'mcp.session_created', workspaceId: 'ws1' }));
  });

  it('never persists the raw refresh token — only its hash', async () => {
    const { svc, createdRefreshTokens } = makeService();
    const tokens = await svc.issueForNewSession({
      clientId: 'client1',
      clientName: 'Test Client',
      workspaceId: 'ws1',
      userId: 'user1',
      scopes: ['workspace:read'],
    });
    expect(createdRefreshTokens[0].tokenHash).toBe(hashToken(tokens.refresh_token));
  });
});

describe('OAuthTokenService.refresh', () => {
  it('rejects an unknown refresh token', async () => {
    const { svc } = makeService({ refreshTokenRow: null });
    await expect(svc.refresh('raw', 'client1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked refresh token', async () => {
    const { svc } = makeService({
      refreshTokenRow: { id: 'rt1', tokenHash: 'x', clientId: 'client1', workspaceId: 'ws1', userId: 'user1', sessionId: 'session1', scopes: [], revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    });
    await expect(svc.refresh('raw', 'client1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a client_id mismatch', async () => {
    const { svc } = makeService();
    await expect(svc.refresh('raw', 'someone-elses-client')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the underlying session has been revoked', async () => {
    const { svc } = makeService({ session: { id: 'session1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } });
    await expect(svc.refresh('raw', 'client1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates the refresh token: revokes the old one and issues a new one bound to the same session', async () => {
    const { svc, updatedRefreshTokens, createdRefreshTokens } = makeService();
    const tokens = await svc.refresh('raw', 'client1');
    expect(updatedRefreshTokens[0]).toMatchObject({ revokedAt: expect.any(Date) });
    expect(createdRefreshTokens[0]).toMatchObject({ sessionId: 'session1' });
    expect(tokens.access_token).toBe('signed-jwt');
  });
});
