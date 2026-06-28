/**
 * Deterministic, evidence-based document builders. One builder per DocumentType.
 *
 * These produce structured Markdown (not a long AI essay) from the pack context.
 * They are honest: anything not supported by evidence is explicitly labeled an
 * assumption. When an LLM connection exists, the pack service may enhance a
 * document via LlmRouterService — but these builders are always the baseline.
 */
import {
  REQUIRED_DOCUMENT_TYPES,
  type DocumentType,
  type ProductPackDepth,
  type VerticalTemplate,
} from '@signalkit/shared';
import type { PackContext } from './context';

export interface BuiltDocument {
  title: string;
  body: string;
}

const h1 = (t: string) => `# ${t}\n`;
const h2 = (t: string) => `\n## ${t}\n`;
const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- (none captured yet — assumption)');
const para = (t: string) => `${t}\n`;
/** Render a thesis section, flagging assumptions honestly. */
const sec = (s: { text: string; assumption: boolean }) => `${s.text}${s.assumption ? '\n\n_(assumption — not yet validated)_' : ''}\n`;

function provenance(ctx: PackContext): string {
  const ev = ctx.evidence.length;
  const cl = ctx.claims.length;
  const conf = ctx.score ? `${Math.round(ctx.score.confidenceValue * 100)}%` : 'n/a';
  return `> Evidence-backed: ${ev} evidence item(s), ${cl} claim(s). Confidence ${conf} (separate from opportunity). Unsupported points are marked as assumptions.`;
}

const VERTICAL_NOTE: Record<VerticalTemplate, string> = {
  b2b_saas: 'B2B SaaS: emphasize buyer vs user, seat expansion and integration depth.',
  mobile_consumer_app: 'Mobile consumer: emphasize retention loops and app-store discovery.',
  marketplace: 'Marketplace: emphasize liquidity and the harder side of supply/demand.',
  ai_agent_product: 'AI agent product: emphasize task reliability, guardrails and evaluation.',
  api_product: 'API product: emphasize DX, docs and usage-based pricing.',
  community_content_product: 'Community/content: emphasize contribution loops and moderation.',
  local_service_saas: 'Local service SaaS: emphasize on-the-ground onboarding and locale fit.',
  compliance_saas: 'Compliance SaaS: emphasize audit trails and regulatory mapping.',
  health_adjacent_product: 'Health-adjacent: emphasize safety, consent and non-clinical scope.',
  fintech_adjacent_product: 'Fintech-adjacent: emphasize KYC/payments readiness and risk.',
  ecommerce_tool: 'Ecommerce tool: emphasize conversion impact and platform integrations.',
  creator_economy_tool: 'Creator tool: emphasize monetization for creators and audience portability.',
  internal_enterprise_tool: 'Internal enterprise tool: emphasize SSO, permissions and rollout.',
};

type Builder = (ctx: PackContext) => BuiltDocument;

