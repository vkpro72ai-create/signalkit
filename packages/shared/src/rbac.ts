/**
 * Canonical role → permission matrix.
 *
 * This is the single source of truth for authorization, consumed by the API's
 * RBAC guard and (later) the web `PermissionGate`. Guards check permissions,
 * never raw roles, so this matrix can evolve without touching call sites.
 */
import type { Permission, WorkspaceRole } from './core.js';

/** Every permission an owner implicitly holds (the full set). */
const ALL_PERMISSIONS: Permission[] = [
  'workspace:read',
  'workspace:update',
  'workspace:delete',
  'workspace:manage_members',
  'workspace:manage_billing',
  'workspace:manage_white_label',
  'project:create',
  'project:read',
  'project:update',
  'project:delete',
  'niche:discover',
  'niche:read',
  'pack:generate',
  'pack:read',
  'pack:edit',
  'pack:approve',
  'export:create',
  'export:read',
  'llm:manage_connections',
  'llm:manage_settings',
  'source:manage',
  'audit:read',
  'comment:create',
  'share:manage',
];

/** Read-only baseline shared by viewer-type roles. */
const READ_ONLY: Permission[] = [
  'workspace:read',
  'project:read',
  'niche:read',
  'pack:read',
  'export:read',
];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((p) => p !== 'workspace:delete'),
  strategist: [
    'workspace:read',
    'project:create',
    'project:read',
    'project:update',
    'niche:discover',
    'niche:read',
    'pack:generate',
    'pack:read',
    'pack:edit',
    'pack:approve',
    'export:create',
    'export:read',
    'llm:manage_settings',
    'source:manage',
    'comment:create',
    'share:manage',
  ],
  product_manager: [
    'workspace:read',
    'project:create',
    'project:read',
    'project:update',
    'niche:discover',
    'niche:read',
    'pack:generate',
    'pack:read',
    'pack:edit',
    'pack:approve',
    'export:create',
    'export:read',
    'source:manage',
    'comment:create',
  ],
  designer: [...READ_ONLY, 'pack:edit', 'comment:create', 'export:create'],
  engineer: [...READ_ONLY, 'pack:edit', 'comment:create', 'export:create'],
  growth: [...READ_ONLY, 'comment:create', 'export:create'],
  viewer: READ_ONLY,
  client_viewer: ['pack:read', 'export:read'],
};

/** Does the given role hold the given permission? */
export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Does the role hold every permission in the list? */
export function roleHasAllPermissions(
  role: WorkspaceRole,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((p) => roleHasPermission(role, p));
}

/** Resolve the full permission set for a role. */
export function permissionsForRole(role: WorkspaceRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
