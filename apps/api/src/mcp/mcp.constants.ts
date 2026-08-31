import type { Permission } from '@signalkit/shared';

/**
 * MCP scopes are existing RBAC `Permission` strings, not a parallel
 * vocabulary. Phase A1 granted only the read-only subset a `viewer` role
 * already holds; Phase B adds the write/execute permissions the operator
 * tool loop needs (create/discover/generate/approve/export) — each MCP tool
 * still re-checks the caller's live role via PermissionsService on top of
 * this grant, so a session can never do more than its connecting user's
 * actual workspace role allows.
 */
export const MCP_SUPPORTED_SCOPES: Permission[] = [
  'workspace:read',
  'project:read',
  'project:create',
  'project:update',
  'niche:read',
  'niche:discover',
  'pack:read',
  'pack:edit',
  'pack:generate',
  'pack:approve',
  'comment:create',
  'export:read',
  'export:create',
];

export const MCP_ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h
export const MCP_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d
export const MCP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90d — revocation window, independent of token exp
export const MCP_AUTH_CODE_TTL_SECONDS = 5 * 60; // 5min, single-use

export function isSupportedScope(scope: string): scope is Permission {
  return (MCP_SUPPORTED_SCOPES as string[]).includes(scope);
}

/** Parses an OAuth `scope` request parameter, defaulting to every supported scope when omitted. */
export function parseRequestedScopes(scope: string | undefined | null): Permission[] {
  if (!scope || !scope.trim()) return [...MCP_SUPPORTED_SCOPES];
  const requested = scope.split(/\s+/).filter(Boolean);
  const unknown = requested.filter((s) => !isSupportedScope(s));
  if (unknown.length > 0) {
    throw new Error(`Unsupported scope(s): ${unknown.join(', ')}`);
  }
  return requested as Permission[];
}
