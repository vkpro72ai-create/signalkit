import { describe, it, expect } from 'vitest';
import {
  runProductPackV2ContentQualityChecks,
  BCG_SECTION_KEY,
  type PackV2DocLike,
  type PackV2BcgCoreLike,
  type PackV2BcgScorecardItemLike,
  type PackV2BcgStarUpgradeStrategyLike,
  type PackV2BcgUnicornPathLike,
  type PackV2BcgUpgradeTableItemLike,
  type PackV2BcgVerdictLike,
} from './product-pack-v2-quality';

function checkFor(checks: ReturnType<typeof runProductPackV2ContentQualityChecks>, id: string) {
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`No check with id ${id}`);
  return found;
}

/** A single generic, minimal document for a given type — used as filler around the thing under test. */
function fillerDoc(type: string, title = type): PackV2DocLike {
  return {
    type,
    title,
    sections: [{
      heading: 'Overview',
      content: `This document explains ${title} in detail, covering what it is, why it exists, who uses it, and how it connects to the rest of the product so a cold reader can act on it without prior context.`,
      examples: ['A concrete example specific to this product.'],
      implementationNotes: ['An implementation note specific to this product.'],
    }],
  };
}

// Structured BCG fields (see product-pack-v2.steps.ts's BCG_STEP_DOCUMENT_CONTRACT
// for the canonical shape). The gate validates these directly — the backend
// renders the actual markdown tables from them deterministically, so these
// fixtures never contain markdown-in-JSON.

const BCG_SCORECARD_DIMS = [
  'Market growth', 'Urgency of problem', 'Buyer/user willingness to pay', 'Competitive gap',
  'Differentiation', 'Distribution access', 'Retention / switching cost', 'Monetization strength',
  'Defensibility / moat', 'Evidence confidence', 'Venture scale potential', 'Execution feasibility',
];

const BCG_UPGRADE_TABLE_DIMS = [
  'Market growth', 'Competitive position', 'Distribution', 'Retention', 'Monetization',
  'Moat', 'Evidence confidence', 'Venture scale', 'Execution feasibility',
];

function fullScorecard(): PackV2BcgScorecardItemLike[] {
  return BCG_SCORECARD_DIMS.map((dimension, i) => ({
    dimension,
    currentScore: 4 + (i % 4),
    rationale: `${dimension} rationale specific to this idea, not generic filler.`,
    whatWouldRaiseIt: `What would raise ${dimension.toLowerCase()} for this idea.`,
    evidenceNeeded: `Evidence needed to prove ${dimension.toLowerCase()}.`,
  }));
}

function fullUpgradeTable(): PackV2BcgUpgradeTableItemLike[] {
  return BCG_UPGRADE_TABLE_DIMS.map((dimension, i) => ({
    dimension,
    currentScore: 4 + (i % 4),
    weakness: `${dimension} weakness specific to this idea.`,
    upgradeMove: `Upgrade move to raise ${dimension.toLowerCase()}.`,
    targetScoreAfterUpgrades: 7 + (i % 2),
    whyScoreImproves: `Why ${dimension.toLowerCase()} improves after the upgrade move.`,
  }));
}

const FULL_BCG_CORE: PackV2BcgCoreLike = {
  opportunityType: 'B2B',
  currentPosition: 'Question Mark',
  marketGrowthAssessment: 'Category demand is rising quickly among target buyers.',
  relativeCompetitivePosition: 'Incumbents are generic; this idea has a differentiated workflow wedge.',
  classificationRationale: 'Market growth is strong but competitive position, distribution advantage, and defensibility are not yet proven, which places this squarely in the Question Mark quadrant rather than Star.',
  starBlockers: ['No proven distribution channel', 'No defensibility moat yet'],
  starPotential: 'Could become a Star if the retention loop compounds into a data moat.',
  minimumAmbition: 'Star',
  maximumAmbition: 'Category leader',
};

const FULL_STAR_UPGRADE_STRATEGY: PackV2BcgStarUpgradeStrategyLike = {
  productUpgrades: ['Add a daily-use workflow and a compounding data loop, raising retention and defensibility.'],
  positioningUpgrades: ['Sharpen the category wedge and name the status-quo enemy, raising differentiation.'],
  distributionUpgrades: ['Build a product-led growth loop and a partnership channel, raising distribution.'],
  monetizationUpgrades: ['Move to usage-based pricing with an enterprise tier, raising monetization strength.'],
  defensibilityUpgrades: ['Accumulate a proprietary workflow/data moat over the first year, raising defensibility.'],
  evidenceUpgrades: ['Run 20 customer interviews and a pricing test before claiming venture scale.'],
};

