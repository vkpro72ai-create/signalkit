import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { ExportManifest, ExportType, LocaleCode, WhiteLabelSnapshot } from '@signalkit/shared';
import type { PackDocumentRow, EvidenceData, PackRow } from './export-renderer.service';
import { ROLE_BRIEF_DOCUMENTS } from '@signalkit/exports';
import type { RoleBriefType } from '@signalkit/shared';
import { createPackContentTranslator, type PackContentTranslator } from '@signalkit/i18n';

// Flat 2D palette — no gradients
const COLORS = {
  black: '#111111',
  gray: '#555555',
  lightGray: '#aaaaaa',
  border: '#cccccc',
  accent: '#1a1a1a',
  bg: '#ffffff',
  sectionLine: '#dddddd',
} as const;

/**
 * PDF export engine using pdfkit. Flat 2D style — no gradients, no
 * glassmorphism. Produces readable PDFs for Full Pack, Founder Summary,
 * Investor Memo, Roadmap, and Agency Client exports.
 *
 * RTL note: pdfkit has limited bidi support. Arabic/Hebrew content is rendered
 * in LTR order with a manifest flag `rtlContentWarning`. Full RTL layout
 * requires a follow-up RTL PDF engine or a headless browser renderer.
 */
@Injectable()
export class ExportPdfService {
  private readonly logger = new Logger(ExportPdfService.name);

