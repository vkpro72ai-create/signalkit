/**
 * Content-quality checks for a generated Product Pack V2 pack, layered on
 * top of the structural gate in pack.service.ts's buildProductPackV2QualityGate().
 * Pure functions over the already-generated JSON — no DB, no LLM calls — so
 * every rule here is independently testable with a plain object fixture.
 *
 * These enforce the venture-grade bar from docs/BUILD_LOG.md Session … "Task
 * 2": a real, scored BCG evaluation, no shallow filler sections, no generic
 * CRUD/Item-screen output, no evidence overclaiming, no context bleed from
 * the tool itself, and no MVP-first framing.
 */

export const BCG_SECTION_KEY = 'bcg_opportunity_evaluation_star_upgrade';

export interface PackV2DocSectionLike {
  heading?: string;
  content?: string;
  examples?: string[];
  implementationNotes?: string[];
}

// ── BCG structured fields (see product-pack-v2.steps.ts's
// BCG_STEP_DOCUMENT_CONTRACT for the canonical shape) — the gate validates
// these directly instead of scanning rendered markdown, since the backend
// (not the model) builds the markdown deterministically from them.

export interface PackV2BcgScorecardItemLike {
  dimension?: string;
  currentScore?: number;
  rationale?: string;
  whatWouldRaiseIt?: string;
  evidenceNeeded?: string;
}

export interface PackV2BcgUpgradeTableItemLike {
  dimension?: string;
  currentScore?: number;
  weakness?: string;
  upgradeMove?: string;
  targetScoreAfterUpgrades?: number;
  whyScoreImproves?: string;
}

export interface PackV2BcgCoreLike {
  opportunityType?: string;
  currentPosition?: string;
  marketGrowthAssessment?: string;
  relativeCompetitivePosition?: string;
  classificationRationale?: string;
  starBlockers?: string[];
  starPotential?: string;
  minimumAmbition?: string;
  maximumAmbition?: string;
}

export interface PackV2BcgStarUpgradeStrategyLike {
  productUpgrades?: string[];
  positioningUpgrades?: string[];
  distributionUpgrades?: string[];
  monetizationUpgrades?: string[];
  defensibilityUpgrades?: string[];
  evidenceUpgrades?: string[];
}

export interface PackV2BcgUnicornPathLike {
  categoryExpansionNeeded?: string;
  platformOrEcosystemMove?: string;
  moatNeeded?: string;
  distributionAdvantageNeeded?: string;
  pricingOrLtvPath?: string;
  productSurfaceExpansion?: string;
  proofRequiredBeforeClaimingUpside?: string[];
  investorBeliefTriggers?: string[];
}

export interface PackV2BcgVerdictLike {
  currentBcgPosition?: string;
  targetBcgPositionAfterUpgrades?: string;
  topFiveMovesRequired?: string[];
  topFiveProofPointsRequired?: string[];
  topFiveRisks?: string[];
}

export interface PackV2DocLike {
  type: string;
  title: string;
  sections?: PackV2DocSectionLike[];
  bcg?: PackV2BcgCoreLike;
  scorecard?: PackV2BcgScorecardItemLike[];
  starUpgradeStrategy?: PackV2BcgStarUpgradeStrategyLike;
  unicornGradeUpsidePath?: PackV2BcgUnicornPathLike;
  beforeAfterUpgradeTable?: PackV2BcgUpgradeTableItemLike[];
  finalBcgVerdict?: PackV2BcgVerdictLike;
}

export interface PackV2DataModelEntityLike {
  entity?: string;
}

export interface ProductPackV2ContentCheckInput {
  documents: PackV2DocLike[];
  dataModel?: PackV2DataModelEntityLike[];
  evidenceCount: number;
}

export interface ContentGateCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  documentTypes: string[];
}

function mk(id: string, label: string, status: ContentGateCheck['status'], message: string, documentTypes: string[] = []): ContentGateCheck {
  return { id, label, status, message, documentTypes };
}

/** All text in a document worth scanning — headings, body, examples, implementation notes. */
function docText(doc: PackV2DocLike): string {
  const sections = doc.sections ?? [];
  return sections
    .map((s) => [s.heading ?? '', s.content ?? '', ...(s.examples ?? []), ...(s.implementationNotes ?? [])].join(' '))
    .join('\n');
}

