/**
 * Core identity & platform entities: users, workspaces, membership, RBAC,
 * projects, search contexts and settings.
 */
import type {
  Id,
  UserId,
  WorkspaceId,
  ProjectId,
  Timestamps,
  WorkspaceOwned,
  Versioned,
} from './common.js';
import type {
  LocaleCode,
  LanguageMode,
  GeoPreference,
  MarketProfile,
  CountryCode,
  RegionCode,
} from './geo.js';
import type { PlanType } from './billing.js';

/** Roles available within a workspace, in descending authority. */
export type WorkspaceRole =
  | 'owner'
  | 'admin'
  | 'strategist'
  | 'product_manager'
  | 'designer'
  | 'engineer'
  | 'growth'
  | 'viewer'
  | 'client_viewer';

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  'owner',
  'admin',
  'strategist',
  'product_manager',
  'designer',
  'engineer',
  'growth',
  'viewer',
  'client_viewer',
] as const;

/**
 * Fine-grained permissions. RBAC maps roles -> permission sets; guards check
 * permissions, never raw roles, so the matrix can evolve without touching code.
 */
export type Permission =
  | 'workspace:read'
  | 'workspace:update'
  | 'workspace:delete'
  | 'workspace:manage_members'
  | 'workspace:manage_billing'
  | 'workspace:manage_white_label'
  | 'project:create'
  | 'project:read'
  | 'project:update'
  | 'project:delete'
  | 'niche:discover'
  | 'niche:read'
  | 'pack:generate'
  | 'pack:read'
  | 'pack:edit'
  | 'pack:approve'
  | 'export:create'
  | 'export:read'
  | 'llm:manage_connections'
  | 'llm:manage_settings'
  | 'source:manage'
  | 'audit:read'
  | 'comment:create'
  | 'share:manage';

export interface User extends Timestamps {
  id: UserId;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  /** Locale chosen for the app interface. */
  interfaceLocale: LocaleCode;
  isActive: boolean;
}

export interface Workspace extends Timestamps {
  id: WorkspaceId;
  name: string;
  slug: string;
  ownerId: UserId;
}

export interface WorkspaceMember extends Timestamps {
  id: Id;
  workspaceId: WorkspaceId;
  userId: UserId;
  role: WorkspaceRole;
  invitedBy: UserId | null;
  status: 'active' | 'invited' | 'suspended';
}

/** Per-user settings — interface, languages, timezone, geo consent. */
export interface UserSettings {
  userId: UserId;
  interfaceLocale: LocaleCode;
  defaultDocumentLanguage: LocaleCode;
  fallbackLanguage: LocaleCode;
  timezone: string;
  geo: GeoPreference;
}

/** Per-workspace defaults applied to new projects. */
export interface WorkspaceSettings {
  workspaceId: WorkspaceId;
  defaultLocale: LocaleCode;
  defaultMarketCountry: CountryCode | null;
  defaultMarketRegion: RegionCode | null;
  /** "byok" | "platform" — platform mode is a real schema placeholder for later. */
  defaultLlmMode: 'byok' | 'platform';
  /** Real schema now; full white-label arrives in Session 17. */
  whiteLabel: WhiteLabelSettings | null;
  /** Real schema now; full billing arrives in Session 15. */
  billingPlan: PlanType;
}

export interface WhiteLabelSettings {
  enabled: boolean;
  brandName: string | null;
  logoUrl: string | null;
  /** Accent must reference a flat token name — no gradients allowed. */
  accentTokenName: string | null;
  footerText: string | null;
  customDisclaimer: string | null;
  hideSignalKitBranding: boolean;
  clientName: string | null;
  preparedBy: string | null;
  agencyContact: string | null;
}

export interface Project extends Timestamps, WorkspaceOwned {
  id: ProjectId;
  name: string;
  goal: string;
  status: 'draft' | 'active' | 'archived';
  /** The market/geo this project targets. */
  market: MarketProfile;
  defaultOutputLanguage: LocaleCode;
  createdBy: UserId;
}

/**
 * A SearchContext captures everything needed to discover opportunities:
 * theme/audience plus market scope, languages and constraints.
 * Every discovery run carries one.
 */
export interface SearchContext extends Timestamps, WorkspaceOwned, Versioned {
  id: Id;
  projectId: ProjectId;
  industry: string | null;
  theme: string | null;
  audience: string | null;
  /** Desired product format hint (saas, mobile_app, marketplace, ...). */
  productFormat: string | null;
  market: MarketProfile;
  outputLanguage: LocaleCode;
  languageMode: LanguageMode;
  /** Local context rules / nuances the user wants respected. */
  localContextRules: string[];
}
