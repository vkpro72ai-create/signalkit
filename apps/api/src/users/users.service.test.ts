import { describe, it, expect, vi } from 'vitest';
import { UsersService } from './users.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * getMe() backs `firstWorkspaceId()` (apps/web/lib/api.ts), which every page
 * calls independently to resolve "the current workspace" via
 * `memberships[0]`. Without a deterministic order, a user with 2+ workspace
 * memberships (easy to end up with via POST /workspaces) gets a different
 * "first" workspace on every request — different pages show different
 * projects, and a pack created under one workspace 404s when the next page
 * re-resolves a different one and looks like generation "reset".
 */
describe('UsersService.getMe', () => {
  it('orders memberships deterministically (oldest first), not by arbitrary DB return order', async () => {
    const older = {
      workspace: { id: 'ws-older', name: 'Older Lab', settings: { billingPlan: 'free' } },
      role: 'owner',
      createdAt: new Date('2026-01-01'),
    };
    const newer = {
      workspace: { id: 'ws-newer', name: 'Newer Lab', settings: { billingPlan: 'free' } },
      role: 'owner',
      createdAt: new Date('2026-06-01'),
    };

    const prisma = {
      user: {
        findUnique: vi.fn(({ include }: { include: { memberships: { orderBy?: unknown } } }) => {
          // Simulate what an orderBy actually does — a mock that ignores it
          // would let this test pass even if the implementation dropped it.
          const rows = [newer, older]; // DB returns them in an arbitrary order
          const ordered = include.memberships.orderBy ? [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) : rows;
          return Promise.resolve({
            id: 'u1', email: 'test@signalkit.dev', passwordHash: 'x', settings: null,
            memberships: ordered,
          });
        }),
      },
    } as unknown as PrismaService;

    const svc = new UsersService(prisma);
    const me = await svc.getMe('u1');

    expect(me.memberships[0]!.workspace.id).toBe('ws-older');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          memberships: expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
        }),
      }),
    );
  });
});
