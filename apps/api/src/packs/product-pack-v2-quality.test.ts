import { describe, it, expect } from 'vitest';
import { runProductPackV2ContentQualityChecks, BCG_SECTION_KEY, type PackV2DocLike } from './product-pack-v2-quality';

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

const FULL_BCG_CONTENT = `
A. Current BCG Position
This idea is a Question Mark: market growth is strong, but competitive position and distribution advantage are not yet proven. Differentiation is moderate and defensibility is weak because there is no data or workflow moat yet. Timing is favorable given rising demand in the category.

B. BCG Scorecard
| Dimension | Score | Why | What raises it | Evidence needed |
|---|---|---|---|---|
| Market growth | 7 | Category demand rising | Confirm with search trend data | Third-party market data |
| Urgency of problem | 6 | Painful but not urgent | Sharper wedge | Customer interviews |
| Willingness to pay | 5 | Unproven | Pricing test | Willingness-to-pay survey |
| Competitive gap | 6 | Incumbents are generic | Differentiated workflow | Competitor teardown |
| Differentiation | 5 | Some but not defensible | Unique data loop | User research |
| Distribution | 4 | No channel proven | PLG loop | Channel experiment |
| Retention | 5 | Habit not yet formed | Daily trigger | Retention cohort data |
| Monetization | 5 | Pricing hypothesis only | Tiered pricing | Willingness-to-pay data |
| Defensibility | 3 | No moat yet | Data/workflow moat | Usage data over time |
| Evidence confidence | 4 | Mostly assumption | Interviews | Source-backed claims |
| Venture scale | 5 | Plausible not proven | Expansion path | Market sizing research |
| Execution feasibility | 7 | Buildable with current team | N/A | N/A |

C. Current State Diagnosis
The idea is not yet a Star because distribution and defensibility are unproven. Weak parts: retention loop, moat. Promising parts: market growth, execution feasibility. Dangerous assumptions: willingness to pay. Could collapse into a Dog if distribution never materializes; could break out if the retention loop compounds into a data moat.

D. Star Upgrade Strategy
Product upgrades: add a daily-use workflow and a data loop that compounds, raising retention and defensibility scores.
Positioning upgrades: sharpen the category wedge and name a clear enemy (status quo manual process), raising differentiation.
Distribution upgrades: build a product-led growth loop and a partnership channel, raising the distribution score.
Monetization upgrades: move to usage-based pricing with an enterprise tier, raising monetization strength.
Defensibility upgrades: accumulate a proprietary workflow/data moat over the first 12 months, raising defensibility.
Evidence upgrades: run 20 customer interviews and a pricing test before claiming venture scale.

E. Unicorn-grade Upside Path
This could become a category leader if the data moat compounds and distribution proves repeatable, but this requires proof — not proven yet. Expansion into adjacent workflows would be needed for a plausible venture-scale outcome, and this depends on evidence from the first cohort of users.

F. Before / After Upgrade Table
| Dimension | Current score | Weakness | Upgrade move | Target score after upgrades | Why score improves |
|---|---|---|---|---|---|
| Market growth | 7 | None major | Confirm with data | 8 | Third-party validation |
| Competitive position | 6 | Generic incumbents | Sharper wedge | 8 | Differentiation increases |
| Distribution | 4 | No channel proven | PLG loop | 7 | Channel derisked |
| Retention | 5 | No habit loop | Daily workflow | 8 | Habit loop formed |
| Monetization | 5 | Pricing unproven | Usage-based tiers | 7 | Pricing validated |
| Moat | 3 | No moat | Data/workflow moat | 7 | Compounding data |
| Evidence confidence | 4 | Mostly assumption | Interviews + test | 7 | Evidence collected |
| Venture scale | 5 | Plausible only | Expansion proof | 7 | Expansion validated |
| Execution feasibility | 7 | None major | N/A | 8 | Team proven |

G. Final BCG Verdict
Current BCG position: Question Mark. Target BCG position after upgrades: Star, with a unicorn-grade category-leader path as the maximum ambition. Minimum ambition: Star. Top 5 moves: build the daily workflow, prove the PLG channel, run pricing tests, start the data moat, run 20 customer interviews. Top 5 proof points: retention cohort data, channel CAC, pricing willingness data, moat usage data, expansion signal. Top 5 risks: distribution never proving out, retention not forming, pricing rejection, incumbents copying fast, data moat too slow to compound.
`;

function bcgDoc(overrides: Partial<PackV2DocLike> = {}): PackV2DocLike {
  return {
    type: BCG_SECTION_KEY,
    title: 'BCG Opportunity Evaluation & Star Upgrade Plan',
    sections: [{ heading: 'BCG Evaluation', content: FULL_BCG_CONTENT }],
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

  it('fails product_pack_shallow_bcg when the BCG section is only a quadrant label', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY ? bcgDoc({ sections: [{ heading: 'BCG', content: 'Current BCG Position: Question Mark.' }] }) : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_shallow_bcg').status).toBe('fail');
  });

  it('fails product_pack_missing_bcg_scorecard when there is no numeric table', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ sections: [{ heading: 'BCG', content: FULL_BCG_CONTENT.replace(/\|[^\n]*\n/g, '') }] })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_bcg_scorecard').status).toBe('fail');
  });

  it('fails product_pack_missing_star_upgrade when the Star Upgrade Strategy is absent', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ sections: [{ heading: 'BCG', content: FULL_BCG_CONTENT.replace(/D\. Star Upgrade Strategy[\s\S]*?(?=E\. Unicorn)/, '') }] })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_star_upgrade').status).toBe('fail');
  });

  it('fails product_pack_missing_unicorn_path when the upside path is absent', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ sections: [{ heading: 'BCG', content: FULL_BCG_CONTENT.replace(/E\. Unicorn-grade Upside Path[\s\S]*?(?=F\. Before)/, '').replace(/unicorn[a-z-]*/gi, 'category-leading') }] })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_unicorn_path').status).toBe('fail');
  });

  it('fails product_pack_missing_unicorn_path when an unframed scale claim is made', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ sections: [{ heading: 'BCG', content: `${FULL_BCG_CONTENT}\nThis will become a unicorn with a $10 billion TAM.` }] })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_unicorn_path').status).toBe('fail');
  });

  it('fails product_pack_missing_upgrade_table when only the scorecard table exists', () => {
    const singleTable = FULL_BCG_CONTENT.split('F. Before / After Upgrade Table')[0]!;
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY ? bcgDoc({ sections: [{ heading: 'BCG', content: singleTable }] }) : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_missing_upgrade_table').status).toBe('fail');
  });

  it('fails product_pack_generic_upgrade_advice on a bare, unexplained bullet', () => {
    const docs = baseDocs().map((d) => (d.type === BCG_SECTION_KEY
      ? bcgDoc({ sections: [{ heading: 'BCG', content: `${FULL_BCG_CONTENT}\n- improve quality\n` }] })
      : d));
    const checks = runProductPackV2ContentQualityChecks({ documents: docs, evidenceCount: 2 });
    expect(checkFor(checks, 'product_pack_generic_upgrade_advice').status).toBe('fail');
  });

  it('passes every BCG check for a genuinely deep, complete BCG document', () => {
    const checks = runProductPackV2ContentQualityChecks({ documents: baseDocs(), evidenceCount: 2 });
    for (const id of [
      'product_pack_missing_bcg',
      'product_pack_shallow_bcg',
      'product_pack_missing_bcg_scorecard',
      'product_pack_missing_star_upgrade',
      'product_pack_missing_unicorn_path',
      'product_pack_missing_upgrade_table',
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
