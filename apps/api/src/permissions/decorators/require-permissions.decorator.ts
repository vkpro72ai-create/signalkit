import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@signalkit/shared';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';

/**
 * Declares the workspace permissions a route requires. The PermissionsGuard
 * resolves the caller's role in the target workspace and checks the shared
 * role → permission matrix.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
