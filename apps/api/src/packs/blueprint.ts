/**
 * Deterministic Build Blueprint generator.
 *
 * Turns the canonical PackContext (features → screens → entities → endpoints)
 * into implementation-ready artifacts so designers, developers and AI coding
 * agents do not have to invent screen logic, workflows or API structure.
 *
 * Everything is derived from the same context the rest of the pack uses, so the
 * blueprint is consistent by construction. The Build Readiness Score is then
 * computed over the result and kept separate from the other scores.
 */
import {
  type BuildBlueprint,
  type ScreenContract,
  type ScreenStateSpec,
  type ScreenStateKind,
  type ApiToScreenMapEntry,
  type ComponentContract,
  type PermissionMatrixEntry,
  type AnalyticsEventSpec,
  type DoNotBuildItem,
  computeBuildReadiness,
} from '@signalkit/shared';
import type { PackContext, Endpoint } from './context';

/** States every data-bearing screen specifies (covers the required three + UX). */
const DATA_SCREEN_STATES: ScreenStateKind[] = [
  'empty',
  'loading',
  'success',
  'partial_data',
  'low_confidence',
  'weak_evidence',
  'permission_denied',
  'failed',
  'locked_read_only',
];

const AUTH_SCREEN_STATES: ScreenStateKind[] = ['empty', 'loading', 'success', 'failed'];

const AI_SCREEN_STATES: ScreenStateKind[] = [
  'empty',
  'loading',
  'success',
  'llm_key_missing',
  'source_configuration_needed',
  'low_confidence',
  'contradiction',
  'permission_denied',
  'failed',
];

function statesFor(screen: string): ScreenStateKind[] {
  const s = screen.toLowerCase();
  if (s.includes('sign in') || s.includes('sign-in') || s.includes('login')) return AUTH_SCREEN_STATES;
  if (s.includes('ai') || s.includes('assistant') || s.includes('generate')) return AI_SCREEN_STATES;
  return DATA_SCREEN_STATES;
}

function stateBehavior(kind: ScreenStateKind, screen: string): string {
  switch (kind) {
    case 'empty': return `Show an empty state for "${screen}" with a clear primary call-to-action; never a blank page.`;
    case 'loading': return 'Show a skeleton/placeholder while data loads; do not block the whole shell.';
    case 'success': return 'Render the data and enable the primary action.';
    case 'partial_data': return 'Render available data; mark missing fields rather than hiding the screen.';
    case 'weak_evidence': return 'Surface a "weakly evidenced" badge and link to the evidence/assumptions.';
    case 'contradiction': return 'Surface contradictions visibly; do not silently pick a side.';
    case 'low_confidence': return 'Show a low-confidence indicator; keep opportunity vs confidence distinct.';
    case 'permission_denied': return 'Hide or disable blocked actions and explain the missing permission.';
    case 'llm_key_missing': return 'Prompt the user to connect an LLM provider (BYOK); never call a provider directly.';
    case 'source_configuration_needed': return 'Guide the user to add sources before results can be trusted.';
    case 'failed': return 'Show a recoverable error with a retry action and a support path.';
    case 'locked_read_only': return 'Render read-only when the document/pack is locked or the user lacks edit rights.';
  }
}

/** Which endpoints relate to a given screen (by entity-name match; dashboard reads all). */
function endpointsForScreen(screen: string, endpoints: Endpoint[]): Endpoint[] {
  const s = screen.toLowerCase();
  if (s.includes('dashboard') || s.includes('home')) return endpoints.filter((e) => e.method === 'GET');
  return endpoints.filter((e) => s.includes(e.entity.toLowerCase()));
}

