import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  RTL_LOCALES,
  WORKSPACE_ROLES,
  REQUIRED_DOCUMENT_TYPES,
  LLM_PROVIDER_TYPES,
  PLAN_TYPES,
  API_ROUTES,
  ROLE_PERMISSIONS,
  roleHasPermission,
} from './index.js';

describe('@signalkit/shared contracts', () => {
  it('exposes the 10 supported locales with English default', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('marks Arabic as RTL', () => {
    expect(RTL_LOCALES).toContain('ar');
  });

  it('defines all nine workspace roles', () => {
    expect(WORKSPACE_ROLES).toHaveLength(9);
    expect(WORKSPACE_ROLES[0]).toBe('owner');
    expect(WORKSPACE_ROLES).toContain('client_viewer');
  });

  it('requires exactly 27 documents in a full pack', () => {
    expect(REQUIRED_DOCUMENT_TYPES).toHaveLength(27);
    // No duplicates.
    expect(new Set(REQUIRED_DOCUMENT_TYPES).size).toBe(27);
  });

  it('supports the eight LLM provider families', () => {
    expect(LLM_PROVIDER_TYPES).toHaveLength(8);
    expect(LLM_PROVIDER_TYPES).toEqual(
      expect.arrayContaining(['openai', 'anthropic', 'openrouter', 'openai_compatible', 'custom']),
    );
  });

  it('defines the five commercial plans', () => {
    expect(PLAN_TYPES).toHaveLength(5);
    expect(PLAN_TYPES).toContain('enterprise');
  });

  it('centralizes core API routes', () => {
    expect(API_ROUTES.me).toBe('/me');
    expect(API_ROUTES.workspaceSettings).toBe('/workspaces/:id/settings');
  });

  it('defines a permission set for every role', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it('grants owner full power and gates destructive ops for others', () => {
    expect(roleHasPermission('owner', 'workspace:delete')).toBe(true);
    expect(roleHasPermission('admin', 'workspace:delete')).toBe(false);
    expect(roleHasPermission('viewer', 'project:create')).toBe(false);
    expect(roleHasPermission('client_viewer', 'pack:read')).toBe(true);
    expect(roleHasPermission('client_viewer', 'project:read')).toBe(false);
  });
});