const FULL_UNICORN_PATH: PackV2BcgUnicornPathLike = {
  categoryExpansionNeeded: 'Could expand into adjacent workflows if the core loop proves out, though this requires proof.',
  platformOrEcosystemMove: 'Could become a platform for partner integrations, not proven yet.',
  moatNeeded: 'A compounding data/workflow moat, which depends on evidence from the first user cohort.',
  distributionAdvantageNeeded: 'A repeatable PLG channel, still to validate.',
  pricingOrLtvPath: 'Usage-based pricing with expansion revenue, a hypothesis not yet tested.',
  productSurfaceExpansion: 'Could expand from a single workflow to a full suite, requires proof of the first wedge.',
  proofRequiredBeforeClaimingUpside: ['Retention cohort data', 'Channel CAC data'],
  investorBeliefTriggers: ['Compounding retention curve', 'Repeatable channel CAC'],
};

const FULL_BCG_VERDICT: PackV2BcgVerdictLike = {
  currentBcgPosition: 'Question Mark',
  targetBcgPositionAfterUpgrades: 'Star',
  topFiveMovesRequired: ['Build the daily workflow', 'Prove the PLG channel', 'Run pricing tests', 'Start the data moat', 'Run 20 customer interviews'],
  topFiveProofPointsRequired: ['Retention cohort data', 'Channel CAC', 'Pricing willingness data', 'Moat usage data', 'Expansion signal'],
  topFiveRisks: ['Distribution never proving out', 'Retention not forming', 'Pricing rejection', 'Incumbents copying fast', 'Data moat too slow to compound'],
};

// The gate's own generic "no section is too shallow" check (SHALLOW_THRESHOLD,
// applied to every document including BCG) scans `sections[]` text — this is
// what the backend's renderBcgDocumentToSections() would have produced from
// the structured fields above, kept short here since only its length matters.
const FULL_BCG_RENDERED_TEXT =
  'Structured BCG evaluation covering current position, scorecard, star upgrade strategy, unicorn-grade upside path, before/after upgrade table, and final verdict for this idea — long enough to clear the shallow-content threshold on its own.';

function bcgDoc(overrides: Partial<PackV2DocLike> = {}): PackV2DocLike {
  return {
    type: BCG_SECTION_KEY,
    title: 'BCG Opportunity Evaluation & Star Upgrade Plan',
    sections: [{ heading: 'A. Current BCG Position', content: FULL_BCG_RENDERED_TEXT }],
    bcg: FULL_BCG_CORE,
    scorecard: fullScorecard(),
    starUpgradeStrategy: FULL_STAR_UPGRADE_STRATEGY,
    unicornGradeUpsidePath: FULL_UNICORN_PATH,
    beforeAfterUpgradeTable: fullUpgradeTable(),
    finalBcgVerdict: FULL_BCG_VERDICT,
    ...overrides,
  };
}

function baseDocs(extra: PackV2DocLike[] = []): PackV2DocLike[] {
  return [
    fillerDoc('founder_investor_vision', 'Founder & Investor Vision'),
    bcgDoc(),
    fillerDoc('mvp_scope', 'MVP Scope'),
    fillerDoc('designer_pack', 'Designer Pack'),
    fillerDoc('frontend_pack', 'Frontend Developer Pack'),
    fillerDoc('backend_pack', 'Backend Developer Pack'),
    fillerDoc('ai_agent_pack', 'AI Agent Pack'),
    fillerDoc('qa_acceptance_pack', 'QA & Acceptance Pack'),
    fillerDoc('growth_monetization_pack', 'Growth & Monetization Pack'),
    ...extra,
  ];
}