function findByType(documents: PackV2DocLike[], type: string): PackV2DocLike | undefined {
  return documents.find((d) => d.type === type);
}

// Latin-1 Supplement accented-letter ranges (upper + lower), the character
// class real mojibake (misdecoded UTF-8 bytes) tends to cluster in.
const MOJIBAKE_RE = /[À-ÖØ-öø-ÿ]{3,}/;
const REPLACEMENT_CHAR_RE = /�/;

const GENERIC_ENTITIES = new Set(['user', 'users', 'workspace', 'workspaces', 'ai', 'item', 'items', 'account', 'accounts']);

const BCG_POSITIONS = new Set(['Star', 'Question Mark', 'Cash Cow', 'Dog']);

const UNFRAMED_SCALE_CLAIM_RE = /\b(\$?\d+\s*(billion|trillion|million)|TAM of|guaranteed unicorn|will become a unicorn|\$\d+[bBmM]\b)/i;
const CAREFUL_FRAMING_RE = /(could become|requires proof|not proven|not yet proven|depends on|assumption|hypothes|to validate|no fabricated|not a guarantee|not guaranteed)/i;

const EVIDENCE_OVERCLAIM_RE = /(evidence-backed|clinically proven|scientifically validated|generated from real market signals and evidence)/i;
// A bare "validated"/"proven" is only a real overclaim when it asserts the
// pack/claim itself is validated (e.g. "this is proven") — the same words
// appear legitimately in a BCG upgrade table ("Pricing validated" as a
// target outcome) or hedged ("not yet proven"), neither of which is a claim
// that today's evidence backs the pack.
const ASSERTION_PROVEN_RE = /\b(is|are|has been|have been|this is|it is)\s+(validated|proven)\b/i;

const STAR_UPGRADE_TRACKS = ['productUpgrades', 'positioningUpgrades', 'distributionUpgrades', 'monetizationUpgrades', 'defensibilityUpgrades'] as const;

// A generic upgrade-strategy item with no reasoning tied to it — short and
// matching one of these bare phrases almost exactly.
const GENERIC_UPGRADE_PHRASES = ['improve quality', 'do marketing', 'add integrations', 'improve the product', 'market it better'];
function isGenericUpgradeItem(item: string): boolean {
  const normalized = item.trim().toLowerCase().replace(/[.!]+$/, '');
  return normalized.length < 30 && GENERIC_UPGRADE_PHRASES.some((phrase) => normalized === phrase || normalized === phrase.replace(/^(improve|add|do) /, ''));
}