export const DOCUMENT_BUILDERS: Record<DocumentType, Builder> = {
  product_vision: (ctx) => ({
    title: 'Product Vision',
    body: [
      h1('Product Vision'),
      para(`**${ctx.niche.title}** — ${ctx.niche.oneLiner}`),
      h2('Why now'),
      para(ctx.niche.whyNow),
      h2('Who it is for'),
      para(ctx.icp.segment),
      h2('Vertical lens'),
      para(VERTICAL_NOTE[ctx.vertical]),
      h2('Provenance'),
      provenance(ctx),
    ].join('\n'),
  }),

  market_context: (ctx) => ({
    title: 'Market Context',
    body: [
      h1('Market Context'),
      h2('Market'),
      para(`Scope: ${ctx.market.scope}. Country: ${ctx.market.country ?? 'global'}. Language: ${ctx.market.marketLanguage}.`),
      h2('Momentum'),
      para(ctx.score ? ctx.score.explanation : 'Not yet scored.'),
      h2('Competitors / alternatives'),
      bullets(ctx.niche.competitors),
      h2('Evidence'),
      bullets(ctx.claims.filter((c) => c.type === 'market_demand' || c.type === 'competition').map((c) => `${c.text} (confidence: ${c.confidenceLevel})`)),
      provenance(ctx),
    ].join('\n'),
  }),

  target_audience_icp: (ctx) => ({
    title: 'Target Audience / ICP',
    body: [h1('Target Audience / ICP'), h2('Segment'), para(ctx.icp.segment), h2('Pains'), bullets(ctx.icp.pains), provenance(ctx)].join('\n'),
  }),

  jobs_to_be_done: (ctx) => ({
    title: 'Jobs To Be Done',
    body: [h1('Jobs To Be Done'), bullets(ctx.icp.jtbd), provenance(ctx)].join('\n'),
  }),

  problem_map: (ctx) => ({
    title: 'Problem Map',
    body: [h1('Problem Map'), h2('Core problem'), para(ctx.niche.problem), h2('Sub-problems'), bullets(ctx.icp.pains), provenance(ctx)].join('\n'),
  }),

  user_scenarios: (ctx) => ({
    title: 'User Scenarios',
    body: [h1('User Scenarios'), bullets(ctx.niche.useCases.map((u, i) => `Scenario ${i + 1}: ${u}`)), provenance(ctx)].join('\n'),
  }),

  feature_checklist: (ctx) => ({
    title: 'Feature Checklist',
    body: [h1('Feature Checklist'), bullets(ctx.features.map((f) => `[${f.included ? 'MVP' : 'Post-MVP'}] ${f.name}`)), provenance(ctx)].join('\n'),
  }),

  mvp_scope: (ctx) => ({
    title: 'MVP Scope',
    body: [
      h1('MVP Scope'),
      h2('Included'),
      bullets(ctx.features.filter((f) => f.included).map((f) => `${f.name} — ${f.rationale}`)),
      h2('Excluded'),
      bullets(ctx.features.filter((f) => !f.included).map((f) => `${f.name} — ${f.rationale}`)),
      provenance(ctx),
    ].join('\n'),
  }),

  post_mvp_scope: (ctx) => ({
    title: 'Post-MVP Scope',
    body: [h1('Post-MVP Scope'), bullets(ctx.features.filter((f) => !f.included).map((f) => f.name)), provenance(ctx)].join('\n'),
  }),

  ux_flow: (ctx) => ({
    title: 'UX Flow',
    body: [
      h1('UX Flow'),
      para('Primary flow across screens:'),
      para(ctx.screens.join(' → ')),
      h2('Steps'),
      bullets(ctx.screens.map((s, i) => `Step ${i + 1}: ${s}`)),
      provenance(ctx),
    ].join('\n'),
  }),

  screen_map: (ctx) => ({
    title: 'Screen Map',
    body: [h1('Screen Map'), bullets(ctx.screens.map((s) => `${s} — purpose: support the primary flow`)), provenance(ctx)].join('\n'),
  }),

  design_brd: (ctx) => ({
    title: 'Design BRD',
    body: [
      h1('Design BRD'),
      h2('Principles'),
      bullets(['Premium flat 2D — no gradients or glassmorphism', 'Strong typography and dense, readable layouts', 'Multilingual-safe (long labels, RTL-ready)']),
      h2('Screens to design'),
      bullets(ctx.screens),
      provenance(ctx),
    ].join('\n'),
  }),

  frontend_brd: (ctx) => ({
    title: 'Frontend BRD',
    body: [
      h1('Frontend BRD'),
      h2('Screens'),
      bullets(ctx.screens),
      h2('APIs consumed'),
      bullets(ctx.endpoints.map((e) => `${e.method} ${e.path}`)),
      provenance(ctx),
    ].join('\n'),
  }),

  backend_brd: (ctx) => ({
    title: 'Backend BRD',
    body: [
      h1('Backend BRD'),
      h2('Services & entities'),
      bullets(ctx.entities.map((e) => `${e.name} service`)),
      h2('Endpoints supporting the UX'),
      bullets(ctx.endpoints.map((e) => `${e.method} ${e.path} → ${e.entity}`)),
      provenance(ctx),
    ].join('\n'),
  }),

  data_model: (ctx) => ({
    title: 'Data Model',
    body: [
      h1('Data Model'),
      ...ctx.entities.map((e) => `${h2(e.name)}\n${bullets(e.fields)}`),
      provenance(ctx),
    ].join('\n'),
  }),

  api_requirements: (ctx) => ({
    title: 'API / Integration Requirements',
    body: [
      h1('API / Integration Requirements'),
      h2('Endpoints'),
      bullets(ctx.endpoints.map((e) => `${e.method} ${e.path} — operates on ${e.entity}`)),
      h2('Entities'),
      bullets(ctx.entities.map((e) => e.name)),
      provenance(ctx),
    ].join('\n'),
  }),

  ai_agent_instructions: (ctx) => ({
    title: 'AI Agent Instructions',
    body: [
      h1('AI Agent Instructions'),
      para('Executable build steps for an AI coding agent:'),
      bullets([
        `Scaffold a ${ctx.niche.recommendedProductFormat} app.`,
        `Implement entities: ${ctx.entities.map((e) => e.name).join(', ')}.`,
        `Implement endpoints: ${ctx.endpoints.map((e) => `${e.method} ${e.path}`).join('; ')}.`,
        `Build screens: ${ctx.screens.join(', ')}.`,
        'Do not invent data; respect the constraints and acceptance criteria.',
      ]),
      h2('Constraints'),
      bullets(ctx.constraints.map((c) => c.text)),
      provenance(ctx),
    ].join('\n'),
  }),

  acceptance_criteria: (ctx) => ({
    title: 'Acceptance Criteria',
    body: [
      h1('Acceptance Criteria'),
      ...ctx.features.filter((f) => f.included).map((f) =>
        `${h2(f.name)}\n- Given a signed-in user, When they use "${f.name}", Then the system fulfils the job and persists the result.`,
      ),
      provenance(ctx),
    ].join('\n'),
  }),

  monetization_plan: (ctx) => ({
    title: 'Monetization Plan',
    body: [
      h1('Monetization Plan'),
      h2('Model'),
      para(ctx.niche.monetization),
      h2('Fit to ICP'),
      para(`Pricing targets ${ctx.icp.segment} and their willingness to pay (validate where marked assumption).`),
      provenance(ctx),
    ].join('\n'),
  }),

  go_to_market_plan: (ctx) => ({
    title: 'Go-to-Market Plan',
    body: [
      h1('Go-to-Market Plan'),
      h2('Buyer'),
      para(ctx.icp.segment),
      h2('Channels'),
      bullets(['Direct outreach to the ICP segment', 'Content addressing the core problem', 'Partnerships in the target market']),
      provenance(ctx),
    ].join('\n'),
  }),

  analytics_plan: (ctx) => ({
    title: 'Analytics / Metrics Plan',
    body: [h1('Analytics / Metrics Plan'), bullets(['Activation: first core action completed', 'Retention: repeat usage by segment', 'Revenue: conversion to paid']), provenance(ctx)].join('\n'),
  }),

  risks_and_assumptions: (ctx) => ({
    title: 'Risks and Assumptions',
    body: [
      h1('Risks and Assumptions'),
      h2('Risks'),
      bullets([`Overall risk level: ${ctx.niche.riskLevel}. Mitigation: validate the weakest assumptions before build.`, 'Mitigation: stage spend behind go/no-go research.']),
      h2('Assumptions'),
      bullets(ctx.assumptions.map((a) => a.text)),
      h2('Weak (assumption-based) score dimensions'),
      bullets((ctx.score?.breakdown ?? []).filter((b) => b.assumptionBased).map((b) => b.dimension.replace(/_/g, ' '))),
      provenance(ctx),
    ].join('\n'),
  }),

  research_questions: (ctx) => ({
    title: 'Research Questions',
    body: [h1('Research Questions'), bullets(ctx.unresolvedQuestions.map((q) => q.text)), provenance(ctx)].join('\n'),
  }),

  roadmap: (ctx) => ({
    title: 'Roadmap',
    body: [
      h1('Roadmap'),
      h2('Phase 1 — MVP'),
      bullets(ctx.features.filter((f) => f.included).map((f) => f.name)),
      h2('Phase 2 — Post-MVP'),
      bullets(ctx.features.filter((f) => !f.included).map((f) => f.name)),
      provenance(ctx),
    ].join('\n'),
  }),

  market_selection_memo: (ctx) => ({
    title: 'Market Selection Memo',
    body: [
      h1('Market Selection Memo'),
      para(`Recommended scope: ${ctx.market.scope}. Primary market: ${ctx.market.country ?? 'global'} (${ctx.market.marketLanguage}).`),
      para('Compare alternative markets in the niche workspace before committing.'),
      provenance(ctx),
    ].join('\n'),
  }),

  evidence_map: (ctx) => ({
    title: 'Evidence Map',
    body: [
      h1('Evidence Map'),
      bullets(ctx.claims.map((c) => `**${c.type.replace(/_/g, ' ')}** — ${c.text} (confidence: ${c.confidenceLevel})`)),
      h2('Assumptions'),
      bullets(ctx.assumptions.map((a) => a.text)),
      h2('Unresolved questions'),
      bullets(ctx.unresolvedQuestions.map((q) => q.text)),
      provenance(ctx),
    ].join('\n'),
  }),

  source_appendix: (ctx) => ({
    title: 'Source Appendix',
    body: [
      h1('Source Appendix'),
      h2('Sources'),
      bullets(ctx.sourceRefs.map((s) => `${s.adapter}${s.title ? ` — ${s.title}` : ''}${s.url ? ` (${s.url})` : ''}`)),
      ctx.sourceRefs.length === 0 ? '\n_All claims must trace to a source; add sources to strengthen this pack._' : '',
      provenance(ctx),
    ].join('\n'),
  }),

  // ── Session 14: Breakout / Build Blueprint documents (optional) ────────────

  venture_thesis: (ctx) => {
    const t = ctx.ventureThesis;
    if (!t) return { title: 'Venture Thesis', body: [h1('Venture Thesis'), para('_Not generated for this niche yet._'), provenance(ctx)].join('\n') };
    return {
      title: 'Venture Thesis',
      body: [
        h1('Venture Thesis'),
        para(t.breakoutThesis),
        h2('Why now'),
        sec(t.whyNow),
        h2('Macro shifts'),
        bullets(t.macroShifts),
        h2('Entry wedge'),
        sec(t.entryWedge),
        h2('Expansion path'),
        sec(t.expansionPath),
        h2('Target customer'),
        para(t.targetCustomer),
        h2('Pain economics'),
        sec(t.painEconomics),
        h2('Alternatives / incumbents'),
        bullets(t.alternatives),
        h2('AI unlock'),
        sec(t.aiUnlock),
        h2('Distribution wedge'),
        sec(t.distributionWedge),
        h2('Data / workflow moat'),
        sec(t.dataWorkflowMoat),
        h2('Monetization path'),
        para(t.monetizationPath),
        h2('Market / language / local constraints'),
        para(t.marketConstraints),
        h2('Venture scale narrative'),
        sec(t.ventureScaleNarrative),
        h2('Kill reasons'),
        bullets(t.killReasons),
        h2('What must be true'),
        bullets(t.whatMustBeTrue),
        h2('First validation experiments'),
        bullets(t.firstValidationExperiments),
        h2('Assumptions'),
        bullets(t.assumptions),
        h2('Unresolved questions'),
        bullets(t.unresolvedQuestions),
        para(`> Evidence confidence ${Math.round(t.evidenceConfidence.value * 100)}% (${t.evidenceConfidence.level}). Venture scale is potential, not a guarantee — assumptions are not facts.`),
      ].join('\n'),
    };
  },

  breakout_opportunity_memo: (ctx) => {
    const t = ctx.ventureThesis;
    const vs = ctx.ventureScale;
    return {
      title: 'Breakout Opportunity Memo',
      body: [
        h1('Breakout Opportunity Memo'),
        para(t?.breakoutThesis ?? `Opportunity around ${ctx.niche.title}.`),
        h2('Scores (kept separate)'),
        bullets([
          `Opportunity: ${ctx.score ? `${ctx.score.totalScore}/100` : 'n/a'} — is this a good opportunity?`,
          `Confidence: ${ctx.score ? `${Math.round(ctx.score.confidenceValue * 100)}%` : 'n/a'} — how well supported?`,
          `Venture Scale: ${vs ? `${vs.totalScore}/100` : 'n/a'} — can it become large?`,
          `Build Readiness: ${ctx.buildBlueprint ? `${ctx.buildBlueprint.buildReadiness.totalScore}/100` : 'n/a'} — ready to build?`,
        ]),
        h2('Why now'),
        para(t?.whyNow.text ?? ctx.niche.whyNow),
        h2('Entry wedge → expansion'),
        para(`${t?.entryWedge.text ?? ''}\n\n${t?.expansionPath.text ?? ''}`),
        h2('Venture scale dimensions'),
        bullets((vs?.breakdown ?? []).map((b) => `${b.dimension.replace(/_/g, ' ')}: ${b.score}/100${b.assumptionBased ? ' (assumption)' : ''} — ${b.reasoning}`)),
        h2('Kill reasons'),
        bullets(t?.killReasons ?? ['Validate the wedge before building.']),
        para('> No fabricated TAM. No unsupported unicorn claims. Weak market size remains an assumption.'),
        provenance(ctx),
      ].join('\n'),
    };
  },

  build_blueprint: (ctx) => {
    const bp = ctx.buildBlueprint;
    if (!bp) return { title: 'Build Blueprint', body: [h1('Build Blueprint'), para('_Not generated for this pack yet._'), provenance(ctx)].join('\n') };
    return {
      title: 'Build Blueprint',
      body: [
        h1('Build Blueprint'),
        para(`Build Readiness: **${bp.buildReadiness.totalScore}/100** (${bp.buildReadiness.level}). Separate from opportunity, confidence and venture scale.`),
        h2('Build readiness breakdown'),
        bullets(bp.buildReadiness.breakdown.map((d) => `${d.dimension.replace(/_/g, ' ')}: ${d.score}/100 — ${d.reasoning}`)),
        bp.buildReadiness.warnings.length ? h2('Warnings') : '',
        bp.buildReadiness.warnings.length ? bullets(bp.buildReadiness.warnings) : '',
        h2('Screens'),
        ...bp.screenContracts.map((s) =>
          [
            h2(s.name),
            para(`Purpose: ${s.purpose}`),
            para(`Primary action: ${s.primaryAction}`),
            `States: ${s.states.map((st) => st.kind).join(', ')}`,
            `Backend: ${s.backendDependencies.join(', ') || 'frontend-only'}`,
            `Acceptance: ${s.acceptanceCriteria[0] ?? ''}`,
          ].join('\n'),
        ),
        h2('API → Screen map'),
        bullets(bp.apiToScreenMap.map((m) => `${m.screen}: reads ${m.endpoints.map((e) => `${e.method} ${e.path}`).join(', ') || '—'}; writes ${m.actions.map((a) => `${a.method} ${a.path}`).join(', ') || '—'}`)),
        h2('Permission matrix'),
        bullets(bp.permissionMatrix.map((p) => `${p.role}: allowed [${p.allowedActions.join(', ')}], blocked [${p.blockedActions.join(', ') || 'none'}]`)),
        h2('Analytics events'),
        bullets(bp.analyticsEvents.slice(0, 20).map((e) => `${e.event} — ${e.trigger} (${e.productQuestion})`)),
        provenance(ctx),
      ].join('\n'),
    };
  },

  do_not_build: (ctx) => {
    const items = ctx.buildBlueprint?.doNotBuild ?? [];
    return {
      title: 'DO NOT BUILD',
      body: [
        h1('DO NOT BUILD'),
        para('Explicit out-of-scope list. AI coding agents and developers must NOT implement these without an explicit user request.'),
        bullets(items.map((i) => `**${i.item}** — ${i.reason}`)),
        items.length === 0 ? para('_No exclusions captured — generate the build blueprint to populate this._') : '',
        provenance(ctx),
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
  return DOCUMENT_BUILDERS[docType](ctx);
}
