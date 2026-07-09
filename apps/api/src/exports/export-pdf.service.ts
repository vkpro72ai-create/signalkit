import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { ExportManifest, ExportType, LocaleCode, WhiteLabelSnapshot } from '@signalkit/shared';
import type { PackDocumentRow, EvidenceData, PackRow } from './export-renderer.service';
import { ROLE_BRIEF_DOCUMENTS } from '@signalkit/exports';
import type { RoleBriefType } from '@signalkit/shared';
import { createPackContentTranslator, type PackContentTranslator } from '@signalkit/i18n';
import { registerFonts, FONT, sanitizeForPdf } from './pdf/fonts';
import { COLOR, PAGE, TYPE } from './pdf/theme';
import { parseMarkdown } from './pdf/markdown';
import {
  drawCoverPage,
  drawTableOfContents,
  drawSectionDivider,
  drawBlocks,
  drawScoreCards,
  drawCallout,
  drawFailedQualityDiagnostic,
  stampFooter,
  ensureSpace,
} from './pdf/components';

/**
 * PDF export engine using pdfkit + an embedded Unicode font (Noto Sans —
 * see ./pdf/fonts.ts). Flat 2D SignalKit brand style — no gradients, no
 * glassmorphism. Produces cover + TOC + section-divided, structurally
 * rendered (not raw-dumped) Markdown for Full Pack, Founder Summary,
 * Investor Memo, Roadmap, and Agency Client exports.
 *
 * RTL note: pdfkit has limited bidi support. Arabic/Hebrew content is
 * rendered in LTR order with a manifest flag `rtlContentWarning`. Full RTL
 * layout requires a follow-up RTL PDF engine or a headless browser renderer.
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
        margin: PAGE.margin,
        size: PAGE.size,
        bufferPages: true,
        info: {
          Title: pack.title,
          Author: whiteLabelSettings?.preparedBy ?? 'SignalKit',
          Subject: type,
          Keywords: `product pack, ${pack.depth}, ${pack.primaryLanguage}`,
          Creator: whiteLabelSettings?.hideSignalKitBrand ? (whiteLabelSettings.brandName ?? 'SignalKit') : 'SignalKit',
        },
      });

      registerFonts(doc);
      doc.font(FONT.regular);

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const t = createPackContentTranslator(pack.primaryLanguage as LocaleCode);
      const brandName = whiteLabelSettings?.hideSignalKitBrand ? (whiteLabelSettings.brandName ?? 'SignalKit') : 'SignalKit';

      try {
        // A pack that failed its quality gate never gets a normal,
        // successful-looking export — only a short diagnostic marked as such.
        // (Applies to every PDF type, including the copy embedded in the
        // combined markdown_zip bundle, since both go through this method.)
        if (ev.qualityGate?.status === 'failed') {
          drawFailedQualityDiagnostic(doc, {
            brandName,
            title: pack.title,
            qualityStatus: ev.qualityGate.status,
            failCount: ev.qualityGate.failCount,
            warnCount: ev.qualityGate.warnCount,
            passedCount: ev.qualityGate.passedCount,
            checks: (ev.qualityGate.checks as Array<{ label?: string; id?: string; status: string; message: string }>).map((c) => ({
              label: c.label ?? c.id ?? 'Check',
              status: c.status,
              message: c.message,
            })),
          });
          stampFooter(doc, { text: `${brandName} · Quality Failed · ${manifest.generatedAt.slice(0, 10)}` });
          doc.end();
          return;
        }

        this.renderCoverPage(doc, pack, type, documents, ev, whiteLabelSettings, t);
        const includedDocs = this.docsForType(type, documents);
        this.renderTableOfContents(doc, includedDocs, t);
        this.renderDocuments(doc, includedDocs);
        this.renderEvidenceAppendix(doc, ev, t);
        stampFooter(doc, { text: whiteLabelSettings?.footerText ?? (whiteLabelSettings?.hideSignalKitBrand ? brandName : t('export.pdf_footer')) });
      } catch (err) {
        doc.end();
        reject(err);
        return;
      }

      doc.end();
    });
  }

  // ── Section renderers ─────────────────────────────────────────────────────

  private renderCoverPage(
    doc: PDFKit.PDFDocument,
    pack: PackRow,
    type: ExportType,
    documents: PackDocumentRow[],
    ev: EvidenceData,
    wl: WhiteLabelSnapshot | null,
    t: PackContentTranslator,
  ): void {
    const brandName = wl?.hideSignalKitBrand ? (wl.brandName ?? 'SignalKit') : 'SignalKit';

    drawCoverPage(doc, {
      brandName,
      documentTypeLabel: this.exportTypeLabel(type, t),
      title: pack.title,
      opportunityType: pack.verticalTemplate ? pack.verticalTemplate.replace(/_/g, ' ') : null,
      language: pack.primaryLanguage,
      generatedDate: new Date().toISOString().slice(0, 10),
      packVersion: pack.version,
      qualityStatus: ev.qualityGate?.status ?? null,
      confidenceScore: this.averageConfidence(documents),
      providerLabel: this.providerLabel(documents),
      clientName: wl?.clientName ?? null,
      disclaimer: wl?.customDisclaimer ?? t('export.pdf_disclaimer'),
      footerNote: wl?.hideSignalKitBrand ? null : t('export.pdf_footer'),
    });
  }

  private renderTableOfContents(doc: PDFKit.PDFDocument, includedDocs: PackDocumentRow[], t: PackContentTranslator): void {
    const entries = includedDocs.map((d) => d.title);
    entries.push(t('export.pdf_evidence_assumptions_appendix'));
    entries.push(t('export.pdf_source_appendix'));
    drawTableOfContents(doc, t('export.pdf_table_of_contents'), entries);
  }

  private renderDocuments(doc: PDFKit.PDFDocument, includedDocs: PackDocumentRow[]): void {
    includedDocs.forEach((d, i) => {
      if (i > 0) doc.addPage();
      const { audience, purpose } = this.sectionInfo(d);
      drawSectionDivider(doc, { index: i + 1, total: includedDocs.length, title: d.title, audience, purpose });
      drawBlocks(doc, parseMarkdown(this.stripRedundantHeader(d.body)));
    });
  }

  /**
   * documentToMarkdown() (pack.service.ts) already opens every document body
   * with a "# Title" line and "**Audience:**"/"**Purpose:**" bold lines —
   * the section divider now renders those, so repeating them as plain
   * paragraph text would duplicate the same facts twice on the page.
   */
  private stripRedundantHeader(body: string): string {
    const lines = body.split('\n');
    let i = 0;
    if (lines[i]?.trim().startsWith('# ')) i++;
    while (i < lines.length) {
      const line = lines[i]!.trim();
      if (line === '' || /^\*\*(Audience|What this is|Why it exists|Purpose|How to use):\*\*/.test(line)) {
        i++;
        continue;
      }
      break;
    }
    return lines.slice(i).join('\n');
  }

  private sectionInfo(d: PackDocumentRow): { audience?: string[]; purpose?: string } {
    const meta = d.metadata as { document?: { audience?: unknown; purpose?: unknown } } | null | undefined;
    const doc = meta?.document;
    const audience = Array.isArray(doc?.audience) ? (doc!.audience as unknown[]).filter((a): a is string => typeof a === 'string') : undefined;
    const purpose = typeof doc?.purpose === 'string' ? doc.purpose : undefined;
    return { audience, purpose };
  }

  private averageConfidence(documents: PackDocumentRow[]): number | null {
    const values: number[] = [];
    for (const d of documents) {
      const meta = d.metadata as { confidence?: { value?: unknown } } | null | undefined;
      const v = meta?.confidence?.value;
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private providerLabel(documents: PackDocumentRow[]): string | null {
    for (const d of documents) {
      const meta = d.metadata as { aiRuns?: Record<string, { primary?: { provider?: unknown; modelId?: unknown } }> } | null | undefined;
      const aiRuns = meta?.aiRuns;
      if (!aiRuns) continue;
      const labels = new Set<string>();
      for (const run of Object.values(aiRuns)) {
        const provider = run?.primary?.provider;
        const modelId = run?.primary?.modelId;
        if (typeof provider === 'string' && typeof modelId === 'string') labels.add(`${provider}/${modelId}`);
      }
      if (labels.size > 0) return Array.from(labels).join(', ');
    }
    return null;
  }

  private renderEvidenceAppendix(doc: PDFKit.PDFDocument, ev: EvidenceData, t: PackContentTranslator): void {
    doc.addPage();
    doc.font(FONT.bold).fontSize(TYPE.h1).fillColor(COLOR.ink).text(sanitizeForPdf(t('export.pdf_evidence_assumptions_appendix')));
    doc.moveDown(0.6);

    if (ev.qualityGate) {
      drawScoreCards(doc, [
        { label: t('export.pdf_scorecard_status'), value: ev.qualityGate.status, variant: ev.qualityGate.status === 'passed' ? 'success' : ev.qualityGate.status === 'warnings' ? 'warning' : 'neutral' },
        { label: t('export.pdf_scorecard_passed'), value: String(ev.qualityGate.passedCount), variant: 'success' },
        { label: t('export.pdf_scorecard_warnings'), value: String(ev.qualityGate.warnCount), variant: 'warning' },
        { label: t('export.pdf_scorecard_failed'), value: String(ev.qualityGate.failCount), variant: ev.qualityGate.failCount > 0 ? 'risk' : 'neutral' },
      ]);
    }

    if (ev.claims.length > 0) {
      ensureSpace(doc, 20);
      doc.font(FONT.bold).fontSize(TYPE.h3).fillColor(COLOR.ink).text(sanitizeForPdf(t('export.pdf_claims', { n: ev.claims.length })));
      doc.moveDown(0.3);
      drawBlocks(doc, parseMarkdown(ev.claims.map((c) => `- [${c.type} · ${c.confidenceLevel}] ${c.text}`).join('\n')));
    }

    if (ev.assumptions.length > 0) {
      drawCallout(
        doc,
        t('export.pdf_assumptions', { n: ev.assumptions.length }),
        ev.assumptions.map((a) => [{ text: `[${a.validationStatus}] ${a.text}` }]),
      );
      doc.font(FONT.italic).fontSize(TYPE.small).fillColor(COLOR.muted).text(sanitizeForPdf(t('export.pdf_assumptions_caveat')));
      doc.moveDown(0.4);
    }

    if (ev.constraints.length > 0) {
      ensureSpace(doc, 20);
      doc.font(FONT.bold).fontSize(TYPE.h3).fillColor(COLOR.ink).text(sanitizeForPdf(t('export.pdf_constraints', { n: ev.constraints.length })));
      doc.moveDown(0.3);
      drawBlocks(doc, parseMarkdown(ev.constraints.map((c) => `- [${c.category}] ${c.text}`).join('\n')));
    }

    if (ev.unresolvedQuestions.length > 0) {
      drawCallout(
        doc,
        t('export.pdf_unresolved_questions', { n: ev.unresolvedQuestions.length }),
        ev.unresolvedQuestions.map((q) => [{ text: `[${q.priority}] ${q.text}` }]),
      );
      doc.font(FONT.italic).fontSize(TYPE.small).fillColor(COLOR.muted).text(sanitizeForPdf(t('export.pdf_unresolved_caveat')));
    }

    // Source appendix
    doc.addPage();
    doc.font(FONT.bold).fontSize(TYPE.h1).fillColor(COLOR.ink).text(sanitizeForPdf(t('export.pdf_source_appendix')));
    doc.moveDown(0.6);
    if (ev.sourceRefs.length === 0) {
      doc.font(FONT.regular).fontSize(TYPE.body).fillColor(COLOR.subtle).text(sanitizeForPdf(t('export.pdf_no_sources')));
    } else {
      for (const s of ev.sourceRefs) {
        ensureSpace(doc, 32);
        doc.font(FONT.bold).fontSize(TYPE.small).fillColor(COLOR.ink).text(sanitizeForPdf(s.title ?? t('export.pdf_untitled_source')));
        doc.font(FONT.regular).fontSize(TYPE.small).fillColor(COLOR.subtle);
        doc.text(sanitizeForPdf(`Adapter: ${s.adapter}`));
        if (s.url) doc.text(sanitizeForPdf(`URL: ${s.url}`));
        doc.moveDown(0.4);
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private docsForType(type: ExportType, documents: PackDocumentRow[]): PackDocumentRow[] {
    const docMap = new Map(documents.map((d) => [d.docType, d]));

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
