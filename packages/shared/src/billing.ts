/**
 * Billing / platform / commercial contracts: plans, usage limits, credits,
 * API keys, rate limits and audit log.
 */
import type { Id, Timestamps, WorkspaceOwned, UserId } from './common.js';

export type PlanType = 'free' | 'founder_pro' | 'agency' | 'studio' | 'enterprise';

export const PLAN_TYPES: readonly PlanType[] = [
  'free',
  'founder_pro',
  'agency',
  'studio',
  'enterprise',
] as const;

/** Named, enforceable usage limits per plan. */
export type UsageLimitKey =
  | 'workspaces'
  | 'seats'
  | 'projects'
  | 'monthly_niche_searches'
  | 'monthly_full_packs'
  | 'exports'
  | 'ai_usage_budget'
  | 'source_ingestion_jobs'
  | 'white_label_exports'
  | 'api_access'
  | 'share_links'
  | 'storage_mb';

export interface UsageLimit {
  key: UsageLimitKey;
  /** null means unlimited. */
  limit: number | null;
}

export interface Plan {
  type: PlanType;
  displayName: string;
  limits: UsageLimit[];
  /** Monthly credit grant included with the plan. */
  includedCredits: number;
}

export interface UsageCounter extends WorkspaceOwned {
  key: UsageLimitKey;
  /** Period the counter applies to, e.g. "2026-06". */
  period: string;
  used: number;
}

export interface CreditTransaction extends Timestamps, WorkspaceOwned {
  id: Id;
  /** Positive = grant/top-up, negative = consumption. */
  amount: number;
  reason: string;
  taskType: string | null;
  balanceAfter: number;
}

export interface BillingAccount extends Timestamps, WorkspaceOwned {
  id: Id;
  plan: PlanType;
  /** Abstract provider id (e.g. "stripe"); no provider coupling in the schema. */
  paymentProvider: string | null;
  externalCustomerId: string | null;
  creditBalance: number;
}

export interface APIKey extends Timestamps, WorkspaceOwned {
  id: Id;
  label: string;
  /** Masked display only; the hashed secret lives server-side. */
  maskedKey: string;
  scopes: string[];
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface RateLimitPolicy {
  id: Id;
  scope: 'workspace' | 'api_key' | 'ip';
  windowSeconds: number;
  maxRequests: number;
}

/** Audited platform events. Critical actions must produce one of these. */
export type AuditLogAction =
  | 'workspace.created'
  | 'workspace.settings_updated'
  | 'member.role_changed'
  | 'user.settings_updated'
  | 'llm.connection_created'
  | 'llm.connection_revoked'
  | 'llm.settings_updated'
  | 'pack.generated'
  | 'pack.retried'
  | 'document.approved'
  | 'document.saved'
  | 'document.regenerated'
  | 'document.locked'
  | 'document.restored'
  | 'document.changes_requested'
  | 'implementation_project.promoted'
  | 'implementation_project.updated'
  | 'export.created'
  | 'share.created'
  | 'share.accessed'
  | 'comment.resolved'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'mcp.client_registered'
  | 'mcp.session_created'
  | 'mcp.session_revoked'
  | 'mcp.tool_invoked';

export interface AuditLogEvent extends Timestamps, WorkspaceOwned {
  id: Id;
  action: AuditLogAction;
  actorId: UserId | null;
  /** Entity the action targeted. */
  subjectType: string;
  subjectId: Id | null;
  /** Redacted metadata — never includes secrets. */
  metadata: Record<string, unknown>;
  ipAddress: string | null;
}
