/**
 * Build Blueprint Layer — makes a Product Pack implementation-ready for
 * designers, frontend/backend developers and AI coding agents so they do NOT
 * need to invent screen logic, workflows or backend/API structure.
 *
 * Everything here is structured data derived deterministically from the same
 * canonical PackContext (features → screens → entities → endpoints), so the
 * blueprint is consistent with the rest of the pack BY CONSTRUCTION.
 *
 * The Build Readiness Score measures whether the blueprint is actually ready to
 * build (state coverage, API↔screen mapping, scope boundary, evidence grounding)
 * and is SEPARATE from Opportunity / Confidence / Venture Scale scores.
 */
import type { ConfidenceLevel } from './common.js';

/** The canonical UI states every screen must account for. */
export type ScreenStateKind =
  | 'empty'
  | 'loading'
  | 'success'
  | 'partial_data'
  | 'weak_evidence'
  | 'contradiction'
  | 'low_confidence'
  | 'permission_denied'
  | 'llm_key_missing'
  | 'source_configuration_needed'
  | 'failed'
  | 'locked_read_only';

export const SCREEN_STATE_KINDS: readonly ScreenStateKind[] = [
  'empty',
  'loading',
  'success',
  'partial_data',
  'weak_evidence',
  'contradiction',
  'low_confidence',
  'permission_denied',
  'llm_key_missing',
  'source_configuration_needed',
  'failed',
  'locked_read_only',
] as const;

/** The three states a screen MUST always specify (quality-gated). */
export const REQUIRED_SCREEN_STATES: readonly ScreenStateKind[] = ['empty', 'loading', 'failed'] as const;

export interface ScreenStateSpec {
  kind: ScreenStateKind;
  behavior: string;
}

/** Full screen-level logic specification (Part 3.1). */
export interface ScreenContract {
  name: string;
  purpose: string;
  userIntent: string;
  entryPoints: string[];
  exitPoints: string[];
  primaryAction: string;
  secondaryActions: string[];
  dataShown: string[];
  dataRequired: string[];
  states: ScreenStateSpec[];
  permissionRules: string[];
  validationRules: string[];
  backendDependencies: string[];
  aiDependencies: string[];
  edgeCases: string[];
  analyticsEvents: string[];
  microcopy: string[];
  components: string[];
  stateTransitions: string[];
  acceptanceCriteria: string[];
}

/** API-to-Screen mapping (Part 3.3). */
export interface ApiToScreenMapEntry {
  screen: string;
  /** Endpoints this screen reads. */
  endpoints: { method: string; path: string; dataNeeded: string }[];
  /** Screen actions that trigger mutations. */
  actions: { action: string; method: string; path: string }[];
  /** Error → UI state mapping. */
  errorStates: { error: string; uiState: ScreenStateKind }[];
}

/** Component contract (Part 3.4). */
export interface ComponentContract {
  name: string;
  purpose: string;
  props: string[];
  states: string[];
  interactions: string[];
  validation: string[];
  accessibility: string[];
}

/** Permission matrix row (Part 3.5). */
export interface PermissionMatrixEntry {
  role: string;
  allowedActions: string[];
  blockedActions: string[];
  uiWhenBlocked: string;
}

/** Analytics event map row (Part 3.6). */
export interface AnalyticsEventSpec {
  event: string;
  trigger: string;
  properties: string[];
  screen: string;
  productQuestion: string;
}

/** DO_NOT_BUILD entry (Part 3.7). */
export interface DoNotBuildItem {
  item: string;
  reason: string;
}

/** Build Readiness dimensions — does the blueprint enable building? */
export type BuildReadinessDimension =
  | 'screen_state_coverage'
  | 'api_screen_mapping'
  | 'permission_coverage'
  | 'acceptance_criteria'
  | 'scope_boundary'
  | 'evidence_grounding';

export interface BuildReadinessDimensionScore {
  dimension: BuildReadinessDimension;
  score: number; // 0..100
  reasoning: string;
}

export interface BuildReadinessScoreResult {
  /** 0..100. SEPARATE from Opportunity / Confidence / Venture Scale. */
  totalScore: number;
  level: ConfidenceLevel;
  breakdown: BuildReadinessDimensionScore[];
  warnings: string[];
}

/** The complete Build Blueprint persisted per pack. */
export interface BuildBlueprint {
  screenContracts: ScreenContract[];
  /** Screen → which of the canonical states it specifies. */
  stateMatrix: { screen: string; states: ScreenStateKind[] }[];
  apiToScreenMap: ApiToScreenMapEntry[];
  componentContracts: ComponentContract[];
  permissionMatrix: PermissionMatrixEntry[];
  analyticsEvents: AnalyticsEventSpec[];
  doNotBuild: DoNotBuildItem[];
  validationRules: string[];
  buildReadiness: BuildReadinessScoreResult;
}

