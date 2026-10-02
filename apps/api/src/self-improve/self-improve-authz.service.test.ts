import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WORKSPACE_ROLES, ROLE_PERMISSIONS } from '@signalkit/shared';
import { SelfImproveAuthzService } from './self-improve-authz.service';
import { SELF_IMPROVE_SCOPE } from '../mcp/mcp.constants';

const ENV_KEY = 'SELF_IMPROVEMENT_SUPERADMIN_USER_IDS';

describe('SelfImproveAuthzService', () => {
  const original = process.env[ENV_KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('denies everyone when the allowlist is unset (fail closed, not fail open)', () => {
    delete process.env[ENV_KEY];
    const svc = new SelfImproveAuthzService();
    expect(svc.isSuperadmin('user1')).toBe(false);
  });

  it('grants only users explicitly on the allowlist', () => {
    process.env[ENV_KEY] = 'user1,user2';
    const svc = new SelfImproveAuthzService();
    expect(svc.isSuperadmin('user1')).toBe(true);
    expect(svc.isSuperadmin('user2')).toBe(true);
    expect(svc.isSuperadmin('user3')).toBe(false);
  });

  it('trims whitespace around comma-separated ids', () => {
    process.env[ENV_KEY] = ' user1 , user2 ';
    const svc = new SelfImproveAuthzService();
    expect(svc.isSuperadmin('user1')).toBe(true);
    expect(svc.isSuperadmin('user2')).toBe(true);
  });
});

describe('signalkit:self:propose is never a workspace RBAC permission', () => {
  it('no WorkspaceRole (owner, admin, strategist, product_manager, ...) grants SELF_IMPROVE_SCOPE — it is not a Permission at all', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(SELF_IMPROVE_SCOPE);
    }
  });
});