describe('runProductPackV2ContentQualityChecks — BCG', () => {
  it('fails product_pack_missing_bcg when the BCG document is absent', () => {
    const docs = baseDocs().filter((d) => d.type !== BCG_SECTION_KEY);
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_bcg').status).toBe('fail');
  });

  it('fails product_pack_shallow_bcg when the BCG position is only a bare label with no rationale', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ bcg: { currentPosition: 'Question Mark', opportunityType: 'B2B', marketGrowthAssessment: '', relativeCompetitivePosition: '', classificationRationale: 'Question Mark.' } })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_shallow_bcg').status).toBe('fail');
  });

  it('fails product_pack_shallow_bcg when currentPosition is not one of the four valid quadrants', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ bcg: { ...FULL_BCG_CORE, currentPosition: 'Rising Star' } })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_shallow_bcg').status).toBe('fail');
  });

  it('fails product_pack_missing_bcg_scorecard when the scorecard is empty', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY ? bcgDoc({ scorecard: [] }) : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_bcg_scorecard').status).toBe('fail');
  });

  it('fails product_pack_missing_bcg_scorecard when a scorecard entry is missing required subfields', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ scorecard: [{ dimension: 'Market growth', currentScore: 7, rationale: '', whatWouldRaiseIt: '', evidenceNeeded: '' }, ...fullScorecard().slice(1)] })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_bcg_scorecard').status).toBe('fail');
  });

  it('fails product_pack_missing_star_upgrade when the Star Upgrade Strategy is absent', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY ? bcgDoc({ starUpgradeStrategy: undefined }) : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_star_upgrade').status).toBe('fail');
  });

  it('fails product_pack_missing_star_upgrade when one upgrade track is empty', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ starUpgradeStrategy: { ...FULL_STAR_UPGRADE_STRATEGY, defensibilityUpgrades: [] } })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    const check = checkFor(checks, 'product_pack_missing_star_upgrade');
    expect(check.status).toBe('fail');
    expect(check.message).toContain('defensibilityUpgrades');
  });

  it('fails product_pack_missing_unicorn_path when the upside path is absent', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY ? bcgDoc({ unicornGradeUpsidePath: undefined }) : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_unicorn_path').status).toBe('fail');
  });

  it('fails product_pack_missing_unicorn_path when an unframed scale claim is made', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ unicornGradeUpsidePath: { ...FULL_UNICORN_PATH, categoryExpansionNeeded: 'This will become a unicorn with a $10 billion TAM.' } })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_unicorn_path').status).toBe('fail');
  });

  it('fails product_pack_missing_upgrade_table when the before/after table is empty', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY ? bcgDoc({ beforeAfterUpgradeTable: [] }) : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_upgrade_table').status).toBe('fail');
  });

  it('fails product_pack_missing_upgrade_table when a row is missing an upgrade move', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ beforeAfterUpgradeTable: [{ dimension: 'Market growth', currentScore: 7, weakness: 'w', upgradeMove: '', targetScoreAfterUpgrades: 8, whyScoreImproves: '' }, ...fullUpgradeTable().slice(1)] })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_upgrade_table').status).toBe('fail');
  });

  it('fails product_pack_missing_bcg_verdict when the Final BCG Verdict is absent', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY ? bcgDoc({ finalBcgVerdict: undefined }) : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_bcg_verdict').status).toBe('fail');
  });

  it('fails product_pack_missing_bcg_verdict when a required top-5 list is missing', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ finalBcgVerdict: { ...FULL_BCG_VERDICT, topFiveRisks: [] } })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_bcg_verdict').status).toBe('fail');
  });

  it('fails product_pack_generic_upgrade_advice on a bare, unexplained upgrade item', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ starUpgradeStrategy: { ...FULL_STAR_UPGRADE_STRATEGY, productUpgrades: ['improve quality'] } })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_generic_upgrade_advice').status).toBe('fail');
  });

  it('passes every BCG check for a genuinely deep, complete, structured BCG document', () => {
    const checks = runProductPackV2ContentQualityChecks({ documents: baseDocs(), evidenceCount: 2 });
    for (const id of [
      'product_pack_missing_bcg',
      'product_pack_shallow_bcg',
      'product_pack_missing_bcg_scorecard',
      'product_pack_missing_star_upgrade',
      'product_pack_missing_unicorn_path',
      'product_pack_missing_upgrade_table',
      'product_pack_missing_bcg_verdict',
      'product_pack_generic_upgrade_advice',
    ]) {
      expect(checkFor(checks, id).status, id).toBe('pass');
    }
  });
});

