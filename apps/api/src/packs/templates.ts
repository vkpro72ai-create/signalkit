/**
 * Deterministic, evidence-based document builders. One builder per DocumentType.
 *
 * These produce structured Markdown (not a long AI essay) from the pack context.
 * They are honest: anything not supported by evidence is explicitly labeled an
 * assumption. When an LLM connection exists, the pack service may enhance a
 * document via LlmRouterService — but these builders are always the baseline.
 *
 * Every heading and boilerplate phrase goes through `createPackContentTranslator`
 * so the deterministic skeleton is in `ctx.language`, not just tagged as such —
 * only the underlying data (niche title, ICP segment, ...) varies by content.
 */
import {
  REQUIRED_DOCUMENT_TYPES,
  type DocumentType,
  type ProductPackDepth,
  type VerticalTemplate,
} from '@signalkit/shared';
import { createPackContentTranslator, type PackContentKey, type PackContentTranslator } from '@signalkit/i18n';
import type { PackContext } from './context';

export interface BuiltDocument {
  title: string;
  body: string;
}

const h1 = (t: string) => `# ${t}\n`;
const h2 = (t: string) => `\n## ${t}\n`;
const bullets = (items: string[], none: string) => (items.length ? items.map((i) => `- ${i}`).join('\n') : `- ${none}`);
const para = (t: string) => `${t}\n`;
/** Render a thesis section, flagging assumptions honestly. */
const sec = (s: { text: string; assumption: boolean }, t: PackContentTranslator) =>
  `${s.text}${s.assumption ? `\n\n${t('common.assumption_not_validated')}` : ''}\n`;

function provenance(ctx: PackContext, t: PackContentTranslator): string {
  const ev = ctx.evidence.length;
  const cl = ctx.claims.length;
  const conf = ctx.score ? `${Math.round(ctx.score.confidenceValue * 100)}%` : 'n/a';
  return `> ${t('common.provenance', { ev, cl, conf })}`;
}

const VERTICAL_NOTE_KEY: Record<VerticalTemplate, PackContentKey> = {
  b2b_saas: 'vertical.b2b_saas',
  mobile_consumer_app: 'vertical.mobile_consumer_app',
  marketplace: 'vertical.marketplace',
  ai_agent_product: 'vertical.ai_agent_product',
  api_product: 'vertical.api_product',
  community_content_product: 'vertical.community_content_product',
  local_service_saas: 'vertical.local_service_saas',
  compliance_saas: 'vertical.compliance_saas',
  health_adjacent_product: 'vertical.health_adjacent_product',
  fintech_adjacent_product: 'vertical.fintech_adjacent_product',
  ecommerce_tool: 'vertical.ecommerce_tool',
  creator_economy_tool: 'vertical.creator_economy_tool',
  internal_enterprise_tool: 'vertical.internal_enterprise_tool',
};

type Builder = (ctx: PackContext, t: PackContentTranslator) => BuiltDocument;

