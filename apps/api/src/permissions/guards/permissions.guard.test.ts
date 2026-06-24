import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { PermissionsService } from '../permissions.service';

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(required: string[] | undefined): Reflector {
  return { getAllAndOverride: vi.fn().mockReturnValue(required) } as unknown as Reflector;
}

describe('PermissionsGuard', () => {
  it('allows routes without permission metadata', async () => {
    const guard = new PermissionsGuard(makeReflector(undefined), {} as PermissionsService);
    const ok = await guard.canActivate(makeContext({ user: { sub: 'u1' }, params: {} }));
    expect(ok).toBe(true);
  });

  it('resolves workspaceId from :id param and allows when permitted', async () => {
    const permissions = { can: vi.fn().mockResolvedValue(true) } as unknown as PermissionsService;
    const guard = new PermissionsGuard(makeReflector(['workspace:update']), permissions);
    const ok = await guard.canActivate(
      makeContext({ user: { sub: 'u1' }, params: { id: 'w1' }, body: {}, query: {} }),
    );
    expect(ok).toBe(true);
    expect(permissions.can).toHaveBeenCalledWith('u1', 'w1', ['workspace:update']);
  });

  it('forbids when the user lacks the permission', async () => {
    const permissions = { can: vi.fn().mockResolvedValue(false) } as unknown as PermissionsService;
    const guard = new PermissionsGuard(makeReflector(['workspace:delete']), permissions);
    await expect(
      guard.canActivate(
        makeContext({ user: { sub: 'u1' }, params: { id: 'w1' }, body: {}, query: {} }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids when no workspace context can be resolved', async () => {
    const permissions = { can: vi.fn() } as unknown as PermissionsService;
    const guard = new PermissionsGuard(makeReflector(['workspace:read']), permissions);
    await expect(
      guard.canActivate(makeContext({ user: { sub: 'u1' }, params: {}, body: {}, query: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
