import { describe, it, expect, vi } from 'vitest';
import { SettingsService } from './settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

describe('SettingsService', () => {
  it('audits workspace settings updates with the changed keys', async () => {
    const prisma = {
      workspaceSettings: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws1', workspaceId: 'w1' }),
        update: vi.fn().mockResolvedValue({ id: 'ws1', workspaceId: 'w1', brandName: 'Acme' }),
      },
    } as unknown as PrismaService;
    const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

    const svc = new SettingsService(prisma, audit);
    await svc.updateWorkspaceSettings('w1', { brandName: 'Acme' }, 'actor1');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w1',
        action: 'workspace.settings_updated',
        actorId: 'actor1',
        metadata: { changedKeys: ['brandName'] },
      }),
    );
  });

  it('creates default user settings when none exist', async () => {
    const created = { userId: 'u1', interfaceLocale: 'en' };
    const prisma = {
      userSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    } as unknown as PrismaService;
    const audit = { record: vi.fn() } as unknown as AuditService;

    const svc = new SettingsService(prisma, audit);
    expect(await svc.getUserSettings('u1')).toEqual(created);
  });

  it('creates default workspace settings when none exist (workspaces created before this feature never got a settings row)', async () => {
    const created = { id: 'ws1', workspaceId: 'w1', aiEngineName: null };
    const prisma = {
      workspaceSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    } as unknown as PrismaService;
    const audit = { record: vi.fn() } as unknown as AuditService;

    const svc = new SettingsService(prisma, audit);
    expect(await svc.getWorkspaceSettings('w1')).toEqual(created);
  });
});
