import { describe, it, expect, vi } from 'vitest';
import { LlmConnectionsService } from './connections.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CryptoService } from '../crypto/crypto.service';
import type { AuditService } from '../audit/audit.service';

const RAW_KEY = 'sk-proj-SUPER-SECRET-VALUE-123456';

function setup() {
  const created = {
    id: 'conn1',
    workspaceId: 'w1',
    userId: null,
    provider: 'openai',
    label: 'My OpenAI',
    encryptedKey: 'ENCRYPTED_BLOB',
    maskedKey: 'sk-p…3456',
    baseUrl: null,
    status: 'active',
  };
  const prisma = {
    userLLMConnection: {
      create: vi.fn().mockResolvedValue(created),
      findMany: vi.fn().mockResolvedValue([created]),
    },
  } as unknown as PrismaService;
  const crypto = {
    encrypt: vi.fn().mockReturnValue('ENCRYPTED_BLOB'),
    mask: vi.fn().mockReturnValue('sk-p…3456'),
    decrypt: vi.fn(),
  } as unknown as CryptoService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { prisma, crypto, audit, service: new LlmConnectionsService(prisma, crypto, audit) };
}

describe('LlmConnectionsService', () => {
  it('encrypts the key and NEVER returns the encrypted secret', async () => {
    const { service, crypto } = setup();
    const result = await service.connect(
      { workspaceId: 'w1', provider: 'openai', apiKey: RAW_KEY, label: 'My OpenAI' },
      'user1',
    );
    expect(crypto.encrypt).toHaveBeenCalledWith(RAW_KEY);
    expect('encryptedKey' in result).toBe(false);
    expect((result as { maskedKey: string }).maskedKey).toBe('sk-p…3456');
    expect(JSON.stringify(result)).not.toContain(RAW_KEY);
    expect(JSON.stringify(result)).not.toContain('ENCRYPTED_BLOB');
  });

  it('audits the connection without leaking the raw key', async () => {
    const { service, audit } = setup();
    await service.connect(
      { workspaceId: 'w1', provider: 'openai', apiKey: RAW_KEY, label: 'My OpenAI' },
      'user1',
    );
    const call = (audit.record as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as {
      metadata: Record<string, unknown>;
    };
    expect(JSON.stringify(call.metadata)).not.toContain(RAW_KEY);
    expect(call.metadata.maskedKey).toBe('sk-p…3456');
  });

  it('list never exposes encrypted secrets', async () => {
    const { service } = setup();
    const rows = await service.list('w1');
    expect(rows.every((r) => !('encryptedKey' in r))).toBe(true);
  });
});
