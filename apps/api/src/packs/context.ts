/**
 * Pack context. Gathers the niche, score, evidence graph and market, then
 * derives a single canonical set of features / screens / entities / endpoints.
 * Every document builder consumes these same artifacts, so UX flow, screen map,
 * frontend/backend BRD, data model and API requirements are mutually consistent
 * BY CONSTRUCTION (the quality gates then verify it).
 */
import type {
  LocaleCode,
  ProductPackDepth,
  VerticalTemplate,
  VentureThesis,
  VentureScaleScoreResult,
  BuildBlueprint,
} from '@signalkit/shared';
import { createPackContentTranslator } from '@signalkit/i18n';

export interface PackNiche {
  title: string;
  oneLiner: string;
  problem: string;
  targetAudience: string;
  whyNow: string;
  useCases: string[];
  competitors: string[];
  monetization: string;
  mvpConcept: string;
  recommendedProductFormat: string;
  riskLevel: string;
  /** 'discovered' (default) | 'founder_idea' — set when the niche came from createFromIdea(). */
  intakeMode?: string;
  /** Verbatim founder-supplied idea text when intakeMode is 'founder_idea'. */
  founderIdeaText?: string;
}

export interface PackScore {
  totalScore: number;
  confidenceValue: number;
  confidenceLevel: string;
  explanation: string;
  breakdown: { dimension: string; score: number; assumptionBased: boolean }[];
}

export interface Feature {
  name: string;
  included: boolean; // MVP vs post-MVP
  rationale: string;
}
export interface Entity {
  name: string;
  fields: string[];
}
export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  entity: string;
}

export interface PackContext {
  niche: PackNiche;
  score: PackScore | null;
  market: { country: string | null; region: string | null; marketLanguage: string; scope: string };
  language: LocaleCode;
  depth: ProductPackDepth;
  vertical: VerticalTemplate;
  claims: { id: string; text: string; type: string; confidenceLevel: string }[];
  assumptions: { id: string; text: string }[];
  constraints: { id: string; text: string }[];
  unresolvedQuestions: { id: string; text: string }[];
  evidence: { id: string; summary: string; sourceRefId: string }[];
  sourceRefs: { id: string; url: string | null; title: string | null; adapter: string }[];
  // canonical, shared across documents:
  features: Feature[];
  screens: string[];
  entities: Entity[];
  endpoints: Endpoint[];
  icp: { segment: string; pains: string[]; jtbd: string[] };
  // Session 14 — Breakout / Build Blueprint (optional, attached by the service).
  ventureThesis?: VentureThesis | null;
  ventureScale?: VentureScaleScoreResult | null;
  buildBlueprint?: BuildBlueprint | null;
}

export type PackContextInput = Omit<
  PackContext,
  'features' | 'screens' | 'entities' | 'endpoints' | 'icp' | 'buildBlueprint'
>;

/** Title-case a phrase into a PascalCase-ish entity name. */
function entityName(phrase: string): string {
  const words = phrase.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join('') || 'Item';
}

export function buildPackContext(input: PackContextInput): PackContext {
  const t = createPackContentTranslator(input.language);
  const useCases = input.niche.useCases.length
    ? input.niche.useCases
    : [t('derived.core_workflow_fallback', { title: input.niche.title })];

  // Features: first ~60% are MVP-included, the rest post-MVP.
  const cutoff = Math.max(1, Math.ceil(useCases.length * 0.6));
  const features: Feature[] = useCases.map((u, i) => ({
    name: u.length > 70 ? u.slice(0, 67) + '…' : u,
    included: i < cutoff,
    rationale: i < cutoff ? t('derived.rationale_mvp') : t('derived.rationale_post_mvp'),
  }));
  features.push({ name: t('derived.auth_feature_name'), included: true, rationale: t('derived.rationale_auth') });

  // Screens follow features + standard shells.
  const screens = [
    t('derived.screen_sign_in'),
    t('derived.screen_home_dashboard'),
    ...features.filter((f) => f.included).slice(0, 5).map((f) => t('derived.screen_suffix', { entity: entityName(f.name) })),
    t('derived.screen_settings'),
  ];

  // Entities: a primary domain entity + platform baseline.
  const primary = entityName(input.niche.title);
  const entities: Entity[] = [
    { name: 'User', fields: ['id', 'email', 'displayName', 'createdAt'] },
    { name: 'Workspace', fields: ['id', 'name', 'ownerId'] },
    { name: primary, fields: ['id', 'workspaceId', 'title', 'status', 'createdAt'] },
  ];

  // Endpoints map 1:1 to entities (used by API + frontend + backend docs).
  const endpoints: Endpoint[] = entities.flatMap((e) => [
    { method: 'GET' as const, path: `/${e.name.toLowerCase()}s`, entity: e.name },
    { method: 'POST' as const, path: `/${e.name.toLowerCase()}s`, entity: e.name },
  ]);

  const pains = [input.niche.problem, ...input.claims.filter((c) => c.type === 'user_pain').map((c) => c.text)].filter(Boolean).slice(0, 4);
  const icp = {
    segment: input.niche.targetAudience,
    pains,
    jtbd: useCases.slice(0, 4).map((u) => t('derived.jtbd_template', { audience: input.niche.targetAudience, action: u })),
  };

  return { ...input, features, screens, entities, endpoints, icp };
}
