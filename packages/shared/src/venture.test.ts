import { describe, it, expect } from 'vitest';
import { computeNicheScore } from './scoring.js';
import { computeVentureScaleScore } from './venture.js';
import { computeBuildReadiness, REQUIRED_SCREEN_STATES } from './blueprint.js';
import type { ScoringInput } from './scoring.js';

function input(over: Partial<ScoringInput> = {}): ScoringInput {
  return {
    pain: 0.7, demand: 0.6, pricing: 0.5, competitor: 0.4, regulatory: 0.2, timing: 0.6,
    techShift: 0.7, audience: 0.5, distribution: 0.4, marketMatch: 0.8, freshness: 0.6,
    signalDensity: 0.5, evidenceStrength: 0.5, contradictionRatio: 0.1, ...over,
  };
}

describe('Venture Scale Score', () => {
  it('is SEPARATE from opportunity and confidence', () => {
    const i = input();
    const opp = computeNicheScore(i);
    const vs = computeVentureScaleScore(i);
    // Independent computations: venture-scale total differs from opportunity total
    // and carries its own confidence (not the opportunity confidence value).
    expect(vs.totalScore).toBeTypeOf('number');
    expect(vs.confidence.value).toBeTypeOf('number');
    expect(vs).not.toHaveProperty('riskPenalties');
    expect(vs.totalScore).not.toBe(opp.totalScore); // distinct scores
    expect(vs.breakdown.some((b) => b.dimension === 'market_size_path')).toBe(true);
  });

  it('never fabricates TAM — market size is always an assumption with a question', () => {
    const strong = computeVentureScaleScore(input({ demand: 1, pricing: 1, evidenceStrength: 1, signalDensity: 1 }));
    const market = strong.breakdown.find((b) => b.dimension === 'market_size_path')!;
    expect(market.assumptionBased).toBe(true);
    expect(market.unresolvedQuestion).toBeTruthy();
    expect(market.unresolvedQuestion!.toLowerCase()).toContain('no fabricated tam');
  });

  it('does not assert unsupported unicorn claims in the explanation', () => {
    const vs = computeVentureScaleScore(input());
    expect(vs.explanation).toMatch(/potential, not a guarantee/i);
    expect(vs.explanation).not.toMatch(/\$\d+\s*(billion|trillion)/i);
  });

  it('weak signals surface as "what must be true"', () => {
    const weak = computeVentureScaleScore(input({ pain: 0, demand: 0, pricing: 0, distribution: 0, techShift: 0, timing: 0 }));
    expect(weak.whatMustBeTrue.length).toBeGreaterThan(0);
    // every dimension carries an assumption flag (evidence/assumption breakdown)
    expect(weak.breakdown.every((b) => typeof b.assumptionBased === 'boolean')).toBe(true);
  });

  it('confidence stays separate and lower when everything is assumption-based', () => {
    const weak = computeVentureScaleScore(input({ pain: 0, demand: 0, pricing: 0, distribution: 0, techShift: 0, timing: 0, evidenceStrength: 0, signalDensity: 0 }));
    expect(weak.confidence.value).toBeLessThan(0.5);
  });
});

describe('Build Readiness', () => {
  const goodScreen = {
    name: 'Home', purpose: '', userIntent: '', entryPoints: [], exitPoints: [], primaryAction: 'GET /items',
    secondaryActions: [], dataShown: [], dataRequired: [], permissionRules: [], validationRules: [],
    backendDependencies: [], aiDependencies: [], edgeCases: [], analyticsEvents: [], microcopy: [], components: [],
    stateTransitions: [], acceptanceCriteria: ['Given X When Y Then Z'],
    states: REQUIRED_SCREEN_STATES.map((kind) => ({ kind, behavior: 'b' })),
  };

  it('is high when every screen covers required states, APIs map, and DO_NOT_BUILD exists', () => {
    const r = computeBuildReadiness(
      {
        screenContracts: [goodScreen],
        stateMatrix: [{ screen: 'Home', states: [...REQUIRED_SCREEN_STATES] }],
        apiToScreenMap: [{ screen: 'Home', endpoints: [{ method: 'GET', path: '/items', dataNeeded: 'x' }], actions: [], errorStates: [] }],
        componentContracts: [], permissionMatrix: [{ role: 'owner', allowedActions: ['x'], blockedActions: [], uiWhenBlocked: '' }],
        analyticsEvents: [], doNotBuild: [{ item: 'app gen', reason: 'product law' }], validationRules: [],
      },
      { endpointCount: 1, evidenceBacked: true },
    );
    expect(r.totalScore).toBeGreaterThan(80);
    expect(r.warnings).toHaveLength(0);
  });

  it('warns and drops when screens miss empty/loading/error states', () => {
    const r = computeBuildReadiness(
      {
        screenContracts: [{ ...goodScreen, states: [{ kind: 'success', behavior: 'b' }] }],
        stateMatrix: [], apiToScreenMap: [], componentContracts: [], permissionMatrix: [],
        analyticsEvents: [], doNotBuild: [], validationRules: [],
      },
      { endpointCount: 0, evidenceBacked: false },
    );
    expect(r.warnings.some((w) => /empty\/loading\/error/i.test(w))).toBe(true);
    expect(r.breakdown.find((d) => d.dimension === 'screen_state_coverage')!.score).toBe(0);
  });
});
