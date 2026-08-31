import { Injectable } from '@nestjs/common';
import { optionalEnv } from '@signalkit/config';

/**
 * The self-improvement trust boundary is deliberately NOT workspace RBAC.
 * No WorkspaceRole (owner/admin/strategist/...) grants this — it changes
 * SignalKit itself, not one workspace. The only source of truth is a stable
 * platform-superadmin user-ID allowlist, set via env (an ops/deploy action,
 * not anything reachable through the product API).
 */
@Injectable()
export class SelfImproveAuthzService {
  private allowlist(): Set<string> {
    return new Set(
      optionalEnv('SELF_IMPROVEMENT_SUPERADMIN_USER_IDS', '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  isSuperadmin(userId: string): boolean {
    return this.allowlist().has(userId);
  }
}
