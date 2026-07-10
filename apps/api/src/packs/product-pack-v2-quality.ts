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

export interface PackV2DocLike {
  type: string;
  title: string;
  sections?: PackV2DocSectionLike[];
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

const TABLE_ROW_RE = /\|[^\n]*\|/;
const TABLE_SEPARATOR_RE = /\|?[\s:|-]*-[\s:|-]*\|?/;

/** Counts distinct markdown pipe-tables (one per separator row `|---|---|`-ish line). */
function countMarkdownTables(text: string): number {
  const lines = text.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (TABLE_ROW_RE.test(line) && TABLE_SEPARATOR_RE.test(line) && line.includes('-')) {
      // A separator row sits directly under a header row — confirm there is
      // a plausible header line above it to avoid matching a stray "---" hr.
      const prev = lines[i - 1]?.trim() ?? '';
      if (prev.includes('|')) count += 1;
    }
  }
  return count;
}

// Latin-1 Supplement accented-letter ranges (upper + lower), the character
// class real mojibake (misdecoded UTF-8 bytes) tends to cluster in.
const MOJIBAKE_RE = /[À-ÖØ-öø-ÿ]{3,}/;
const REPLACEMENT_CHAR_RE = /�/;

const GENERIC_ENTITIES = new Set(['user', 'users', 'workspace', 'workspaces', 'ai', 'item', 'items', 'account', 'accounts']);

const UNFRAMED_SCALE_CLAIM_RE = /\b(\$?\d+\s*(billion|trillion|million)|TAM of|guaranteed unicorn|will become a unicorn|\$\d+[bBmM]\b)/i;
const CAREFUL_FRAMING_RE = /(could become|requires proof|not proven|not yet proven|depends on|assumption|hypothes|to validate|no fabricated|not a guarantee|not guaranteed)/i;

const EVIDENCE_OVERCLAIM_RE = /(evidence-backed|clinically proven|scientifically validated|generated from real market signals and evidence)/i;
// A bare "validated"/"proven" is only a real overclaim when it asserts the
// pack/claim itself is validated (e.g. "this is proven") — the same words
// appear legitimately in a BCG upgrade table ("Pricing validated" as a
// target outcome) or hedged ("not yet proven"), neither of which is a claim
// that today's evidence backs the pack.
const ASSERTION_PROVEN_RE = /\b(is|are|has been|have been|this is|it is)\s+(validated|proven)\b/i;

const UPGRADE_CATEGORIES = ['product', 'positioning', 'distribution', 'monetization', 'defensib'];

const GENERIC_BULLET_RE = /^[-*]\s*(improve quality|do marketing|add integrations)\.?\s*$/im;