export function runProductPackV2ContentQualityChecks(input: ProductPackV2ContentCheckInput): ContentGateCheck[] {
  const { documents, evidenceCount } = input;
  const dataModel = input.dataModel ?? [];
  const checks: ContentGateCheck[] = [];

  const bcg = findByType(documents, BCG_SECTION_KEY);

  // 1) BCG evaluation must exist.
  checks.push(mk(
    'product_pack_missing_bcg',
    'BCG Opportunity Evaluation exists',
    bcg ? 'pass' : 'fail',
    bcg ? 'BCG Opportunity Evaluation & Star Upgrade Plan is present.' : 'Missing the BCG Opportunity Evaluation & Star Upgrade Plan document.',
    bcg ? [] : [BCG_SECTION_KEY],
  ));

  if (bcg) {
    // 2) BCG must be reasoned, not a bare quadrant label — validated on the
    // structured fields directly, not by scanning rendered markdown.
    const core = bcg.bcg;
    const shallow = !core
      || !BCG_POSITIONS.has(core.currentPosition ?? '')
      || (core.classificationRationale ?? '').trim().length < 40
      || !(core.marketGrowthAssessment ?? '').trim()
      || !(core.relativeCompetitivePosition ?? '').trim();
    checks.push(mk(
      'product_pack_shallow_bcg',
      'BCG evaluation is reasoned, not a bare label',
      shallow ? 'fail' : 'pass',
      shallow ? 'BCG section reads like a bare quadrant label — needs a valid position plus real classification/market-growth/competitive-position reasoning.' : 'BCG evaluation includes substantive, structured reasoning.',
      shallow ? [BCG_SECTION_KEY] : [],
    ));

    // 3) Numeric BCG scorecard.
    const scorecard = bcg.scorecard ?? [];
    const hasScorecard = scorecard.length >= 8 && scorecard.every((item) =>
      typeof item.dimension === 'string' && item.dimension.trim().length > 0
      && typeof item.currentScore === 'number'
      && (item.rationale ?? '').trim().length > 0
      && (item.whatWouldRaiseIt ?? '').trim().length > 0
      && (item.evidenceNeeded ?? '').trim().length > 0);
    checks.push(mk(
      'product_pack_missing_bcg_scorecard',
      'Numeric BCG scorecard exists',
      hasScorecard ? 'pass' : 'fail',
      hasScorecard ? `A scored entry per dimension is present (${scorecard.length} dimensions).` : `Missing or incomplete numeric BCG scorecard (found ${scorecard.length} dimension(s); every entry needs currentScore/rationale/whatWouldRaiseIt/evidenceNeeded).`,
      hasScorecard ? [] : [BCG_SECTION_KEY],
    ));

    // 4) Star Upgrade Strategy — all five required tracks non-empty.
    const strategy = bcg.starUpgradeStrategy;
    const missingTracks = strategy ? STAR_UPGRADE_TRACKS.filter((t) => !(strategy[t] ?? []).length) : [...STAR_UPGRADE_TRACKS];
    const hasStarUpgrade = Boolean(strategy) && missingTracks.length === 0;
    checks.push(mk(
      'product_pack_missing_star_upgrade',
      'Star Upgrade Strategy exists',
      hasStarUpgrade ? 'pass' : 'fail',
      hasStarUpgrade ? 'Star Upgrade Strategy covers all required upgrade tracks.' : `Missing Star Upgrade Strategy tracks: ${missingTracks.join(', ') || 'starUpgradeStrategy object itself'}.`,
      hasStarUpgrade ? [] : [BCG_SECTION_KEY],
    ));

    // 5) Unicorn-grade upside path, carefully framed — structured fields
    // plus a defensive scan of the free-text fields for unframed scale claims.
    const unicorn = bcg.unicornGradeUpsidePath;
    const unicornTextFields = unicorn ? [unicorn.categoryExpansionNeeded, unicorn.platformOrEcosystemMove, unicorn.moatNeeded, unicorn.distributionAdvantageNeeded, unicorn.pricingOrLtvPath, unicorn.productSurfaceExpansion].filter((v): v is string => Boolean(v)) : [];
    const hasUnicornFields = Boolean(unicorn)
      && unicornTextFields.length === 6
      && unicornTextFields.every((v) => v.trim().length > 0)
      && (unicorn?.proofRequiredBeforeClaimingUpside ?? []).length > 0;
    const hasUnframedClaim = unicornTextFields.some((v) => UNFRAMED_SCALE_CLAIM_RE.test(v) && !CAREFUL_FRAMING_RE.test(v));
    const okUnicorn = hasUnicornFields && !hasUnframedClaim;
    checks.push(mk(
      'product_pack_missing_unicorn_path',
      'Unicorn-grade upside path exists and is carefully framed',
      okUnicorn ? 'pass' : 'fail',
      !hasUnicornFields
        ? 'Missing or incomplete Unicorn-grade Upside Path (all fields plus proofRequiredBeforeClaimingUpside are required).'
        : hasUnframedClaim
          ? 'Unicorn-grade upside path makes an unframed scale claim — must use "could become"/"requires proof"/"not proven yet" language.'
          : 'Unicorn-grade upside path is present and carefully framed.',
      okUnicorn ? [] : [BCG_SECTION_KEY],
    ));

    // 6) Before/After upgrade table.
    const upgradeTable = bcg.beforeAfterUpgradeTable ?? [];
    const hasUpgradeTable = upgradeTable.length >= 6 && upgradeTable.every((item) =>
      typeof item.dimension === 'string' && item.dimension.trim().length > 0
      && typeof item.currentScore === 'number'
      && typeof item.targetScoreAfterUpgrades === 'number'
      && (item.upgradeMove ?? '').trim().length > 0
      && (item.whyScoreImproves ?? '').trim().length > 0);
    checks.push(mk(
      'product_pack_missing_upgrade_table',
      'Before/After upgrade table exists',
      hasUpgradeTable ? 'pass' : 'fail',
      hasUpgradeTable ? `Before/After upgrade table is present (${upgradeTable.length} dimensions).` : `Missing or incomplete Before/After Upgrade table (found ${upgradeTable.length} row(s); every row needs currentScore/upgradeMove/targetScoreAfterUpgrades/whyScoreImproves).`,
      hasUpgradeTable ? [] : [BCG_SECTION_KEY],
    ));

    // 7) Final BCG Verdict.
    const verdict = bcg.finalBcgVerdict;
    const hasVerdict = Boolean(verdict)
      && (verdict?.currentBcgPosition ?? '').trim().length > 0
      && (verdict?.targetBcgPositionAfterUpgrades ?? '').trim().length > 0
      && (verdict?.topFiveMovesRequired ?? []).length > 0
      && (verdict?.topFiveProofPointsRequired ?? []).length > 0
      && (verdict?.topFiveRisks ?? []).length > 0;
    checks.push(mk(
      'product_pack_missing_bcg_verdict',
      'Final BCG Verdict exists',
      hasVerdict ? 'pass' : 'fail',
      hasVerdict ? 'Final BCG Verdict is present with moves/proof points/risks.' : 'Missing or incomplete Final BCG Verdict (needs currentBcgPosition, targetBcgPositionAfterUpgrades, and all three top-5 lists).',
      hasVerdict ? [] : [BCG_SECTION_KEY],
    ));

    // 8) Generic, unexplained upgrade advice — scan every upgrade-strategy item.
    const allUpgradeItems = strategy ? STAR_UPGRADE_TRACKS.flatMap((t) => strategy[t] ?? []) : [];
    const genericItems = allUpgradeItems.filter(isGenericUpgradeItem);
    checks.push(mk(
      'product_pack_generic_upgrade_advice',
      'Upgrade advice is specific, not generic',
      genericItems.length === 0 ? 'pass' : 'fail',
      genericItems.length === 0 ? 'Upgrade advice is tied to specific reasoning.' : `Found generic, unexplained upgrade advice with no tie to a score: ${genericItems.join(', ')}`,
      genericItems.length === 0 ? [] : [BCG_SECTION_KEY],
    ));
  }

  // 7) No major section is too shallow (applies to every document).
  const SHALLOW_THRESHOLD = 150;
  const shallowDocs = documents.filter((d) => docText(d).trim().length < SHALLOW_THRESHOLD).map((d) => d.type);
  checks.push(mk(
    'product_pack_section_too_shallow',
    'No major section is too shallow',
    shallowDocs.length === 0 ? 'pass' : 'fail',
    shallowDocs.length === 0 ? 'All documents have substantive content.' : `Too shallow: ${shallowDocs.join(', ')}`,
    shallowDocs,
  ));

  // 8) No generic CRUD / Item screen.
  const entities = dataModel.map((e) => e.entity?.trim().toLowerCase()).filter((e): e is string => Boolean(e));
  const allEntitiesGeneric = entities.length > 0 && entities.every((e) => GENERIC_ENTITIES.has(e));
  const itemScreenDocs = documents.filter((d) => /item screen/i.test(docText(d)) || /item screen/i.test(d.title)).map((d) => d.type);
  const genericCrud = allEntitiesGeneric || itemScreenDocs.length > 0;
  checks.push(mk(
    'product_pack_generic_crud_output',
    'No generic CRUD / Item screen output',
    genericCrud ? 'fail' : 'pass',
    genericCrud
      ? (allEntitiesGeneric ? `Data model is only generic entities (${entities.join(', ')}) — design entities specific to this product.` : `Generic "Item screen" placeholder found in: ${itemScreenDocs.join(', ')}`)
      : 'Entities and screens are product-specific.',
    itemScreenDocs,
  ));

  // 9) Context contamination — the pack must never reference the tool itself.
  const contaminated = documents.filter((d) => /\b(signalkit|nofida)\b/i.test(docText(d)) || /\b(signalkit|nofida)\b/i.test(d.title)).map((d) => d.type);
  checks.push(mk(
    'product_pack_context_contamination',
    'No unrelated tool/project context bleed',
    contaminated.length === 0 ? 'pass' : 'fail',
    contaminated.length === 0 ? 'No context contamination found.' : `Found references to the generating tool itself, not the founder's idea, in: ${contaminated.join(', ')}`,
    contaminated,
  ));

  // 10) Evidence mismatch — no overclaiming when there is no evidence.
  let evidenceMismatchDocs: string[] = [];
  if (evidenceCount === 0) {
    evidenceMismatchDocs = documents.filter((d) => {
      const text = docText(d);
      return text.split('\n').some((line) => EVIDENCE_OVERCLAIM_RE.test(line) || ASSERTION_PROVEN_RE.test(line));
    }).map((d) => d.type);
  }
  checks.push(mk(
    'product_pack_evidence_mismatch',
    'No evidence overclaiming with zero evidence',
    evidenceMismatchDocs.length === 0 ? 'pass' : 'fail',
    evidenceMismatchDocs.length === 0
      ? 'No unsupported evidence claims found.'
      : `evidenceCount is 0 but these documents claim validation/proof: ${evidenceMismatchDocs.join(', ')}`,
    evidenceMismatchDocs,
  ));

  // 11) Encoding corruption / mojibake.
  const corruptedDocs = documents.filter((d) => {
    const text = docText(d);
    return MOJIBAKE_RE.test(text) || REPLACEMENT_CHAR_RE.test(text) || MOJIBAKE_RE.test(d.title) || REPLACEMENT_CHAR_RE.test(d.title);
  }).map((d) => d.type);
  checks.push(mk(
    'product_pack_encoding_corruption',
    'No corrupted/mojibake text',
    corruptedDocs.length === 0 ? 'pass' : 'fail',
    corruptedDocs.length === 0 ? 'No corrupted text found.' : `Corrupted/mojibake text found in: ${corruptedDocs.join(', ')}`,
    corruptedDocs,
  ));

  // 12) Role-specific packs present.
  const ROLE_PACKS = ['designer_pack', 'frontend_pack', 'backend_pack', 'ai_agent_pack', 'qa_acceptance_pack', 'growth_monetization_pack'];
  const missingRolePacks = ROLE_PACKS.filter((t) => !findByType(documents, t));
  checks.push(mk(
    'product_pack_missing_role_packs',
    'Role-specific packs are present',
    missingRolePacks.length === 0 ? 'pass' : 'fail',
    missingRolePacks.length === 0 ? 'All role-specific packs are present.' : `Missing role-specific packs: ${missingRolePacks.join(', ')}`,
    missingRolePacks,
  ));

  // 13) MVP-first framing.
  const vision = findByType(documents, 'founder_investor_vision');
  const mvp = findByType(documents, 'mvp_scope');
  const visionLen = vision ? docText(vision).length : 0;
  const mvpLen = mvp ? docText(mvp).length : 0;
  const narrowMvpPhrase = vision ? /start with a narrow mvp/i.test(docText(vision)) : false;
  const mvpDominates = Boolean(mvp) && (!vision || visionLen === 0 || mvpLen > visionLen * 1.5);
  const mvpFirst = narrowMvpPhrase || mvpDominates;
  checks.push(mk(
    'product_pack_mvp_first',
    'Idea is amplified before being phased into an MVP',
    mvpFirst ? 'fail' : 'pass',
    mvpFirst
      ? 'The pack reduces the idea to an MVP before establishing the full vision — MVP Scope must not dominate or precede Founder & Investor Vision.'
      : 'Full vision is established before MVP phasing.',
    mvpFirst ? ['mvp_scope'] : [],
  ));

  // 14) Duplicate sections (repeated document titles).
  const titleCounts = new Map<string, number>();
  for (const d of documents) {
    const key = d.title.trim().toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const duplicateTitles = [...titleCounts.entries()].filter(([, count]) => count > 1).map(([title]) => title);
  checks.push(mk(
    'product_pack_duplicate_sections',
    'No duplicate document sections',
    duplicateTitles.length === 0 ? 'pass' : 'fail',
    duplicateTitles.length === 0 ? 'No duplicate document titles.' : `Duplicate document titles: ${duplicateTitles.join(', ')}`,
    duplicateTitles.length === 0 ? [] : documents.filter((d) => duplicateTitles.includes(d.title.trim().toLowerCase())).map((d) => d.type),
  ));

  return checks;
}
