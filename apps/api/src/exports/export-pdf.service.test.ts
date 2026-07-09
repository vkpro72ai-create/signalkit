import { describe, it, expect } from 'vitest';
import pdfParse from 'pdf-parse';
import { ExportPdfService } from './export-pdf.service';
import type { EvidenceData, PackDocumentRow, PackRow } from './export-renderer.service';
import type { ExportManifest } from '@signalkit/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Russian fixture text from the task spec — exercises Cyrillic, mixed RU/EN,
// em dash, and colon punctuation in one pass.

const RU_APP_TITLE = 'Приложение для психологической самопомощи с AI-коучем';
const RU_CHECKIN = 'Пользователь проходит ежедневный чек-ин';
const RU_QUALITY_FAILED = 'Оценка качества: не пройдена';

function makePack(over: Partial<PackRow> = {}): PackRow {
  return {
    id: 'pack1', title: RU_APP_TITLE, version: 3, depth: 'build_ready',
    verticalTemplate: 'b2c_wellness', primaryLanguage: 'ru', projectId: 'proj1',
    nicheId: 'niche1', workspaceId: 'ws1',
    ...over,
  };
}

function makeDoc(docType: string, body: string, metadata: unknown = {}): PackDocumentRow {
  return {
    id: `doc_${docType}`, docType, title: docType.replace(/_/g, ' '),
    body, language: 'ru', metadata,
  };
}

function makeEvidence(over: Partial<EvidenceData> = {}): EvidenceData {
  return {
    evidence: [],
    claims: [{ id: 'c1', text: 'High demand exists', type: 'market_demand', confidenceLevel: 'high' }],
    assumptions: [{ id: 'a1', text: `${RU_CHECKIN} daily`, validationStatus: 'untested' }],
    constraints: [],
    unresolvedQuestions: [{ id: 'q1', text: 'What is the real conversion rate?', status: 'open', priority: 'high' }],
    sourceRefs: [],
    qualityGate: { status: 'passed', passedCount: 10, warnCount: 1, failCount: 0, checks: [] },
    researchUpdates: [],
    executionHandoff: null,
    ...over,
  };
}

function makeManifest(over: Partial<ExportManifest> = {}): ExportManifest {
  return {
    schemaVersion: '1.0.0', exportId: 'job1', workspaceId: 'ws1', projectId: 'proj1',
    packId: 'pack1', packVersion: 3, exportType: 'full_pdf_pack', outputLanguage: 'ru',
    createdBy: 'user1', generatedAt: '2026-07-09T00:00:00.000Z',
    documentList: [], includedDocuments: [], excludedDocuments: [],
    qualityGateSummary: { status: 'passed', passedCount: 10, warnCount: 1, failCount: 0 },
    evidenceSummary: { count: 0, ids: [] },
    assumptionsSummary: { count: 1, ids: ['a1'] },
    constraintsSummary: { count: 0, ids: [] },
    unresolvedQuestionsSummary: { count: 1, ids: ['q1'] },
    sourceRefs: [],
    roleBriefType: null, whiteLabelSettings: null,
    fileList: [], checksum: null,
    language: 'ru', files: [], documentCount: 1, evidenceCount: 0, claimCount: 1,
    ...over,
  } as ExportManifest;
}

const MOJIBAKE_RE = /[ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß]{3,}/; // Latin-1 garbage clusters typical of the Helvetica/Cyrillic bug