export function runProductPackV2ContentQualityChecks(input: ProductPackV2ContentCheckInput): ContentGateCheck[] {
  const { documents, evidenceCount } = input;
  const dataModel = input.dataModel ?? [];
  const checks: ContentGateCheck[] = [];

  const bcg = findByType(documents, BCG_SECTION_KEY);
  const bcgText = bcg ? docText(bcg) : '';

  // 1) BCG evaluation must exist.
  checks.push(mk(
    'product_pack_missing_bcg',
    'BCG Opportunity Evaluation exists',
    bcg ? 'pass' : 'fail',
    bcg ? 'BCG Opportunity Evaluation & Star Upgrade Plan is present.' : 'Missing the BCG Opportunity Evaluation & Star Upgrade Plan document.',
    bcg ? [] : [BCG_SECTION_KEY],
  ));

  if (bcg) {
    // 2) BCG must be reasoned, not a bare quadrant label.
    const reasoningKeywords = ['market growth', 'competitive', 'differentiat', 'distribution', 'defensib', 'timing', 'moat', 'retention', 'switching'];
    const reasoningHits = reasoningKeywords.filter((k) => bcgText.toLowerCase().includes(k)).length;
    const shallow = bcgText.trim().length < 600 || reasoningHits < 3;
    checks.push(mk(
      'product_pack_shallow_bcg',
      'BCG evaluation is reasoned, not a bare label',
      shallow ? 'fail' : 'pass',
      shallow ? 'BCG section reads like a bare quadrant label — needs full reasoning across market growth, competitive position, differentiation, distribution, and defensibility.' : 'BCG evaluation includes substantive reasoning.',
      shallow ? [BCG_SECTION_KEY] : [],
    ));

    // 3) Numeric BCG scorecard.
    const dims = ['market growth', 'urgency', 'willingness to pay', 'competitive gap', 'differentiation', 'distribution', 'retention', 'switching', 'monetization', 'defensibility', 'moat', 'evidence confidence', 'venture scale', 'execution feasibility'];
    const dimHits = dims.filter((d) => bcgText.toLowerCase().includes(d)).length;
    const hasScorecard = countMarkdownTables(bcgText) >= 1 && dimHits >= 6;
    checks.push(mk(
      'product_pack_missing_bcg_scorecard',
      'Numeric BCG scorecard exists',
      hasScorecard ? 'pass' : 'fail',
      hasScorecard ? 'A scored table covering the required BCG dimensions is present.' : 'No numeric BCG scorecard table (0-10 per dimension) found.',
      hasScorecard ? [] : [BCG_SECTION_KEY],
    ));

    // 4) Star Upgrade Strategy.
    const hasStarUpgrade = /star upgrade/i.test(bcgText) && UPGRADE_CATEGORIES.filter((c) => bcgText.toLowerCase().includes(c)).length >= 3;
    checks.push(mk(
      'product_pack_missing_star_upgrade',
      'Star Upgrade Strategy exists',
      hasStarUpgrade ? 'pass' : 'fail',
      hasStarUpgrade ? 'Star Upgrade Strategy covers multiple upgrade tracks.' : 'Missing a Star Upgrade Strategy with product/positioning/distribution/monetization/defensibility tracks.',
      hasStarUpgrade ? [] : [BCG_SECTION_KEY],
    ));

    // 5) Unicorn-grade upside path, carefully framed.
    const mentionsUnicorn = /unicorn/i.test(bcgText);
    const carefullyFramed = CAREFUL_FRAMING_RE.test(bcgText);
    const hasUnframedClaim = bcgText.split('\n').some((line) => UNFRAMED_SCALE_CLAIM_RE.test(line) && !CAREFUL_FRAMING_RE.test(line));
    const okUnicorn = mentionsUnicorn && carefullyFramed && !hasUnframedClaim;
    checks.push(mk(
      'product_pack_missing_unicorn_path',
      'Unicorn-grade upside path exists and is carefully framed',
      okUnicorn ? 'pass' : 'fail',
      !mentionsUnicorn
        ? 'Missing a Unicorn-grade Upside Path.'
        : hasUnframedClaim
          ? 'Unicorn-grade upside path makes an unframed scale claim — must use "could become"/"requires proof"/"not proven yet" language.'
          : !carefullyFramed
            ? 'Unicorn-grade upside path is not carefully hedged (missing "could become"/"requires proof"/"not proven yet"-style language).'
            : 'Unicorn-grade upside path is present and carefully framed.',
      okUnicorn ? [] : [BCG_SECTION_KEY],
    ));

    // 6) Before/After upgrade table (a second distinct table from the scorecard).
    const tableCount = countMarkdownTables(bcgText);
    const mentionsBeforeAfter = /(before\s*\/\s*after|target score|current score)/i.test(bcgText);
    const hasUpgradeTable = tableCount >= 2 && mentionsBeforeAfter;
    checks.push(mk(
      'product_pack_missing_upgrade_table',
      'Before/After upgrade table exists',
      hasUpgradeTable ? 'pass' : 'fail',
      hasUpgradeTable ? 'Before/After upgrade table is present alongside the scorecard.' : 'Missing the Before/After Upgrade table (Dimension | Current score | Weakness | Upgrade move | Target score | Why score improves).',
      hasUpgradeTable ? [] : [BCG_SECTION_KEY],
    ));

    // 15) Generic, unexplained upgrade advice.
    const genericBullet = GENERIC_BULLET_RE.test(bcgText);
    checks.push(mk(
      'product_pack_generic_upgrade_advice',
      'Upgrade advice is specific, not generic',
      genericBullet ? 'fail' : 'pass',
      genericBullet ? 'Found generic, unexplained upgrade advice (e.g. "improve quality" with no tie to a score). Every move must name the dimension it raises and why.' : 'Upgrade advice is tied to specific reasoning.',
      genericBullet ? [BCG_SECTION_KEY] : [],
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