  async render(
    type: ExportType,
    pack: PackRow,
    documents: PackDocumentRow[],
    ev: EvidenceData,
    manifest: ExportManifest,
    whiteLabelSettings: WhiteLabelSnapshot | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        margin: 60,
        size: 'A4',
        info: {
          Title: pack.title,
          Author: whiteLabelSettings?.preparedBy ?? 'SignalKit',
          Subject: type,
          Keywords: `product pack, ${pack.depth}, ${pack.primaryLanguage}`,
          Creator: whiteLabelSettings?.hideSignalKitBrand ? (whiteLabelSettings.brandName ?? 'SignalKit') : 'SignalKit',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const t = createPackContentTranslator(pack.primaryLanguage as LocaleCode);
      try {
        this.renderTitlePage(doc, pack, type, whiteLabelSettings, t);
        this.renderTableOfContents(doc, documents, type, ev, t);
        this.renderDocuments(doc, pack, documents, type, ev);
        this.renderEvidenceAppendix(doc, ev, t);
        this.renderFooter(doc, manifest, whiteLabelSettings, t);
      } catch (err) {
        doc.end();
        reject(err);
        return;
      }

      doc.end();
    });
  }

  // ── Section renderers ─────────────────────────────────────────────────────

  private renderTitlePage(doc: PDFKit.PDFDocument, pack: PackRow, type: ExportType, wl: WhiteLabelSnapshot | null, t: PackContentTranslator): void {
    const brandName = wl?.brandName ?? 'SignalKit';
    const clientName = wl?.clientName;

    // Title block
    doc.moveDown(4);
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(COLORS.black)
      .text(pack.title, { align: 'center' });

    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(13)
      .fillColor(COLORS.gray)
      .text(this.exportTypeLabel(type, t), { align: 'center' });

    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .fillColor(COLORS.lightGray)
      .text(t('export.pdf_title_meta_line', {
        depth: pack.depth.replace(/_/g, ' '),
        vertical: pack.verticalTemplate.replace(/_/g, ' '),
        language: pack.primaryLanguage.toUpperCase(),
      }), { align: 'center' });

    // Separator
    doc.moveDown(2);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(COLORS.sectionLine).lineWidth(1).stroke();
    doc.moveDown(2);

    // Meta info
    const meta = [
      clientName ? `${t('export.pdf_prepared_for')}: ${clientName}` : null,
      `${t('export.pdf_prepared_by')}: ${wl?.preparedBy ?? brandName}`,
      `${t('export.pdf_generated')}: ${new Date().toISOString().slice(0, 10)}`,
      `${t('export.pdf_pack_version')}: ${pack.version}`,
    ].filter(Boolean) as string[];

    doc.font('Helvetica').fontSize(10).fillColor(COLORS.gray);
    for (const line of meta) {
      doc.text(line, { align: 'center' });
    }

    // Disclaimer
    doc.moveDown(4);
    const disclaimer = wl?.customDisclaimer ?? t('export.pdf_disclaimer');

    doc.fontSize(9).fillColor(COLORS.lightGray).text(disclaimer, { align: 'center' });

    if (!wl?.hideSignalKitBrand) {
      doc.moveDown(1);
      doc.fontSize(8).fillColor(COLORS.lightGray).text(t('export.pdf_footer'), { align: 'center' });
    }

    doc.addPage();
  }

  private renderTableOfContents(doc: PDFKit.PDFDocument, documents: PackDocumentRow[], type: ExportType, _ev: EvidenceData, t: PackContentTranslator): void {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.black).text(t('export.pdf_table_of_contents'));
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(COLORS.sectionLine).lineWidth(0.5).stroke();
    doc.moveDown(0.5);

    const includedDocs = this.docsForType(type, documents);
    let n = 1;
    for (const d of includedDocs) {
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.black).text(`${n++}. ${d.title}`);
    }

    // Always include appendices
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.gray).text(`${n++}. ${t('export.pdf_evidence_assumptions_appendix')}`);
    doc.text(`${n}. ${t('export.pdf_source_appendix')}`);

    doc.addPage();
  }

  private renderDocuments(doc: PDFKit.PDFDocument, _pack: PackRow, documents: PackDocumentRow[], type: ExportType, _ev: EvidenceData): void {
    const includedDocs = this.docsForType(type, documents);
    for (const d of includedDocs) {
      this.renderDocumentSection(doc, d);
    }
  }

  private renderDocumentSection(doc: PDFKit.PDFDocument, d: PackDocumentRow): void {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.black).text(d.title);
    doc.moveDown(0.25);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(COLORS.accent).lineWidth(1).stroke();
    doc.moveDown(0.5);

    // Render markdown-ish content with basic formatting
    const lines = d.body.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.black).text(line.replace(/^#+ /, ''));
      } else if (line.startsWith('## ')) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.black).text(line.replace(/^#+ /, ''));
      } else if (line.startsWith('### ')) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.gray).text(line.replace(/^#+ /, ''));
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.black).text(`  • ${line.slice(2)}`);
      } else if (line.startsWith('> ')) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.gray).text(`  ${line.slice(2)}`);
      } else if (line.trim() === '---' || line.trim() === '***') {
        doc.moveDown(0.25);
        doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(COLORS.sectionLine).lineWidth(0.5).stroke();
        doc.moveDown(0.25);
      } else if (line.trim() === '') {
        doc.moveDown(0.3);
      } else {
        const clean = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/_(.*?)_/g, '$1');
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.black).text(clean, { lineGap: 1 });
      }
    }

    doc.addPage();
  }

  private renderEvidenceAppendix(doc: PDFKit.PDFDocument, ev: EvidenceData, t: PackContentTranslator): void {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.black).text(t('export.pdf_evidence_assumptions_appendix'));
    doc.moveDown(0.5);

    // Quality gate summary
    if (ev.qualityGate) {
      doc.font('Helvetica-Bold').fontSize(11).text(t('export.pdf_quality_gate_summary'));
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.gray);
      doc.text(t('export.pdf_quality_gate_line', {
        status: ev.qualityGate.status,
        passed: ev.qualityGate.passedCount,
        warnings: ev.qualityGate.warnCount,
        failed: ev.qualityGate.failCount,
      }));
      doc.moveDown(0.5);
    }

    // Claims
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black).text(t('export.pdf_claims', { n: ev.claims.length }));
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.black);
    for (const c of ev.claims) {
      doc.text(`• [${c.type} · ${c.confidenceLevel}] ${c.text}`);
    }
    doc.moveDown(0.5);

    // Assumptions
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black).text(t('export.pdf_assumptions', { n: ev.assumptions.length }));
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.gray).text(t('export.pdf_assumptions_caveat'));
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.black);
    for (const a of ev.assumptions) {
      doc.text(`• [${a.validationStatus}] ${a.text}`);
    }
    doc.moveDown(0.5);

    // Constraints
    if (ev.constraints.length > 0) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black).text(t('export.pdf_constraints', { n: ev.constraints.length }));
      doc.font('Helvetica').fontSize(9);
      for (const c of ev.constraints) {
        doc.text(`• [${c.category}] ${c.text}`);
      }
      doc.moveDown(0.5);
    }

    // Unresolved questions
    if (ev.unresolvedQuestions.length > 0) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black).text(t('export.pdf_unresolved_questions', { n: ev.unresolvedQuestions.length }));
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.gray).text(t('export.pdf_unresolved_caveat'));
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.black);
      for (const q of ev.unresolvedQuestions) {
        doc.text(`• [${q.priority}] ${q.text}`);
      }
      doc.moveDown(0.5);
    }

    // Source appendix
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.black).text(t('export.pdf_source_appendix'));
    doc.moveDown(0.5);
    if (ev.sourceRefs.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.gray).text(t('export.pdf_no_sources'));
    } else {
      for (const s of ev.sourceRefs) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.black).text(s.title ?? t('export.pdf_untitled_source'));
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.gray);
        doc.text(`Adapter: ${s.adapter}`);
        if (s.url) doc.text(`URL: ${s.url}`);
        doc.moveDown(0.3);
      }
    }
  }

  private renderFooter(doc: PDFKit.PDFDocument, manifest: ExportManifest, wl: WhiteLabelSnapshot | null, t: PackContentTranslator): void {
    const footer = wl?.footerText ?? (wl?.hideSignalKitBrand ? '' : t('export.pdf_footer'));
    if (!footer) return;

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(COLORS.lightGray)
        .text(
          `${footer} | ${manifest.generatedAt.slice(0, 10)} | ${t('export.pdf_page_of', { current: i + 1, total: range.count })}`,
          60,
          doc.page.height - 30,
          { align: 'center', width: doc.page.width - 120 },
        );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private docsForType(type: ExportType, documents: PackDocumentRow[]): PackDocumentRow[] {
    const docMap = new Map(documents.map((d) => [d.docType, d]));

    // Role-mapped PDF types use role brief document selection
    const roleMap: Partial<Record<ExportType, RoleBriefType>> = {
      founder_summary_pdf: 'founder',
      investor_memo_pdf: 'investor',
    };
    const role = roleMap[type];
    if (role) {
      return (ROLE_BRIEF_DOCUMENTS[role] as string[])
        .map((dt: string) => docMap.get(dt))
        .filter((d): d is PackDocumentRow => d !== undefined);
    }

    if (type === 'roadmap_pdf') {
      return [docMap.get('roadmap'), docMap.get('mvp_scope'), docMap.get('feature_checklist')]
        .filter((d): d is PackDocumentRow => d !== undefined);
    }

    if (type === 'client_agency_export') {
      return [docMap.get('product_vision'), docMap.get('market_context'), docMap.get('target_audience_icp'), docMap.get('mvp_scope'), docMap.get('roadmap')]
        .filter((d): d is PackDocumentRow => d !== undefined);
    }

    // full_pdf_pack — all documents
    return documents;
  }

  private exportTypeLabel(type: ExportType, t: PackContentTranslator): string {
    const labels: Partial<Record<ExportType, string>> = {
      full_pdf_pack: t('export.pdf_type_full_pack'),
      founder_summary_pdf: t('export.role_title_founder'),
      investor_memo_pdf: t('export.role_title_investor'),
      roadmap_pdf: t('title.roadmap'),
      client_agency_export: t('export.pdf_type_client_agency'),
    };
    return labels[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