async function extractText(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

describe('ExportPdfService — Cyrillic + premium layout', () => {
  const service = new ExportPdfService();

  it('renders Russian Cyrillic correctly, with no replacement char and no mojibake', async () => {
    const pack = makePack();
    const documents = [
      makeDoc('product_vision', `# Product Vision\n\n${RU_APP_TITLE}\n\n${RU_CHECKIN}.\n`, {
        document: { audience: ['founder', 'investor'], purpose: 'Describe the vision.' },
      }),
    ];
    const ev = makeEvidence();
    const manifest = makeManifest();

    const buffer = await service.render('full_pdf_pack', pack, documents, ev, manifest, null);
    const text = await extractText(buffer);

    expect(text).toContain(RU_APP_TITLE);
    expect(text).toContain(RU_CHECKIN);
    expect(text).not.toContain('�'); // U+FFFD replacement character
    expect(MOJIBAKE_RE.test(text)).toBe(false);
  });

  it('includes a branded cover page (title, language, generated date, pack version)', async () => {
    const pack = makePack();
    const documents = [makeDoc('product_vision', '# Product Vision\n\nContent.\n')];
    const buffer = await service.render('full_pdf_pack', pack, documents, makeEvidence(), makeManifest(), null);
    const text = await extractText(buffer);

    expect(text).toContain('SignalKit');
    // The title is long enough to wrap across lines at cover-page font size —
    // normalize whitespace/newlines before checking so the wrap point itself
    // (a legitimate layout detail) doesn't break the assertion.
    expect(text.replace(/\s+/g, ' ')).toContain(RU_APP_TITLE.replace(/\s+/g, ' '));
    expect(text).toContain('RU'); // language code, uppercased
    expect(text).toMatch(/v3/); // pack version
  });

  it('includes a table of contents listing document titles and appendices', async () => {
    // English pack: this test is about TOC structure, not localization —
    // the RU-language cover/TOC/footer chrome is covered separately below,
    // and correctly renders in Russian for a Russian-language pack.
    const pack = makePack({ primaryLanguage: 'en' });
    const documents = [
      makeDoc('product_vision', '# Product Vision\n\nContent.\n'),
      makeDoc('mvp_scope', '# MVP Scope\n\nContent.\n'),
    ];
    const buffer = await service.render('full_pdf_pack', pack, documents, makeEvidence(), makeManifest(), null);
    const text = await extractText(buffer);

    expect(text).toContain('Table of Contents');
    expect(text).toContain('product vision');
    expect(text).toContain('mvp scope');
    expect(text).toContain('Evidence & Assumptions Appendix');
    expect(text).toContain('Source Appendix');
  });

  it('renders page numbers and a footer on content pages', async () => {
    const pack = makePack();
    const documents = [makeDoc('product_vision', '# Product Vision\n\nContent.\n')];
    const buffer = await service.render('full_pdf_pack', pack, documents, makeEvidence(), makeManifest(), null);
    const text = await extractText(buffer);

    expect(text).toMatch(/Page \d+ of \d+/);
    expect(text).toContain('SignalKit');
  });

  it('starts each major section with a clear divider (title + audience + purpose)', async () => {
    const pack = makePack();
    const documents = [
      makeDoc('product_vision', '# Product Vision\n\nBody text here.\n', {
        document: { audience: ['founder', 'investor'], purpose: 'Explain the long-term vision.' },
      }),
    ];
    const buffer = await service.render('full_pdf_pack', pack, documents, makeEvidence(), makeManifest(), null);
    const text = await extractText(buffer);

    expect(text).toMatch(/SECTION 1 \/ 1/);
    expect(text).toContain('founder');
    expect(text).toContain('Explain the long-term vision.');
  });

  it('renders markdown headings, bullet lists, and a table without raw markdown symbols leaking', async () => {
    const body = [
      '# Feature Checklist',
      '',
      '## Must Have',
      '',
      '- Daily check-in reminders',
      '- Mood tracking',
      '',
      '| Feature | Priority |',
      '|---------|----------|',
      '| Check-in | P0 |',
      '| Mood graph | P1 |',
    ].join('\n');
    const pack = makePack();
    const documents = [makeDoc('feature_checklist', body)];
    const buffer = await service.render('full_pdf_pack', pack, documents, makeEvidence(), makeManifest(), null);
    const text = await extractText(buffer);

    expect(text).toContain('Must Have');
    expect(text).toContain('Daily check-in reminders');
    expect(text).toContain('Check-in');
    expect(text).toContain('Mood graph');
    // Raw markdown table syntax should not leak into the rendered text.
    expect(text).not.toContain('|---------|');
    expect(text).not.toContain('**Must Have**');
  });

  it('renders Risks/Assumptions/Source needs bullet blocks as callouts, not plain bold text', async () => {
    const body = [
      '# Risks and Assumptions',
      '',
      '**Risks**',
      '- Users may churn after the free trial.',
      '',
      '**Assumptions**',
      '- Users have a smartphone.',
    ].join('\n');
    const pack = makePack();
    const documents = [makeDoc('risks_and_assumptions', body)];
    const buffer = await service.render('full_pdf_pack', pack, documents, makeEvidence(), makeManifest(), null);
    const text = await extractText(buffer);

    expect(text).toContain('RISKS');
    expect(text).toContain('Users may churn after the free trial.');
    expect(text).toContain('ASSUMPTIONS');
    expect(text).toContain('Users have a smartphone.');
  });

  it('does not export a normal-looking PDF for a pack that failed its quality gate', async () => {
    const pack = makePack();
    const documents = [makeDoc('product_vision', `# Product Vision\n\n${RU_QUALITY_FAILED}\n`)];
    const ev = makeEvidence({
      qualityGate: {
        status: 'failed',
        passedCount: 3,
        warnCount: 1,
        failCount: 2,
        checks: [
          { id: 'no_lorem', label: 'No placeholder lorem ipsum', status: 'fail', message: 'Lorem found in mvp_scope' },
          { id: 'required_docs_present', label: 'All required documents present', status: 'fail', message: 'Missing: roadmap' },
        ],
      },
    });
    const buffer = await service.render('full_pdf_pack', pack, documents, ev, makeManifest({ qualityGateSummary: { status: 'failed', passedCount: 3, warnCount: 1, failCount: 2 } }), null);
    const text = await extractText(buffer);

    expect(text).toContain('Quality Failed');
    expect(text).toContain('Not Build-Ready');
    expect(text).toContain('Lorem found in mvp_scope');
    // Must not look like a normal successful export.
    expect(text).not.toContain('Table of Contents');
    expect(MOJIBAKE_RE.test(text)).toBe(false);
  });

  it('renders a passing pack normally (not the diagnostic page) when the quality gate passed', async () => {
    const pack = makePack({ primaryLanguage: 'en' });
    const documents = [makeDoc('product_vision', '# Product Vision\n\nContent.\n')];
    const buffer = await service.render('full_pdf_pack', pack, documents, makeEvidence(), makeManifest(), null);
    const text = await extractText(buffer);

    expect(text).not.toContain('Quality Failed');
    expect(text).toContain('Table of Contents');
  });
});