const BUILDERS: Record<DocumentType, Builder> = {
  product_vision: (ctx, t) => ({
    title: t('title.product_vision'),
    body: [
      h1(t('title.product_vision')),
      para(`**${ctx.niche.title}** — ${ctx.niche.oneLiner}`),
      h2(t('heading.why_now')),
      para(ctx.niche.whyNow),
      h2(t('heading.who_it_is_for')),
      para(ctx.icp.segment),
      h2(t('heading.vertical_lens')),
      para(t(VERTICAL_NOTE_KEY[ctx.vertical])),
      h2(t('heading.provenance')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  market_context: (ctx, t) => ({
    title: t('title.market_context'),
    body: [
      h1(t('title.market_context')),
      h2(t('heading.market')),
      para(t('common.market_summary', {
        scope: ctx.market.scope,
        country: ctx.market.country ?? t('common.global'),
        language: ctx.market.marketLanguage,
      })),
      h2(t('heading.momentum')),
      para(ctx.score ? ctx.score.explanation : t('common.not_yet_scored')),
      h2(t('heading.competitors_alternatives')),
      bullets(ctx.niche.competitors, t('common.none_captured')),
      h2(t('heading.evidence')),
      bullets(ctx.claims.filter((c) => c.type === 'market_demand' || c.type === 'competition').map((c) => `${c.text} (confidence: ${c.confidenceLevel})`), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  target_audience_icp: (ctx, t) => ({
    title: t('title.target_audience_icp'),
    body: [h1(t('title.target_audience_icp')), h2(t('heading.segment')), para(ctx.icp.segment), h2(t('heading.pains')), bullets(ctx.icp.pains, t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  jobs_to_be_done: (ctx, t) => ({
    title: t('title.jobs_to_be_done'),
    body: [h1(t('title.jobs_to_be_done')), bullets(ctx.icp.jtbd, t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  problem_map: (ctx, t) => ({
    title: t('title.problem_map'),
    body: [h1(t('title.problem_map')), h2(t('heading.core_problem')), para(ctx.niche.problem), h2(t('heading.sub_problems')), bullets(ctx.icp.pains, t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  user_scenarios: (ctx, t) => ({
    title: t('title.user_scenarios'),
    body: [h1(t('title.user_scenarios')), bullets(ctx.niche.useCases.map((u, i) => t('common.scenario_label', { n: i + 1, text: u })), t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  feature_checklist: (ctx, t) => ({
    title: t('title.feature_checklist'),
    body: [h1(t('title.feature_checklist')), bullets(ctx.features.map((f) => `[${f.included ? t('common.mvp_tag') : t('common.post_mvp_tag')}] ${f.name}`), t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  mvp_scope: (ctx, t) => ({
    title: t('title.mvp_scope'),
    body: [
      h1(t('title.mvp_scope')),
      h2(t('heading.included')),
      bullets(ctx.features.filter((f) => f.included).map((f) => `${f.name} — ${f.rationale}`), t('common.none_captured')),
      h2(t('heading.excluded')),
      bullets(ctx.features.filter((f) => !f.included).map((f) => `${f.name} — ${f.rationale}`), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  post_mvp_scope: (ctx, t) => ({
    title: t('title.post_mvp_scope'),
    body: [h1(t('title.post_mvp_scope')), bullets(ctx.features.filter((f) => !f.included).map((f) => f.name), t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  ux_flow: (ctx, t) => ({
    title: t('title.ux_flow'),
    body: [
      h1(t('title.ux_flow')),
      para(ctx.screens.join(' → ')),
      h2(t('heading.steps')),
      bullets(ctx.screens.map((s, i) => t('common.step_label', { n: i + 1, text: s })), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  screen_map: (ctx, t) => ({
    title: t('title.screen_map'),
    body: [h1(t('title.screen_map')), bullets(ctx.screens.map((s) => t('common.screen_purpose_default', { screen: s })), t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  design_brd: (ctx, t) => ({
    title: t('title.design_brd'),
    body: [
      h1(t('title.design_brd')),
      h2(t('heading.principles')),
      bullets([t('common.principle_flat_design'), t('common.principle_typography'), t('common.principle_multilingual')], t('common.none_captured')),
      h2(t('heading.screens_to_design')),
      bullets(ctx.screens, t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  frontend_brd: (ctx, t) => ({
    title: t('title.frontend_brd'),
    body: [
      h1(t('title.frontend_brd')),
      h2(t('heading.screens')),
      bullets(ctx.screens, t('common.none_captured')),
      h2(t('heading.apis_consumed')),
      bullets(ctx.endpoints.map((e) => `${e.method} ${e.path}`), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  backend_brd: (ctx, t) => ({
    title: t('title.backend_brd'),
    body: [
      h1(t('title.backend_brd')),
      h2(t('heading.services_entities')),
      bullets(ctx.entities.map((e) => t('common.entity_service_suffix', { entity: e.name })), t('common.none_captured')),
      h2(t('heading.endpoints_supporting_ux')),
      bullets(ctx.endpoints.map((e) => `${e.method} ${e.path} → ${e.entity}`), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  data_model: (ctx, t) => ({
    title: t('title.data_model'),
    body: [
      h1(t('title.data_model')),
      ...ctx.entities.map((e) => `${h2(e.name)}\n${bullets(e.fields, t('common.none_captured'))}`),
      provenance(ctx, t),
    ].join('\n'),
  }),

  api_requirements: (ctx, t) => ({
    title: t('title.api_requirements'),
    body: [
      h1(t('title.api_requirements')),
      h2(t('heading.endpoints')),
      bullets(ctx.endpoints.map((e) => t('common.api_operates_on', { method: e.method, path: e.path, entity: e.entity })), t('common.none_captured')),
      h2(t('heading.entities')),
      bullets(ctx.entities.map((e) => e.name), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  ai_agent_instructions: (ctx, t) => ({
    title: t('title.ai_agent_instructions'),
    body: [
      h1(t('title.ai_agent_instructions')),
      para(t('common.ai_agent_intro')),
      bullets([
        t('common.ai_scaffold', { format: ctx.niche.recommendedProductFormat }),
        t('common.ai_implement_entities', { entities: ctx.entities.map((e) => e.name).join(', ') }),
        t('common.ai_implement_endpoints', { endpoints: ctx.endpoints.map((e) => `${e.method} ${e.path}`).join('; ') }),
        t('common.ai_build_screens', { screens: ctx.screens.join(', ') }),
        t('common.ai_do_not_invent'),
      ], t('common.none_captured')),
      h2(t('heading.constraints')),
      bullets(ctx.constraints.map((c) => c.text), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  acceptance_criteria: (ctx, t) => ({
    title: t('title.acceptance_criteria'),
    body: [
      h1(t('title.acceptance_criteria')),
      ...ctx.features.filter((f) => f.included).map((f) =>
        `${h2(f.name)}\n- ${t('common.acceptance_gwt', { given: t('gwt.given'), when: t('gwt.when'), then: t('gwt.then'), feature: f.name })}`,
      ),
      provenance(ctx, t),
    ].join('\n'),
  }),

  monetization_plan: (ctx, t) => ({
    title: t('title.monetization_plan'),
    body: [
      h1(t('title.monetization_plan')),
      h2(t('heading.model')),
      para(ctx.niche.monetization),
      h2(t('heading.fit_to_icp')),
      para(t('common.pricing_fit', { segment: ctx.icp.segment })),
      provenance(ctx, t),
    ].join('\n'),
  }),

  go_to_market_plan: (ctx, t) => ({
    title: t('title.go_to_market_plan'),
    body: [
      h1(t('title.go_to_market_plan')),
      h2(t('heading.buyer')),
      para(ctx.icp.segment),
      h2(t('heading.channels')),
      bullets([t('common.gtm_channel_direct'), t('common.gtm_channel_content'), t('common.gtm_channel_partnerships')], t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  analytics_plan: (ctx, t) => ({
    title: t('title.analytics_plan'),
    body: [h1(t('title.analytics_plan')), bullets([t('common.analytics_activation'), t('common.analytics_retention'), t('common.analytics_revenue')], t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  risks_and_assumptions: (ctx, t) => ({
    title: t('title.risks_and_assumptions'),
    body: [
      h1(t('title.risks_and_assumptions')),
      h2(t('heading.risks')),
      bullets([t('common.risk_overall', { level: ctx.niche.riskLevel, mitigation: t('common.mitigation_label') }), t('common.risk_stage_spend', { mitigation: t('common.mitigation_label') })], t('common.none_captured')),
      h2(t('heading.assumptions')),
      bullets(ctx.assumptions.map((a) => a.text), t('common.none_captured')),
      h2(t('heading.weak_score_dimensions')),
      bullets((ctx.score?.breakdown ?? []).filter((b) => b.assumptionBased).map((b) => b.dimension.replace(/_/g, ' ')), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  research_questions: (ctx, t) => ({
    title: t('title.research_questions'),
    body: [h1(t('title.research_questions')), bullets(ctx.unresolvedQuestions.map((q) => q.text), t('common.none_captured')), provenance(ctx, t)].join('\n'),
  }),

  roadmap: (ctx, t) => ({
    title: t('title.roadmap'),
    body: [
      h1(t('title.roadmap')),
      h2(t('heading.phase1_mvp')),
      bullets(ctx.features.filter((f) => f.included).map((f) => f.name), t('common.none_captured')),
      h2(t('heading.phase2_post_mvp')),
      bullets(ctx.features.filter((f) => !f.included).map((f) => f.name), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  market_selection_memo: (ctx, t) => ({
    title: t('title.market_selection_memo'),
    body: [
      h1(t('title.market_selection_memo')),
      para(t('common.market_selection_summary', {
        scope: ctx.market.scope,
        country: ctx.market.country ?? t('common.global'),
        language: ctx.market.marketLanguage,
      })),
      para(t('common.market_selection_note')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  evidence_map: (ctx, t) => ({
    title: t('title.evidence_map'),
    body: [
      h1(t('title.evidence_map')),
      bullets(ctx.claims.map((c) => `**${c.type.replace(/_/g, ' ')}** — ${c.text} (confidence: ${c.confidenceLevel})`), t('common.none_captured')),
      h2(t('heading.assumptions')),
      bullets(ctx.assumptions.map((a) => a.text), t('common.none_captured')),
      h2(t('heading.unresolved_questions')),
      bullets(ctx.unresolvedQuestions.map((q) => q.text), t('common.none_captured')),
      provenance(ctx, t),
    ].join('\n'),
  }),

  source_appendix: (ctx, t) => ({
    title: t('title.source_appendix'),
    body: [
      h1(t('title.source_appendix')),
      h2(t('heading.sources')),
      bullets(ctx.sourceRefs.map((s) => `${s.adapter}${s.title ? ` — ${s.title}` : ''}${s.url ? ` (${s.url})` : ''}`), t('common.none_captured')),
      ctx.sourceRefs.length === 0 ? `\n_${t('common.source_note')}_` : '',
      provenance(ctx, t),
    ].join('\n'),
  }),

  // ── Session 14: Breakout / Build Blueprint documents (optional) ────────────

  venture_thesis: (ctx, t) => {
    const th = ctx.ventureThesis;
    if (!th) return { title: t('title.venture_thesis'), body: [h1(t('title.venture_thesis')), para(`_${t('common.venture_not_generated')}_`), provenance(ctx, t)].join('\n') };
    return {
      title: t('title.venture_thesis'),
      body: [
        h1(t('title.venture_thesis')),
        para(th.breakoutThesis),
        h2(t('heading.why_now')),
        sec(th.whyNow, t),
        h2(t('heading.macro_shifts')),
        bullets(th.macroShifts, t('common.none_captured')),
        h2(t('heading.entry_wedge')),
        sec(th.entryWedge, t),
        h2(t('heading.expansion_path')),
        sec(th.expansionPath, t),
        h2(t('heading.target_customer')),
        para(th.targetCustomer),
        h2(t('heading.pain_economics')),
        sec(th.painEconomics, t),
        h2(t('heading.alternatives_incumbents')),
        bullets(th.alternatives, t('common.none_captured')),
        h2(t('heading.ai_unlock')),
        sec(th.aiUnlock, t),
        h2(t('heading.distribution_wedge')),
        sec(th.distributionWedge, t),
        h2(t('heading.data_workflow_moat')),
        sec(th.dataWorkflowMoat, t),
        h2(t('heading.monetization_path')),
        para(th.monetizationPath),
        h2(t('heading.market_language_constraints')),
        para(th.marketConstraints),
        h2(t('heading.venture_scale_narrative')),
        sec(th.ventureScaleNarrative, t),
        h2(t('heading.kill_reasons')),
        bullets(th.killReasons, t('common.none_captured')),
        h2(t('heading.what_must_be_true')),
        bullets(th.whatMustBeTrue, t('common.none_captured')),
        h2(t('heading.first_validation_experiments')),
        bullets(th.firstValidationExperiments, t('common.none_captured')),
        h2(t('heading.assumptions')),
        bullets(th.assumptions, t('common.none_captured')),
        h2(t('heading.unresolved_questions')),
        bullets(th.unresolvedQuestions, t('common.none_captured')),
        para(`> ${t('common.venture_confidence_note', { pct: Math.round(th.evidenceConfidence.value * 100), level: th.evidenceConfidence.level })}`),
      ].join('\n'),
    };
  },

  breakout_opportunity_memo: (ctx, t) => {
    const th = ctx.ventureThesis;
    const vs = ctx.ventureScale;
    return {
      title: t('title.breakout_opportunity_memo'),
      body: [
        h1(t('title.breakout_opportunity_memo')),
        para(th?.breakoutThesis ?? t('common.breakout_opportunity_around', { title: ctx.niche.title })),
        h2(t('heading.scores_kept_separate')),
        bullets([
          t('common.breakout_score_opportunity', { score: ctx.score ? `${ctx.score.totalScore}/100` : 'n/a' }),
          t('common.breakout_score_confidence', { pct: ctx.score ? `${Math.round(ctx.score.confidenceValue * 100)}%` : 'n/a' }),
          t('common.breakout_score_venture_scale', { score: vs ? `${vs.totalScore}/100` : 'n/a' }),
          t('common.breakout_score_build_readiness', { score: ctx.buildBlueprint ? `${ctx.buildBlueprint.buildReadiness.totalScore}/100` : 'n/a' }),
        ], t('common.none_captured')),
        h2(t('heading.why_now')),
        para(th?.whyNow.text ?? ctx.niche.whyNow),
        h2(t('heading.entry_wedge_expansion')),
        para(`${th?.entryWedge.text ?? ''}\n\n${th?.expansionPath.text ?? ''}`),
        h2(t('heading.venture_scale_dimensions')),
        bullets((vs?.breakdown ?? []).map((b) => `${b.dimension.replace(/_/g, ' ')}: ${b.score}/100${b.assumptionBased ? ' (assumption)' : ''} — ${b.reasoning}`), t('common.none_captured')),
        h2(t('heading.kill_reasons')),
        bullets(th?.killReasons ?? [t('common.breakout_validate_wedge')], t('common.none_captured')),
        para(`> ${t('common.breakout_no_fake_tam')}`),
        provenance(ctx, t),
      ].join('\n'),
    };
  },

  build_blueprint: (ctx, t) => {
    const bp = ctx.buildBlueprint;
    if (!bp) return { title: t('title.build_blueprint'), body: [h1(t('title.build_blueprint')), para(`_${t('common.blueprint_not_generated')}_`), provenance(ctx, t)].join('\n') };
    return {
      title: t('title.build_blueprint'),
      body: [
        h1(t('title.build_blueprint')),
        para(t('common.blueprint_readiness_summary', { score: bp.buildReadiness.totalScore, level: bp.buildReadiness.level })),
        h2(t('heading.build_readiness_breakdown')),
        bullets(bp.buildReadiness.breakdown.map((d) => `${d.dimension.replace(/_/g, ' ')}: ${d.score}/100 — ${d.reasoning}`), t('common.none_captured')),
        bp.buildReadiness.warnings.length ? h2(t('heading.warnings')) : '',
        bp.buildReadiness.warnings.length ? bullets(bp.buildReadiness.warnings, t('common.none_captured')) : '',
        h2(t('heading.screens')),
        ...bp.screenContracts.map((s) =>
          [
            h2(s.name),
            para(t('common.blueprint_purpose', { purpose: s.purpose })),
            para(t('common.blueprint_primary_action', { action: s.primaryAction })),
            t('common.blueprint_states', { states: s.states.map((st) => st.kind).join(', ') }),
            t('common.blueprint_backend', { backend: s.backendDependencies.join(', ') || t('common.blueprint_frontend_only') }),
            t('common.blueprint_acceptance', { acceptance: s.acceptanceCriteria[0] ?? '' }),
          ].join('\n'),
        ),
        h2(t('heading.api_screen_map')),
        bullets(bp.apiToScreenMap.map((m) => `${m.screen}: reads ${m.endpoints.map((e) => `${e.method} ${e.path}`).join(', ') || '—'}; writes ${m.actions.map((a) => `${a.method} ${a.path}`).join(', ') || '—'}`), t('common.none_captured')),
        h2(t('heading.permission_matrix')),
        bullets(bp.permissionMatrix.map((p) => `${p.role}: allowed [${p.allowedActions.join(', ')}], blocked [${p.blockedActions.join(', ') || 'none'}]`), t('common.none_captured')),
        h2(t('heading.analytics_events')),
        bullets(bp.analyticsEvents.slice(0, 20).map((e) => `${e.event} — ${e.trigger} (${e.productQuestion})`), t('common.none_captured')),
        provenance(ctx, t),
      ].join('\n'),
    };
  },

  do_not_build: (ctx, t) => {
    const items = ctx.buildBlueprint?.doNotBuild ?? [];
    return {
      title: t('title.do_not_build'),
      body: [
        h1(t('title.do_not_build')),
        para(t('common.do_not_build_intro')),
        bullets(items.map((i) => `**${i.item}** — ${i.reason}`), t('common.none_captured')),
        items.length === 0 ? para(`_${t('common.do_not_build_empty')}_`) : '',
        provenance(ctx, t),
      ].join('\n'),
    };
  },
};

/**
 * Which documents a pack depth includes. `build_ready` is the full 27 plus the
 * optional Session-14 blueprint documents. The blueprint docs are appended to
 * build-oriented depths only; the canonical 27 remain unchanged.
 */
export const DEPTH_DOCUMENTS: Record<ProductPackDepth, DocumentType[]> = {
  build_ready: [...REQUIRED_DOCUMENT_TYPES, 'venture_thesis', 'breakout_opportunity_memo', 'build_blueprint', 'do_not_build'],
  quick_opportunity: [
    'product_vision', 'market_context', 'target_audience_icp', 'problem_map', 'mvp_scope',
    'monetization_plan', 'risks_and_assumptions', 'evidence_map', 'source_appendix', 'venture_thesis',
  ],
  investor_grade: [
    'product_vision', 'market_context', 'target_audience_icp', 'monetization_plan', 'go_to_market_plan',
    'analytics_plan', 'roadmap', 'risks_and_assumptions', 'market_selection_memo', 'evidence_map', 'source_appendix',
    'venture_thesis', 'breakout_opportunity_memo',
  ],
  agency_client: [
    'product_vision', 'market_context', 'target_audience_icp', 'problem_map', 'feature_checklist', 'mvp_scope',
    'ux_flow', 'monetization_plan', 'go_to_market_plan', 'roadmap', 'evidence_map', 'source_appendix',
  ],
  ai_agent_engineering: [
    'product_vision', 'feature_checklist', 'mvp_scope', 'ux_flow', 'screen_map', 'design_brd', 'frontend_brd',
    'backend_brd', 'data_model', 'api_requirements', 'ai_agent_instructions', 'acceptance_criteria', 'evidence_map', 'source_appendix',
    'venture_thesis', 'build_blueprint', 'do_not_build',
  ],
};

export function buildDocument(docType: DocumentType, ctx: PackContext): BuiltDocument {
  const t = createPackContentTranslator(ctx.language);
  return BUILDERS[docType](ctx, t);
}