/**
 * Compute Build Readiness from a finished blueprint. Pure and testable.
 * Penalizes missing screen states, unmapped APIs, missing scope boundary, etc.
 */
export function computeBuildReadiness(
  bp: Omit<BuildBlueprint, 'buildReadiness'>,
  opts: { endpointCount: number; evidenceBacked: boolean },
): BuildReadinessScoreResult {
  const warnings: string[] = [];

  // 1) Every screen specifies the required states (empty/loading/failed).
  const screens = bp.screenContracts;
  const screensWithAllRequired = screens.filter((s) => {
    const kinds = new Set(s.states.map((st) => st.kind));
    return REQUIRED_SCREEN_STATES.every((r) => kinds.has(r));
  });
  const stateCoverage = screens.length ? screensWithAllRequired.length / screens.length : 0;
  if (stateCoverage < 1) {
    const missing = screens
      .filter((s) => !REQUIRED_SCREEN_STATES.every((r) => s.states.some((st) => st.kind === r)))
      .map((s) => s.name);
    warnings.push(`Screens missing empty/loading/error states: ${missing.join(', ')}`);
  }

  // 2) Every endpoint is consumed by at least one screen, and every screen
  //    primary action maps to an endpoint or is explicitly frontend-only.
  const mappedEndpoints = new Set(
    bp.apiToScreenMap.flatMap((e) => [
      ...e.endpoints.map((x) => `${x.method} ${x.path}`),
      ...e.actions.map((x) => `${x.method} ${x.path}`),
    ]),
  );
  const apiMapping = opts.endpointCount ? Math.min(1, mappedEndpoints.size / Math.max(1, opts.endpointCount)) : 1;
  if (apiMapping < 1) warnings.push('Some API endpoints are not mapped to any screen.');

  // 3) Permission coverage: every role has explicit allowed/blocked actions.
  const permCoverage = bp.permissionMatrix.length > 0 ? 1 : 0;
  if (!permCoverage) warnings.push('Permission matrix is empty.');

  // 4) Acceptance criteria present on every screen.
  const withAcceptance = screens.filter((s) => s.acceptanceCriteria.length > 0).length;
  const acceptance = screens.length ? withAcceptance / screens.length : 0;
  if (acceptance < 1) warnings.push('Some screens have no acceptance criteria.');

  // 5) Scope boundary (DO_NOT_BUILD) exists.
  const scope = bp.doNotBuild.length > 0 ? 1 : 0;
  if (!scope) warnings.push('DO_NOT_BUILD section is missing.');

  // 6) Evidence grounding.
  const grounding = opts.evidenceBacked ? 1 : 0.5;
  if (!opts.evidenceBacked) warnings.push('Blueprint is weakly evidenced — add sources.');

  const breakdown: BuildReadinessDimensionScore[] = [
    { dimension: 'screen_state_coverage', score: Math.round(stateCoverage * 100), reasoning: `${screensWithAllRequired.length}/${screens.length} screens cover empty/loading/error.` },
    { dimension: 'api_screen_mapping', score: Math.round(apiMapping * 100), reasoning: `${mappedEndpoints.size}/${opts.endpointCount} endpoints mapped to screens.` },
    { dimension: 'permission_coverage', score: Math.round(permCoverage * 100), reasoning: `${bp.permissionMatrix.length} role(s) in the permission matrix.` },
    { dimension: 'acceptance_criteria', score: Math.round(acceptance * 100), reasoning: `${withAcceptance}/${screens.length} screens have acceptance criteria.` },
    { dimension: 'scope_boundary', score: Math.round(scope * 100), reasoning: scope ? `${bp.doNotBuild.length} DO_NOT_BUILD item(s).` : 'No DO_NOT_BUILD boundary.' },
    { dimension: 'evidence_grounding', score: Math.round(grounding * 100), reasoning: opts.evidenceBacked ? 'Blueprint is evidence-backed.' : 'Weak evidence grounding.' },
  ];

  const weights: Record<BuildReadinessDimension, number> = {
    screen_state_coverage: 0.25,
    api_screen_mapping: 0.25,
    permission_coverage: 0.1,
    acceptance_criteria: 0.2,
    scope_boundary: 0.1,
    evidence_grounding: 0.1,
  };
  const totalScore = Math.round(breakdown.reduce((s, b) => s + b.score * weights[b.dimension], 0));

  return { totalScore, level: bandOf(totalScore / 100), breakdown, warnings };
}

function bandOf(v: number): ConfidenceLevel {
  if (v < 0.2) return 'very_low';
  if (v < 0.4) return 'low';
  if (v < 0.6) return 'medium';
  if (v < 0.8) return 'high';
  return 'very_high';
}