describe('runProductPackV2ContentQualityChecks — general content quality', () => {
  it('fails product_pack_section_too_shallow when a major document has only 1-2 generic lines', () => {
    const docs = baseDocs([]).map((d) => (d.type === 'frontend_pack' ? { ...d, sections: [{ heading: 'x', content: 'Short.' }] } : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    const check = checkFor(checks, 'product_pack_section_too_shallow');
    expect(check.status).toBe('fail');
    expect(check.documentTypes).toContain('frontend_pack');
  });

  it('fails product_pack_generic_crud_output when the data model is only generic entities', () => {
    const checks = runProductPackV2ContentQualityChecks({
      documents: baseDocs(),
      dataModel: [{ entity: 'User' }, { entity: 'Workspace' }, { entity: 'Ai' }],
      evidenceCount: 2,
    });
    expect(checkFor(checks, 'product_pack_generic_crud_output').status).toBe('fail');
  });

  it('fails product_pack_generic_crud_output when a generic "Item screen" placeholder appears', () => {
    const docs = baseDocs([fillerDoc('screen_map', 'Item screen')]);
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_generic_crud_output').status).toBe('fail');
  });

  it('passes product_pack_generic_crud_output for product-specific entities', () => {
    const checks = runProductPackV2ContentQualityChecks({
      documents: baseDocs(),
      dataModel: [{ entity: 'FertilityCycleLog' }, { entity: 'CoachingPlan' }],
      evidenceCount: 2,
    });
    expect(checkFor(checks, 'product_pack_generic_crud_output').status).toBe('pass');
  });

  it('fails product_pack_context_contamination when the pack mentions the generating tool', () => {
    const docs = baseDocs([fillerDoc('market_context', 'Market Context — built like SignalKit')]);
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_context_contamination').status).toBe('fail');
  });

  it('fails product_pack_evidence_mismatch when evidenceCount is 0 and a document claims validation', () => {
    const docs = baseDocs([fillerDoc('risks_assumptions_evidence', 'Risks, Assumptions & Evidence')]).map((d) =>
      d.type === 'risks_assumptions_evidence'
        ? { ...d, sections: [{ heading: 'x', content: 'This pack was generated from real market signals and evidence.' }] }
        : d,
    );
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 0 });
    expect(checkFor(checks, 'product_pack_evidence_mismatch').status).toBe('fail');
  });

  it('passes product_pack_evidence_mismatch when evidenceCount is 0 but claims are properly hedged', () => {
    const docs = baseDocs([]).map((d) =>
      d.type === 'founder_investor_vision'
        ? { ...d, sections: [{ heading: 'x', content: 'This is a strategic starter pack; claims are assumption-based and require evidence collection, not yet validated.' }] }
        : d,
    );
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 0 });
    expect(checkFor(checks, 'product_pack_evidence_mismatch').status).toBe('pass');
  });

  it('fails product_pack_encoding_corruption on mojibake text', () => {
    // A run of consecutive Latin-1 Supplement accented letters — the
    // character class real mojibake (misdecoded UTF-8) clusters into.
    const docs = baseDocs([]).map((d) => (d.type === 'founder_investor_vision' ? { ...d, sections: [{ heading: 'x', content: 'ÀÁÂÃÄÅ normal text here as well to pad length beyond the shallow threshold for this check to matter at all in practice today.' }] } : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_encoding_corruption').status).toBe('fail');
  });

  it('fails product_pack_missing_role_packs when a role pack is missing', () => {
    const docs = baseDocs().filter((d) => d.type !== 'ai_agent_pack');
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    const check = checkFor(checks, 'product_pack_missing_role_packs');
    expect(check.status).toBe('fail');
    expect(check.documentTypes).toContain('ai_agent_pack');
  });

  it('fails product_pack_mvp_first when MVP Scope dominates and dwarfs the vision', () => {
    const longMvp = 'x'.repeat(2000);
    const shortVision = 'Short vision.';
    const docs = baseDocs().map((d) => {
      if (d.type === 'founder_investor_vision') return { ...d, sections: [{ heading: 'x', content: shortVision }] };
      if (d.type === 'mvp_scope') return { ...d, sections: [{ heading: 'x', content: longMvp }] };
      return d;
    });
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_mvp_first').status).toBe('fail');
  });

  it('fails product_pack_mvp_first when the vision text says to start with a narrow MVP', () => {
    const docs = baseDocs().map((d) => (d.type === 'founder_investor_vision'
      ? { ...d, sections: [{ heading: 'x', content: 'The answer here is to start with a narrow MVP and expand later once traction is proven with real users.' }] }
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_mvp_first').status).toBe('fail');
  });

  it('fails product_pack_duplicate_sections when two documents share a title', () => {
    const docs = baseDocs([fillerDoc('roadmap', 'MVP Scope')]);
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_duplicate_sections').status).toBe('fail');
  });

  it('passes a genuinely deep, complete, product-specific pack across every check', () => {
    const checks = runProductPackV2ContentQualityChecks({
      documents: baseDocs(),
      dataModel: [{ entity: 'FertilityCycleLog' }, { entity: 'CoachingPlan' }],
      evidenceCount: 2,
    });
    const failed = checks.filter((c) => c.status === 'fail');
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });
});
