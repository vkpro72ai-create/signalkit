import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { OAuthCodeService } from './oauth-code.service';
import { hashToken } from './oauth-crypto.util';

type Row = Record<string, unknown>;

function makeService(record: Row | null) {
  const created: Row[] = [];
  const prisma = {
    mcpAuthorizationCode: {
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        created.push(data);
        return Promise.resolve({ id: 'code1', ...data });
      }),
      findUnique: vi.fn().mockResolvedValue(record),
      update: vi.fn().mockResolvedValue(record),
    },
  } as unknown as PrismaService;
  const svc = new OAuthCodeService(prisma);
  return { svc, prisma, created };
}

describe('OAuthCodeService.issueCode', () => {
  it('never persists the raw code — only its hash', async () => {
    const { svc, created } = makeService(null);
    const raw = await svc.issueCode({
      clientId: 'client1',
      workspaceId: 'ws1',
      userId: 'user1',
      redirectUri: 'https://client.example/callback',
      codeChallenge: 'abc',
      codeChallengeMethod: 'S256',
      scopes: ['workspace:read'],
    });
    expect(created[0].codeHash).toBe(hashToken(raw));
    expect(created[0]).not.toHaveProperty('code');
  });
});

describe('OAuthCodeService.consumeCode', () => {
  const validRecord: Row = {
    id: 'code1',
    clientId: 'client1',
    redirectUri: 'https://client.example/callback',
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    codeChallenge: 'abc',
    codeChallengeMethod: 'S256',
  };

  it('rejects an unknown code', async () => {
    const { svc } = makeService(null);
    await expect(svc.consumeCode('raw', 'client1', 'https://client.example/callback')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an already-consumed code (single use)', async () => {
    const { svc } = makeService({ ...validRecord, consumedAt: new Date() });
    await expect(svc.consumeCode('raw', 'client1', 'https://client.example/callback')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired code', async () => {
    const { svc } = makeService({ ...validRecord, expiresAt: new Date(Date.now() - 1000) });
    await expect(svc.consumeCode('raw', 'client1', 'https://client.example/callback')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a redirect_uri that does not match the one bound at issuance', async () => {
    const { svc } = makeService(validRecord);
    await expect(svc.consumeCode('raw', 'client1', 'https://attacker.example/callback')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a client_id mismatch', async () => {
    const { svc } = makeService(validRecord);
    await expect(svc.consumeCode('raw', 'someone-elses-client', 'https://client.example/callback')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('marks the code consumed on success so it cannot be replayed', async () => {
    const { svc, prisma } = makeService(validRecord);
    await svc.consumeCode('raw', 'client1', 'https://client.example/callback');
    expect(prisma.mcpAuthorizationCode.update).toHaveBeenCalledWith({
      where: { id: 'code1' },
      data: { consumedAt: expect.any(Date) },
    });
  });
});