function buildScreenContract(screen: string, ctx: PackContext): ScreenContract {
  const related = endpointsForScreen(screen, ctx.endpoints);
  const reads = related.filter((e) => e.method === 'GET');
  const writes = related.filter((e) => e.method !== 'GET');
  const states: ScreenStateSpec[] = statesFor(screen).map((kind) => ({ kind, behavior: stateBehavior(kind, screen) }));
  const isAuth = screen.toLowerCase().includes('sign in');

  return {
    name: screen,
    purpose: `Support the primary flow for ${ctx.niche.title} at the "${screen}" step.`,
    userIntent: isAuth ? 'Authenticate and enter the workspace.' : `Complete the job tied to "${screen}".`,
    entryPoints: isAuth ? ['App launch', 'Sign-out redirect'] : ['Home / Dashboard navigation', 'Deep link'],
    exitPoints: isAuth ? ['Home / Dashboard on success'] : ['Back to Dashboard', 'Next step in the flow'],
    primaryAction: writes.length ? `${writes[0]!.method} ${writes[0]!.path}` : reads.length ? `View ${reads[0]!.entity}` : 'Frontend-only navigation',
    secondaryActions: writes.slice(1).map((e) => `${e.method} ${e.path}`),
    dataShown: reads.length ? reads.map((e) => `${e.entity} list/detail (${e.method} ${e.path})`) : ['Static content / form fields'],
    dataRequired: related.map((e) => `${e.entity} access`),
    states,
    permissionRules: isAuth ? ['Public (unauthenticated)'] : ['Requires pack:read', 'Mutations require pack:edit'],
    validationRules: writes.length ? [`Validate payload for ${writes[0]!.entity} before ${writes[0]!.method}.`, 'Reject empty required fields with inline errors.'] : ['No write validation (read/navigation only).'],
    backendDependencies: related.map((e) => `${e.method} ${e.path}`),
    aiDependencies: screen.toLowerCase().includes('ai') ? ['LlmRouterService (BYOK) — never call a provider directly.'] : [],
    edgeCases: ['Slow network', 'Concurrent edits', 'Permission revoked mid-session', 'No sources configured yet'],
    analyticsEvents: [`${slug(screen)}_viewed`, ...(writes.length ? [`${slug(screen)}_submitted`] : [])],
    microcopy: [`Empty: "Nothing here yet — get started."`, `Error: "Something went wrong. Retry."`],
    components: [`${entityToken(screen)}Header`, `${entityToken(screen)}List`, `${entityToken(screen)}Form`, 'EmptyState', 'ErrorState'],
    stateTransitions: ['loading → success | failed', 'empty → success (after first create)', 'success → locked_read_only (on lock)'],
    acceptanceCriteria: [
      `Given a signed-in user with permission, When they open "${screen}", Then the data loads or a documented empty/error state is shown.`,
      ...(writes.length ? [`Given valid input, When they ${writes[0]!.method} ${writes[0]!.path}, Then the result persists and the UI reflects success.`] : []),
    ],
  };
}

function permissionMatrix(): PermissionMatrixEntry[] {
  // Pack-level actions mapped to the canonical roles (consistent with RBAC).
  const view = 'View pack & blueprint';
  const edit = 'Edit documents';
  const approve = 'Approve / lock';
  const exportAction = 'Create exports';
  return [
    { role: 'owner', allowedActions: [view, edit, approve, exportAction], blockedActions: [], uiWhenBlocked: 'n/a' },
    { role: 'product_manager', allowedActions: [view, edit, approve, exportAction], blockedActions: [], uiWhenBlocked: 'n/a' },
    { role: 'designer', allowedActions: [view, edit, exportAction], blockedActions: [approve], uiWhenBlocked: 'Approve control hidden; show "needs PM/owner".' },
    { role: 'engineer', allowedActions: [view, edit, exportAction], blockedActions: [approve], uiWhenBlocked: 'Approve control hidden.' },
    { role: 'growth', allowedActions: [view, exportAction], blockedActions: [edit, approve], uiWhenBlocked: 'Editing disabled; read-only banner.' },
    { role: 'viewer', allowedActions: [view], blockedActions: [edit, approve, exportAction], uiWhenBlocked: 'Read-only; action buttons hidden.' },
    { role: 'client_viewer', allowedActions: [view], blockedActions: [edit, approve, exportAction], uiWhenBlocked: 'Read-only client view; internal notes hidden.' },
  ];
}

function analyticsEvents(ctx: PackContext): AnalyticsEventSpec[] {
  const events: AnalyticsEventSpec[] = [];
  for (const screen of ctx.screens) {
    events.push({ event: `${slug(screen)}_viewed`, trigger: `User opens "${screen}"`, properties: ['workspaceId', 'packId', 'role'], screen, productQuestion: 'Which screens get attention?' });
  }
  for (const e of ctx.endpoints.filter((x) => x.method !== 'GET')) {
    events.push({ event: `${e.entity.toLowerCase()}_${e.method.toLowerCase()}`, trigger: `${e.method} ${e.path}`, properties: ['workspaceId', 'entityId', 'role'], screen: `${e.entity} screen`, productQuestion: 'Are core actions completed (activation)?' });
  }
  return events;
}

