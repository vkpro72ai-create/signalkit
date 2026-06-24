/**
 * Shared API contracts: request/response DTOs and route constants used by both
 * the API and its clients (web/mobile). Kept transport-agnostic.
 */
import type { User, Workspace, WorkspaceSettings, UserSettings, WorkspaceRole } from './core.js';
import type { AuditLogEvent } from './billing.js';
import type { Paginated } from './common.js';

/** Health check response. */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  /** Sub-system checks (db, redis, storage). */
  checks: { name: string; status: 'ok' | 'down' }[];
  timestamp: string;
}

/** GET /me */
export interface MeResponse {
  user: User;
  settings: UserSettings;
  memberships: { workspace: Workspace; role: WorkspaceRole }[];
}

/** POST /workspaces */
export interface CreateWorkspaceRequest {
  name: string;
  slug?: string;
}

/** PUT /workspaces/:id/settings */
export type UpdateWorkspaceSettingsRequest = Partial<
  Omit<WorkspaceSettings, 'workspaceId'>
>;

/** PUT /users/:id/settings */
export type UpdateUserSettingsRequest = Partial<Omit<UserSettings, 'userId'>>;

/** GET /audit */
export type AuditListResponse = Paginated<AuditLogEvent>;

/**
 * Canonical REST route templates. Centralized so web/mobile clients and the API
 * agree on paths. `:param` placeholders are substituted by the caller.
 */
export const API_ROUTES = {
  health: '/health',
  me: '/me',
  workspaces: '/workspaces',
  workspace: '/workspaces/:id',
  workspaceSettings: '/workspaces/:id/settings',
  userSettings: '/users/:id/settings',
  audit: '/audit',
} as const;

export type ApiRouteKey = keyof typeof API_ROUTES;
