import { describe, it, expect } from 'vitest';
import { REQUIRED_DOCUMENT_TYPES } from '@signalkit/shared';
import { buildPackContext, type PackContextInput } from './context';
import { DEPTH_DOCUMENTS, buildDocument } from './templates';
import { runQualityGates, type DocForGate } from './quality-gates';

function makeInput(over: Partial<PackContextInput> = {}): PackContextInput {
  return {
    niche: {
      title: 'Clinic WhatsApp Copilot', oneLiner: 'Convert WhatsApp inquiries into booked visits.',
      problem: 'Clinic staff are overwhelmed by manual WhatsApp replies.', targetAudience: 'Private clinics in Türkiye',
      whyNow: 'Messaging-first patients and cheap AI.', useCases: ['Book visits via WhatsApp', 'Auto-reply to FAQs', 'No-show reminders', 'Sales analytics'],
      competitors: ['Generic chatbots'], monetization: 'Monthly subscription per clinic.', mvpConcept: 'WhatsApp inbox + booking.',
      recommendedProductFormat: 'b2b_saas', riskLevel: 'medium',
    },
    score: { totalScore: 72, confidenceValue: 0.55, confidenceLevel: 'medium', explanation: 'Strong demand; confidence medium.', breakdown: [{ dimension: 'mvp_feasibility', score: 60, assumptionBased: true }] },
    market: { country: 'TR', region: null, marketLanguage: 'tr', scope: 'manual_country' },
    language: 'tr',
    depth: 'build_ready',
    vertical: 'b2b_saas',
    claims: [{ id: 'c1', text: 'Staff want automation', type: 'user_pain', confidenceLevel: 'high' }, { id: 'c2', text: 'Demand is rising', type: 'market_demand', confidenceLevel: 'medium' }],
    assumptions: [{ id: 'a1', text: 'Clinics will pay monthly' }],
    constraints: [{ id: 'k1', text: 'Must comply with WhatsApp Business policy' }],
    unresolvedQuestions: [{ id: 'q1', text: 'What is the real no-show rate?' }],
    evidence: [{ id: 'e1', summary: 'Clinic owner quote', sourceRefId: 's1' }],
    sourceRefs: [{ id: 's1', url: 'https://example.com', title: 'Clinic forum', adapter: 'url' }],
    ...over,
  };
}

describe('pack templates & context', () => {
  it('build_ready includes all 27 canonical documents (plus optional blueprint docs)', () => {
    // The canonical 27 remain intact; Session 14 appends optional blueprint docs.
    for (const t of REQUIRED_DOCUMENT_TYPES) {
      expect(DEPTH_DOCUMENTS.build_ready).toContain(t);
    }
    expect(new Set(DEPTH_DOCUMENTS.build_ready).size).toBe(DEPTH_DOCUMENTS.build_ready.length);
    expect(DEPTH_DOCUMENTS.build_ready).toContain('venture_thesis');
    expect(DEPTH_DOCUMENTS.build_ready).toContain('build_blueprint');
    expect(DEPTH_DOCUMENTS.build_ready).toContain('do_not_build');
  });

  it('every builder produces a non-empty, headed document (not a long essay)', () => {
    const ctx = buildPackContext(makeInput());
    for (const docType of REQUIRED_DOCUMENT_TYPES) {
      const doc = buildDocument(docType, ctx);
      expect(doc.body.length).toBeGreaterThan(120);
      expect(doc.body).toContain('# '); // structured headings
    }
  });

  it('derives consistent screens/entities/endpoints', () => {
    const ctx = buildPackContext(makeInput());
    expect(ctx.screens.length).toBeGreaterThan(2);
    expect(ctx.entities.some((e) => e.name === 'User')).toBe(true);
    expect(ctx.endpoints.length).toBeGreaterThan(0);
  });
});

describe('quality gates', () => {
  function buildAll(over: Partial<PackContextInput> = {}) {
    const ctx = buildPackContext(makeInput(over));
    const docs: DocForGate[] = DEPTH_DOCUMENTS.build_ready.map((docType) => ({ docType, body: buildDocument(docType, ctx).body, language: ctx.language }));
    return { ctx, docs };
  }

  it('passes (or warns) a complete, consistent, evidence-backed pack', () => {
    const { ctx, docs } = buildAll();
    const gate = runQualityGates(docs, ctx, DEPTH_DOCUMENTS.build_ready);
    expect(gate.status).not.toBe('failed');
    expect(gate.checks.find((c) => c.id === 'mvp_included_excluded')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'acceptance_gwt')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'consistency_ux_screens')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'consistency_data_api')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'consistency_api_frontend')!.status).toBe('pass');
    expect(gate.checks.find((c) => c.id === 'risks_have_mitigations')!.status).toBe('pass');
  });

  it('FAILS when a required document is missing', () => {
    const { ctx, docs } = buildAll();
    const gate = runQualityGates(docs.filter((d) => d.docType !== 'data_model'), ctx, DEPTH_DOCUMENTS.build_ready);
    expect(gate.status).toBe('failed');
    expect(gate.checks.find((c) => c.id === 'required_docs_present')!.status).toBe('fail');
  });

  it('FAILS on lorem ipsum, empty, and wrong language', () => {
    const { ctx, docs } = buildAll();
    const tampered: DocForGate[] = docs.map((d) =>
      d.docType === 'product_vision' ? { ...d, body: 'lorem ipsum dolor sit amet '.repeat(10) } :
      d.docType === 'gtm' ? d : d,
    );
    const gate = runQualityGates(tampered, ctx, DEPTH_DOCUMENTS.build_ready);
    expect(gate.checks.find((c) => c.id === 'no_lorem')!.status).toBe('fail');

    const emptyGate = runQualityGates(docs.map((d) => (d.docType === 'roadmap' ? { ...d, body: 'x' } : d)), ctx, DEPTH_DOCUMENTS.build_ready);
    expect(emptyGate.checks.find((c) => c.id === 'no_empty_docs')!.status).toBe('fail');

    const langGate = runQualityGates(docs.map((d) => (d.docType === 'roadmap' ? { ...d, language: 'zz' } : d)), ctx, DEPTH_DOCUMENTS.build_ready);
    expect(langGate.checks.find((c) => c.id === 'output_language')!.status).toBe('fail');
  });

  it('warns (not fails) when there is no evidence, marking it unsupported', () => {
    const { ctx, docs } = buildAll({ claims: [], sourceRefs: [], evidence: [] });
    const gate = runQualityGates(docs, ctx, DEPTH_DOCUMENTS.build_ready);
    expect(gate.checks.find((c) => c.id === 'evidence_backed')!.status).toBe('warn');
  });
});
