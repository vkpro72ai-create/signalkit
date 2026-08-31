import type { Permission } from '@signalkit/shared';

/**
 * MCP scopes are existing RBAC `Permission` strings, not a parallel
 * vocabulary — Phase A1 only ever grants the read-only subset a `viewer`
 * role already holds. Extend when Phase B/C add write/generation tools.
 */
export const MCP_SUPPORTED_SCOPES: Permission[] = ['workspace:read', 'project:read', 'niche:read', 'pack:read'];

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
