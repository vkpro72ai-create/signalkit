import { describe, it, expect } from 'vitest';
import { computeVentureScaleScore, type ScoringInput } from '@signalkit/shared';
import { buildVentureThesis } from './venture';

const scoringInput: ScoringInput = {
  pain: 0.7, demand: 0.6, pricing: 0.5, competitor: 0.4, regulatory: 0.2, timing: 0.6,
  techShift: 0.7, audience: 0.5, distribution: 0.4, marketMatch: 0.8, freshness: 0.6,
  signalDensity: 0.5, evidenceStrength: 0.5, contradictionRatio: 0.1,
};

function build(overClaims: { text: string; type: string; confidenceLevel: string }[] = []) {
  const ventureScale = computeVentureScaleScore(scoringInput);
  return buildVentureThesis({
    niche: {
      title: 'Clinic WhatsApp Copilot', oneLiner: 'Convert WhatsApp inquiries into booked visits.',
      problem: 'Manual WhatsApp replies overwhelm clinic staff.', whyNow: 'Messaging-first patients and cheap AI.',
      targetAudience: 'Private clinics in Türkiye', useCases: ['Book visits via WhatsApp', 'Auto-reply to FAQs'],
      competitors: ['Generic chatbots'], monetization: 'Monthly subscription per clinic.',
    },
    market: { country: 'TR', marketLanguage: 'tr', scope: 'manual_country' },
    ventureScale,
    claims: overClaims,
    assumptions: [{ text: 'Clinics will pay monthly' }],
    unresolvedQuestions: [{ text: 'What is the real no-show rate?' }],
  });
}

describe('Venture Thesis builder', () => {
  it('contains an entry wedge, an expansion path, and kill reasons', () => {
    const t = build();
    expect(t.entryWedge.text.length).toBeGreaterThan(10);
    expect(t.expansionPath.text.length).toBeGreaterThan(10);
    expect(t.killReasons.length).toBeGreaterThan(0);
    expect(t.whatMustBeTrue.length).toBeGreaterThan(0);
    expect(t.firstValidationExperiments.length).toBeGreaterThan(0);
  });

  it('flags un-evidenced sections as assumptions, not facts', () => {
    const t = build(); // no claims → pain/ai/distribution are assumptions
    expect(t.painEconomics.assumption).toBe(true);
    expect(t.aiUnlock.assumption).toBe(true);
    expect(t.distributionWedge.assumption).toBe(true);
    expect(t.dataWorkflowMoat.assumption).toBe(true); // moat is always a hypothesis
  });

  it('marks pain as evidenced when a user_pain claim backs it', () => {
    const t = build([{ text: 'Staff want automation', type: 'user_pain', confidenceLevel: 'high' }]);
    expect(t.painEconomics.assumption).toBe(false);
  });

  it('never asserts a fabricated TAM in the narrative', () => {
    const t = build();
    expect(t.ventureScaleNarrative.text).not.toMatch(/\$\d+\s*(billion|trillion)/i);
    expect(t.ventureScaleNarrative.assumption).toBe(true);
  });
});
