import { describe, it, expect } from 'vitest';
import { computeVentureScaleScore, REQUIRED_SCREEN_STATES, type ScoringInput } from '@signalkit/shared';
import { createPackContentTranslator } from '@signalkit/i18n';
import { buildPackContext, type PackContext, type PackContextInput } from './context';
import { buildBuildBlueprint } from './blueprint';
import { DEPTH_DOCUMENTS, buildDocument } from './templates';
import { runQualityGates, type DocForGate } from './quality-gates';

function makeInput(over: Partial<PackContextInput> = {}): PackContextInput {
  return {
    niche: {
      title: 'Clinic WhatsApp Copilot', oneLiner: 'Convert WhatsApp inquiries into booked visits.',
      problem: 'Manual replies overwhelm clinic staff.', targetAudience: 'Private clinics in Türkiye',
      whyNow: 'Messaging-first patients and cheap AI.', useCases: ['Book visits', 'Auto-reply FAQs', 'No-show reminders', 'Analytics'],
      competitors: ['Generic chatbots'], monetization: 'Monthly subscription.', mvpConcept: 'WhatsApp inbox + booking.',
      recommendedProductFormat: 'b2b_saas', riskLevel: 'medium',
    },
    score: { totalScore: 72, confidenceValue: 0.55, confidenceLevel: 'medium', explanation: 'Strong demand.', breakdown: [] },
    market: { country: 'TR', region: null, marketLanguage: 'tr', scope: 'manual_country' },
    language: 'tr', depth: 'build_ready', vertical: 'b2b_saas',
    claims: [{ id: 'c1', text: 'Staff want automation', type: 'user_pain', confidenceLevel: 'high' }],
    assumptions: [{ id: 'a1', text: 'Clinics will pay monthly' }],
    constraints: [{ id: 'k1', text: 'Comply with WhatsApp policy' }],
    unresolvedQuestions: [{ id: 'q1', text: 'Real no-show rate?' }],
    evidence: [{ id: 'e1', summary: 'Clinic quote', sourceRefId: 's1' }],
    sourceRefs: [{ id: 's1', url: 'https://example.com', title: 'Forum', adapter: 'url' }],
    ...over,
  };
}

const scoringInput: ScoringInput = {
  pain: 0.7, demand: 0.6, pricing: 0.5, competitor: 0.4, regulatory: 0.2, timing: 0.6,
  techShift: 0.7, audience: 0.5, distribution: 0.4, marketMatch: 0.8, freshness: 0.6,
  signalDensity: 0.5, evidenceStrength: 0.5, contradictionRatio: 0.1,
};

function ctxWithBlueprint(over: Partial<PackContextInput> = {}): PackContext {
  const ctx = buildPackContext(makeInput(over));
  ctx.ventureScale = computeVentureScaleScore(scoringInput);
  ctx.buildBlueprint = buildBuildBlueprint(ctx);
  return ctx;
}

describe('Build Blueprint generator', () => {
  it('produces a screen contract per screen, each with empty/loading/error states', () => {
    const ctx = ctxWithBlueprint();
    const bp = ctx.buildBlueprint!;
    expect(bp.screenContracts.length).toBe(ctx.screens.length);
    for (const s of bp.screenContracts) {
      const kinds = new Set(s.states.map((st) => st.kind));
      for (const r of REQUIRED_SCREEN_STATES) expect(kinds.has(r)).toBe(true);
      expect(s.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });

  it('maps API endpoints to screens and includes a DO_NOT_BUILD list', () => {
    const ctx = ctxWithBlueprint();
    const bp = ctx.buildBlueprint!;
    const t = createPackContentTranslator(ctx.language);
    expect(bp.apiToScreenMap.length).toBeGreaterThan(0);
    expect(bp.doNotBuild.length).toBeGreaterThan(0);
    // Checked against the translated text (ctx.language is 'tr' here) rather than
    // an English keyword regex, since DO_NOT_BUILD reasons are localized content.
    expect(bp.doNotBuild.some((d) => d.item === t('blueprint.dnb_app_generation_item'))).toBe(true);
    expect(bp.permissionMatrix.length).toBeGreaterThan(0);
  });

  it('computes a Build Readiness score separate from other scores', () => {
    const bp = ctxWithBlueprint().buildBlueprint!;
    expect(bp.buildReadiness.totalScore).toBeGreaterThan(0);
    expect(bp.buildReadiness.breakdown.some((d) => d.dimension === 'screen_state_coverage')).toBe(true);
  });
});

describe('Quality gates — blueprint checks', () => {
  function gatesFor(ctx: PackContext) {
    const docs: DocForGate[] = DEPTH_DOCUMENTS.build_ready.map((docType) => ({ docType, body: buildDocument(docType, ctx).body, language: ctx.language }));
    return runQualityGates(docs, ctx, DEPTH_DOCUMENTS.build_ready);
  }

  it('passes screen-state, DO_NOT_BUILD and venture-scale checks for a full blueprint', () => {
    const gate = gatesFor(ctxWithBlueprint());
    expect(gate.checks.find((c) => c.id === 'screen_states_complete')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'do_not_build_present')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'venture_scale_breakdown')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'no_fake_tam')!.status).toBe('pass');
  });

  it('FAILS the screen-states gate when a screen is missing required states', () => {
    const ctx = ctxWithBlueprint();
    ctx.buildBlueprint!.screenContracts[0]!.states = [{ kind: 'success', behavior: 'b' }];
    const gate = gatesFor(ctx);
    expect(gate.checks.find((c) => c.id === 'screen_states_complete')!.status).toBe('fail');
    expect(gate.status).toBe('failed');
  });

  it('FAILS no_fake_tam when an unsupported unicorn claim appears unflagged', () => {
    const ctx = ctxWithBlueprint();
    const docs: DocForGate[] = DEPTH_DOCUMENTS.build_ready.map((docType) => ({ docType, body: buildDocument(docType, ctx).body, language: ctx.language }));
    const tampered = docs.map((d) => (d.docType === 'venture_thesis' ? { ...d, body: d.body + '\nThis will become a $10 billion company.' } : d));
    const gate = runQualityGates(tampered, ctx, DEPTH_DOCUMENTS.build_ready);
    expect(gate.checks.find((c) => c.id === 'no_fake_tam')!.status).toBe('fail');
  });
});