function componentContracts(ctx: PackContext): ComponentContract[] {
  const base: ComponentContract[] = [
    { name: 'EmptyState', purpose: 'Communicate emptiness with a primary CTA.', props: ['title', 'description', 'ctaLabel', 'onCta'], states: ['default'], interactions: ['CTA click'], validation: [], accessibility: ['Heading role', 'CTA is a real button'] },
    { name: 'ErrorState', purpose: 'Recoverable error with retry.', props: ['message', 'onRetry'], states: ['default'], interactions: ['Retry click'], validation: [], accessibility: ['role="alert"', 'Focus management on appear'] },
    { name: 'ConfidenceBadge', purpose: 'Show confidence separate from opportunity/venture scale.', props: ['value', 'level'], states: ['low', 'medium', 'high'], interactions: ['Hover for rationale'], validation: [], accessibility: ['aria-label with level', 'Not colour-only'] },
  ];
  const primary = ctx.entities[ctx.entities.length - 1]?.name ?? 'Item';
  base.push({
    name: `${primary}Form`,
    purpose: `Create/edit a ${primary}.`,
    props: ['initialValue', 'onSubmit', 'disabled'],
    states: ['empty', 'editing', 'submitting', 'error'],
    interactions: ['Field change', 'Submit', 'Cancel'],
    validation: ['Required fields', 'Reject on empty', 'Inline field errors'],
    accessibility: ['Labels for every field', 'Error text linked via aria-describedby', 'RTL-safe layout'],
  });
  return base;
}

function doNotBuild(ctx: PackContext): DoNotBuildItem[] {
  const items: DoNotBuildItem[] = ctx.features
    .filter((f) => !f.included)
    .map((f) => ({ item: f.name, reason: 'Out of MVP scope — deferred to post-MVP.' }));
  items.push(
    { item: 'App generation / "Generate App" CTA', reason: 'SignalKit produces document packs & blueprints, not generated apps. Product law.' },
    { item: 'Gradients, glassmorphism, neon AI-dashboard styling', reason: 'UI law: premium flat 2D only.' },
    { item: 'Chat-first UX as the primary interface', reason: 'UI law: not chat-first.' },
    { item: 'Direct LLM provider calls from feature code', reason: 'All AI must go through LlmRouterService (BYOK).' },
    { item: 'Inventing entities, endpoints or screens not in this blueprint', reason: 'Do not expand product scope; unresolved questions stay unresolved.' },
    { item: 'Fabricated TAM / revenue / unicorn claims', reason: 'No fake market size; weak data stays an assumption.' },
  );
  return items;
}

function validationRules(ctx: PackContext): string[] {
  const rules = ['All user input is validated server-side before persistence.', 'Required fields reject empty/whitespace values with inline errors.'];
  for (const e of ctx.entities) {
    rules.push(`${e.name}: validate ${e.fields.filter((f) => f !== 'id' && f !== 'createdAt').join(', ') || 'fields'} on write.`);
  }
  return rules;
}

function apiToScreenMap(ctx: PackContext): ApiToScreenMapEntry[] {
  return ctx.screens
    .map((screen) => {
      const related = endpointsForScreen(screen, ctx.endpoints);
      const reads = related.filter((e) => e.method === 'GET');
      const writes = related.filter((e) => e.method !== 'GET');
      const entry: ApiToScreenMapEntry = {
        screen,
        endpoints: reads.map((e) => ({ method: e.method, path: e.path, dataNeeded: `${e.entity} records` })),
        actions: writes.map((e) => ({ action: `${e.method} ${e.entity}`, method: e.method, path: e.path })),
        errorStates: [
          { error: '401/403', uiState: 'permission_denied' },
          { error: '5xx / network', uiState: 'failed' },
          { error: 'empty result', uiState: 'empty' },
        ],
      };
      return entry;
    })
    .filter((e) => e.endpoints.length > 0 || e.actions.length > 0);
}

/**
 * Build the full Build Blueprint from a PackContext.
 */
export function buildBuildBlueprint(ctx: PackContext): BuildBlueprint {
  const screenContracts = ctx.screens.map((s) => buildScreenContract(s, ctx));
  const partial: Omit<BuildBlueprint, 'buildReadiness'> = {
    screenContracts,
    stateMatrix: screenContracts.map((s) => ({ screen: s.name, states: s.states.map((st) => st.kind) })),
    apiToScreenMap: apiToScreenMap(ctx),
    componentContracts: componentContracts(ctx),
    permissionMatrix: permissionMatrix(),
    analyticsEvents: analyticsEvents(ctx),
    doNotBuild: doNotBuild(ctx),
    validationRules: validationRules(ctx),
  };
  const buildReadiness = computeBuildReadiness(partial, {
    endpointCount: ctx.endpoints.length,
    evidenceBacked: ctx.claims.length > 0 || ctx.sourceRefs.length > 0,
  });
  return { ...partial, buildReadiness };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function entityToken(s: string): string {
  const word = s.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)[0] ?? 'Screen';
  return word[0]!.toUpperCase() + word.slice(1);
}
