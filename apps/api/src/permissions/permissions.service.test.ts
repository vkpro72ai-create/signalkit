import { describe, it, expect, vi } from 'vitest';
import { PermissionsService } from './permissions.service';
import type { PrismaService } from '../prisma/prisma.service';

function makePrisma(member: { role: string; status: string } | null) {
  return {
    workspaceMember: {
      findUnique: vi.fn().mockResolvedValue(member),
    },
  } as unknown as PrismaService;
}

describe('PermissionsService', () => {
  it('returns the role for an active member', async () => {
    const svc = new PermissionsService(makePrisma({ role: 'strategist', status: 'active' }));
    expect(await svc.getRole('u1', 'w1')).toBe('strategist');
  });

  it('treats suspended/non-members as having no role', async () => {
    expect(await new PermissionsService(makePrisma(null)).getRole('u1', 'w1')).toBeNull();
    const suspended = new PermissionsService(makePrisma({ role: 'admin', status: 'suspended' }));
    expect(await suspended.getRole('u1', 'w1')).toBeNull();
  });

  it('checks the shared RBAC matrix for required permissions', async () => {
    const strategist = new PermissionsService(makePrisma({ role: 'strategist', status: 'active' }));
    expect(await strategist.can('u1', 'w1', ['pack:generate'])).toBe(true);
    expect(await strategist.can('u1', 'w1', ['workspace:delete'])).toBe(false);

    const viewer = new PermissionsService(makePrisma({ role: 'viewer', status: 'active' }));
    expect(await viewer.can('u1', 'w1', ['project:read'])).toBe(true);
    expect(await viewer.can('u1', 'w1', ['project:create'])).toBe(false);
  });

  it('denies everything when not a member', async () => {
    const none = new PermissionsService(makePrisma(null));
    expect(await none.can('u1', 'w1', ['workspace:read'])).toBe(false);
  });
});
