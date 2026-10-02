/**
 * Quality gates. Reject generic, empty, unsupported, inconsistent or
 * language-broken documents. Pure over the generated documents + context, so it
 * is fully testable without a database.
 */
import type { DocumentType } from '@signalkit/shared';
import { looksLikeWrongLanguage } from '@signalkit/llm';
import { createPackContentTranslator } from '@signalkit/i18n';
import type { PackContext } from './context';

/** Escape a string for safe use inside a `RegExp` constructor. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface GateCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  documentTypes: DocumentType[];
}

export interface GateResult {
  status: 'passed' | 'warnings' | 'failed';
  checks: GateCheck[];
  passedCount: number;
  warnCount: number;
  failCount: number;
}

export interface DocForGate {
  docType: DocumentType;
  body: string;
  language: string;
}

const PLACEHOLDER = '(none captured yet';

export function runQualityGates(
  docs: DocForGate[],
  ctx: PackContext,
  requiredDocs: DocumentType[],
): GateResult {
  const byType = new Map(docs.map((d) => [d.docType, d]));
  const checks: GateCheck[] = [];
  const has = (t: DocumentType) => byType.has(t);
  const body = (t: DocumentType) => byType.get(t)?.body ?? '';

  // 1) All required documents present.
  const missing = requiredDocs.filter((t) => !has(t));
  checks.push({
    id: 'required_docs_present',
    label: 'All required documents present',
    status: missing.length === 0 ? 'pass' : 'fail',
    message: missing.length === 0 ? `${requiredDocs.length} documents present` : `Missing: ${missing.join(', ')}`,
    documentTypes: missing,
  });

  // 2) No empty documents.
  const empty = docs.filter((d) => d.body.trim().length < 120).map((d) => d.docType);
  checks.push({
    id: 'no_empty_docs',
    label: 'No empty documents',
    status: empty.length === 0 ? 'pass' : 'fail',
    message: empty.length === 0 ? 'All documents have substance' : `Too short: ${empty.join(', ')}`,
    documentTypes: empty,
  });

  // 3) No lorem ipsum.
  const lorem = docs.filter((d) => /lorem ipsum/i.test(d.body)).map((d) => d.docType);
  checks.push({
    id: 'no_lorem',
    label: 'No placeholder lorem ipsum',
    status: lorem.length === 0 ? 'pass' : 'fail',
    message: lorem.length === 0 ? 'No lorem ipsum' : `Lorem found: ${lorem.join(', ')}`,
    documentTypes: lorem,
  });

  // 4) Not generic / not mostly placeholders.
  const generic = docs.filter((d) => {
    const lines = d.body.split('\n').filter((l) => l.trim().startsWith('- '));
    const placeholderLines = lines.filter((l) => l.includes(PLACEHOLDER)).length;
    return lines.length > 0 && placeholderLines / lines.length > 0.6;
  }).map((d) => d.docType);
  checks.push({
    id: 'not_generic',
    label: 'Documents are specific, not generic',
    status: generic.length === 0 ? 'pass' : 'warn',
    message: generic.length === 0 ? 'Documents are specific' : `Mostly placeholders: ${generic.join(', ')} — add sources/evidence`,
    documentTypes: generic,
  });

  // 5) MVP scope includes Included/Excluded — in the pack's own language, since
  // templates.ts renders these headings translated, not hardcoded English.
  const t = createPackContentTranslator(ctx.language);
  if (has('mvp_scope')) {
    const included = escapeRegExp(t('heading.included'));
    const excluded = escapeRegExp(t('heading.excluded'));
    const b = body('mvp_scope');
    const ok = new RegExp(`##\\s*${included}`, 'i').test(b) && new RegExp(`##\\s*${excluded}`, 'i').test(b);
    checks.push(mk('mvp_included_excluded', 'MVP scope lists Included & Excluded', ok ? 'pass' : 'fail', ok ? 'Both present' : 'Missing Included/Excluded sections', ['mvp_scope']));
  }

  // 6) Acceptance criteria use Given/When/Then — in the pack's own language.
  if (has('acceptance_criteria')) {
    const b = body('acceptance_criteria');
    const given = escapeRegExp(t('gwt.given'));
    const when = escapeRegExp(t('gwt.when'));
    const then = escapeRegExp(t('gwt.then'));
    const ok = new RegExp(given, 'i').test(b) && new RegExp(when, 'i').test(b) && new RegExp(then, 'i').test(b);
    checks.push(mk('acceptance_gwt', 'Acceptance criteria use Given/When/Then', ok ? 'pass' : 'fail', ok ? 'Given/When/Then present' : 'Not in Given/When/Then form', ['acceptance_criteria']));
  }

  // 7) UX flow ↔ screen map consistency.
  if (has('ux_flow') && has('screen_map')) {
    const missingScreens = ctx.screens.filter((s) => !body('ux_flow').includes(s) || !body('screen_map').includes(s));
    checks.push(mk('consistency_ux_screens', 'UX flow matches screen map', missingScreens.length === 0 ? 'pass' : 'fail', missingScreens.length === 0 ? 'Screens consistent' : `Inconsistent screens: ${missingScreens.join(', ')}`, ['ux_flow', 'screen_map']));
  }

  // 8) Data model ↔ API consistency (entities).
  if (has('data_model') && has('api_requirements')) {
    const missingEntities = ctx.entities.filter((e) => !body('data_model').includes(e.name) || !body('api_requirements').includes(e.name));
    checks.push(mk('consistency_data_api', 'Data model supports the API', missingEntities.length === 0 ? 'pass' : 'fail', missingEntities.length === 0 ? 'Entities consistent' : `Entities missing in API/data: ${missingEntities.map((e) => e.name).join(', ')}`, ['data_model', 'api_requirements']));
  }

  // 9) API ↔ frontend consistency (endpoints).
  if (has('api_requirements') && has('frontend_brd')) {
    const missingEndpoints = ctx.endpoints.filter((e) => !body('frontend_brd').includes(e.path));
    checks.push(mk('consistency_api_frontend', 'Frontend consumes the API', missingEndpoints.length === 0 ? 'pass' : 'fail', missingEndpoints.length === 0 ? 'Endpoints consistent' : `Endpoints not consumed: ${missingEndpoints.map((e) => e.path).join(', ')}`, ['api_requirements', 'frontend_brd']));
  }

  // 10) Risks have mitigations (checked against the pack's own language).
  if (has('risks_and_assumptions')) {
    const mitigation = escapeRegExp(t('common.mitigation_label'));
    const ok = new RegExp(mitigation, 'i').test(body('risks_and_assumptions'));
    checks.push(mk('risks_have_mitigations', 'Risks have mitigations', ok ? 'pass' : 'fail', ok ? 'Mitigations present' : 'No mitigations found', ['risks_and_assumptions']));
  }

  // 11) Evidence-backed (no unsupported pack).
  const evidenceBacked = ctx.claims.length > 0 || ctx.sourceRefs.length > 0;
  checks.push({
    id: 'evidence_backed',
    label: 'Pack is evidence-backed',
    status: evidenceBacked ? 'pass' : 'warn',
    message: evidenceBacked ? `${ctx.claims.length} claim(s), ${ctx.sourceRefs.length} source(s)` : 'No claims/sources yet — add sources; weak points are marked as assumptions',
    documentTypes: [],
  });

  // 12) Output language present, non-empty, and the body text is actually in
  // that language (not just tagged correctly — a mislabeled English document
  // must fail here, not silently pass).
  const langBroken = docs
    .filter((d) => d.body.trim().length === 0 || d.language !== ctx.language || looksLikeWrongLanguage(d.body, ctx.language))
    .map((d) => d.docType);
  checks.push({
    id: 'output_language',
    label: 'Output language correct',
    status: langBroken.length === 0 ? 'pass' : 'fail',
    message: langBroken.length === 0 ? `All in ${ctx.language}` : `Wrong/empty language: ${langBroken.join(', ')}`,
    documentTypes: langBroken,
  });

  // ── Session 14: Breakout / Build Blueprint gates (only when present) ───────

  const bp = ctx.buildBlueprint;
  if (bp) {
    // 13) Every screen specifies empty/loading/error states.
    const required: string[] = ['empty', 'loading', 'failed'];
    const screensMissing = bp.screenContracts
      .filter((s) => !required.every((r) => s.states.some((st) => st.kind === r)))
      .map((s) => s.name);
    checks.push({
      id: 'screen_states_complete',
      label: 'Every screen has empty/loading/error states',
      status: screensMissing.length === 0 ? 'pass' : 'fail',
      message: screensMissing.length === 0 ? `${bp.screenContracts.length} screens cover empty/loading/error` : `Missing states: ${screensMissing.join(', ')}`,
      documentTypes: screensMissing.length ? ['build_blueprint'] : [],
    });

    // 14) Every primary action maps to backend/API or is clearly frontend-only.
    const unmappedActions = bp.screenContracts
      .filter((s) => !/^(GET|POST|PUT|DELETE)\s|View\s|frontend-only/i.test(s.primaryAction))
      .map((s) => s.name);
    checks.push(mk('primary_action_maps', 'Primary actions map to API or are frontend-only', unmappedActions.length === 0 ? 'pass' : 'fail', unmappedActions.length === 0 ? 'All primary actions resolved' : `Unresolved: ${unmappedActions.join(', ')}`, ['build_blueprint']));

    // 15) Every API endpoint maps to at least one screen.
    const mapped = new Set(
      bp.apiToScreenMap.flatMap((m) => [...m.endpoints.map((e) => `${e.method} ${e.path}`), ...m.actions.map((a) => `${a.method} ${a.path}`)]),
    );
    const orphanEndpoints = ctx.endpoints.filter((e) => !mapped.has(`${e.method} ${e.path}`)).map((e) => `${e.method} ${e.path}`);
    checks.push(mk('api_mapped_to_screen', 'Every API dependency maps to a screen', orphanEndpoints.length === 0 ? 'pass' : 'warn', orphanEndpoints.length === 0 ? 'All endpoints consumed by a screen' : `Unmapped endpoints: ${orphanEndpoints.join(', ')}`, ['build_blueprint']));

    // 16) DO_NOT_BUILD exists.
    checks.push(mk('do_not_build_present', 'DO_NOT_BUILD section exists', bp.doNotBuild.length > 0 ? 'pass' : 'fail', bp.doNotBuild.length > 0 ? `${bp.doNotBuild.length} exclusions` : 'No DO_NOT_BUILD exclusions', ['do_not_build']));
  }

  // 17) Venture Scale Score has an evidence/assumption breakdown (separate score).
  if (ctx.ventureScale) {
    const hasBreakdown = ctx.ventureScale.breakdown.length > 0 && ctx.ventureScale.breakdown.every((b) => typeof b.assumptionBased === 'boolean');
    checks.push(mk('venture_scale_breakdown', 'Venture Scale Score has evidence/assumption breakdown', hasBreakdown ? 'pass' : 'fail', hasBreakdown ? `${ctx.ventureScale.breakdown.length} dimensions with assumption flags` : 'Missing venture-scale breakdown', ['breakout_opportunity_memo']));
  }

  // 18) No fake TAM / unsupported unicorn claims in venture documents.
  const ventureDocs = docs.filter((d) => d.docType === 'venture_thesis' || d.docType === 'breakout_opportunity_memo');
  const UNICORN = /\b(\$?\d+\s*(billion|trillion)|TAM of|guaranteed unicorn|will become a unicorn|\$\d+B\b)\b/i;
  const ASSUMPTION_FRAMING = /(assumption|hypothes|to validate|not a guarantee|no fabricated|bottom-up)/i;
  const offending = ventureDocs.filter((d) =>
    // A market-size / unicorn claim is only allowed on a line that explicitly
    // frames it as an assumption to validate. Any unframed claim fails.
    d.body.split('\n').some((line) => UNICORN.test(line) && !ASSUMPTION_FRAMING.test(line)),
  ).map((d) => d.docType);
  if (ventureDocs.length) {
    checks.push({
      id: 'no_fake_tam',
      label: 'No fabricated TAM / unsupported unicorn claims',
      status: offending.length === 0 ? 'pass' : 'fail',
      message: offending.length === 0 ? 'No fabricated market-size or unicorn claims' : `Unsupported scale claims in: ${offending.join(', ')}`,
      documentTypes: offending,
    });
  }

  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const passedCount = checks.filter((c) => c.status === 'pass').length;
  const status = failCount > 0 ? 'failed' : warnCount > 0 ? 'warnings' : 'passed';
  return { status, checks, passedCount, warnCount, failCount };
}

function mk(id: string, label: string, status: GateCheck['status'], message: string, documentTypes: DocumentType[]): GateCheck {
  return { id, label, status, message, documentTypes };
}
