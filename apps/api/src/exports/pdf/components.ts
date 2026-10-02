import { COLOR, PAGE, SPACE, TYPE, statusColor } from './theme';
import { FONT, sanitizeForPdf } from './fonts';
import type { Block, InlineRun } from './markdown';

type Doc = PDFKit.PDFDocument;

const CONTENT_BOTTOM_RESERVE = PAGE.footerHeight + SPACE.sm;

function contentBottom(doc: Doc): number {
  return doc.page.height - PAGE.margin - CONTENT_BOTTOM_RESERVE;
}

/** Start a new page if the next block wouldn't fit above the footer reserve. */
export function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > contentBottom(doc)) {
    doc.addPage();
  }
}

function hr(doc: Doc, color: string = COLOR.line, width = 1): void {
  doc.moveTo(PAGE.margin, doc.y).lineTo(doc.page.width - PAGE.margin, doc.y).strokeColor(color).lineWidth(width).stroke();
}

/** Writes mixed bold/italic/plain runs as one visual paragraph (pdfkit `continued` text). */
function writeRuns(doc: Doc, runs: InlineRun[], opts: { size: number; color?: string; lineGap?: number } = { size: TYPE.body }): void {
  const color = opts.color ?? COLOR.ink;
  const nonEmpty = runs.filter((r) => r.text.length > 0);
  if (nonEmpty.length === 0) {
    doc.text('', { lineGap: opts.lineGap });
    return;
  }
  nonEmpty.forEach((run, i) => {
    const font = run.bold ? FONT.bold : run.italic ? FONT.italic : FONT.regular;
    doc.font(font).fontSize(opts.size).fillColor(color);
    doc.text(sanitizeForPdf(run.text), { continued: i < nonEmpty.length - 1, lineGap: opts.lineGap });
  });
}

function runsToPlainText(runs: InlineRun[]): string {
  return runs.map((r) => r.text).join('');
}

// ── Cover page ───────────────────────────────────────────────────────────────

export interface CoverInfo {
  brandName: string;
  documentTypeLabel: string;
  title: string;
  opportunityType?: string | null;
  language: string;
  generatedDate: string;
  packVersion: number;
  qualityStatus?: string | null;
  confidenceScore?: number | null;
  providerLabel?: string | null;
  clientName?: string | null;
  disclaimer: string;
  footerNote?: string | null;
}

export function drawCoverPage(doc: Doc, info: CoverInfo): void {
  const pageW = doc.page.width;
  const left = PAGE.margin;

  // Brand mark block
  doc.rect(left, 70, 34, 34).fill(COLOR.brand);
  doc.font(FONT.bold).fontSize(16).fillColor(COLOR.white).text('SK', left, 79, { width: 34, align: 'center' });

  doc.font(FONT.bold).fontSize(TYPE.h2).fillColor(COLOR.brand).text(sanitizeForPdf(info.brandName), left + 44, 78);
  doc.font(FONT.regular).fontSize(TYPE.small).fillColor(COLOR.subtle).text(sanitizeForPdf(info.documentTypeLabel), left + 44, 96);

  doc.y = 180;
  doc.x = left;

  doc.font(FONT.bold).fontSize(TYPE.display).fillColor(COLOR.ink).text(sanitizeForPdf(info.title), left, doc.y, { width: pageW - left * 2 });

  doc.moveDown(0.6);
  if (info.opportunityType) {
    doc.font(FONT.regular).fontSize(TYPE.h3).fillColor(COLOR.subtle).text(sanitizeForPdf(info.opportunityType), { width: pageW - left * 2 });
  }

  doc.moveDown(1.2);
  hr(doc, COLOR.line, 1);
  doc.moveDown(1);

  const metaRows: Array<[string, string]> = [
    ['Language', info.language.toUpperCase()],
    ['Generated', info.generatedDate],
    ['Pack version', `v${info.packVersion}`],
  ];
  if (info.clientName) metaRows.unshift(['Prepared for', info.clientName]);
  if (info.qualityStatus) metaRows.push(['Quality status', info.qualityStatus]);
  if (info.confidenceScore != null) metaRows.push(['Confidence', `${Math.round(info.confidenceScore * 100)}%`]);
  if (info.providerLabel) metaRows.push(['Generated with', info.providerLabel]);

  const colW = (pageW - left * 2) / 2;
  metaRows.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = left + col * colW;
    const y = doc.y + row * 34;
    doc.font(FONT.regular).fontSize(TYPE.small).fillColor(COLOR.muted).text(sanitizeForPdf(k.toUpperCase()), x, y, { width: colW - SPACE.md });
    doc.font(FONT.bold).fontSize(TYPE.body).fillColor(COLOR.ink).text(sanitizeForPdf(v), x, y + 12, { width: colW - SPACE.md });
  });
  doc.y = doc.y + Math.ceil(metaRows.length / 2) * 34 + SPACE.lg;

  // Disclaimer pinned near the bottom of the cover, above the footer reserve.
  const discY = contentBottom(doc) - 60;
  doc.font(FONT.italic).fontSize(TYPE.small).fillColor(COLOR.muted).text(sanitizeForPdf(info.disclaimer), left, discY, { width: pageW - left * 2 });
  if (info.footerNote) {
    doc.font(FONT.regular).fontSize(TYPE.micro).fillColor(COLOR.faint).text(sanitizeForPdf(info.footerNote), left, discY + 40, { width: pageW - left * 2 });
  }

  doc.addPage();
}

// ── Table of contents ────────────────────────────────────────────────────────

export function drawTableOfContents(doc: Doc, title: string, entries: string[]): void {
  doc.font(FONT.bold).fontSize(TYPE.h1).fillColor(COLOR.ink).text(sanitizeForPdf(title));
  doc.moveDown(0.3);
  hr(doc, COLOR.brand, 2);
  doc.moveDown(0.8);

  entries.forEach((entry, i) => {
    ensureSpace(doc, 22);
    const y = doc.y;
    doc.font(FONT.regular).fontSize(TYPE.body).fillColor(COLOR.muted).text(String(i + 1).padStart(2, '0'), PAGE.margin, y, { width: 28 });
    doc.font(FONT.regular).fontSize(TYPE.body).fillColor(COLOR.ink).text(sanitizeForPdf(entry), PAGE.margin + 32, y, { width: doc.page.width - PAGE.margin * 2 - 32 });
    doc.moveDown(0.35);
    hr(doc, COLOR.line, 0.5);
    doc.moveDown(0.35);
  });

  doc.addPage();
}

// ── Section divider ──────────────────────────────────────────────────────────

export interface SectionDividerInfo {
  index: number;
  total: number;
  title: string;
  audience?: string[];
  purpose?: string;
}

export function drawSectionDivider(doc: Doc, info: SectionDividerInfo): void {
  const left = PAGE.margin;
  const pageW = doc.page.width;

  doc.font(FONT.bold).fontSize(TYPE.small).fillColor(COLOR.brand)
    .text(sanitizeForPdf(`SECTION ${info.index} / ${info.total}`), left, doc.y);
  doc.moveDown(0.4);
  doc.font(FONT.bold).fontSize(TYPE.h1).fillColor(COLOR.ink).text(sanitizeForPdf(info.title), { width: pageW - left * 2 });
  doc.moveDown(0.5);
  doc.rect(left, doc.y, 48, 3).fill(COLOR.brand);
  doc.moveDown(0.8);

  if (info.audience && info.audience.length > 0) {
    doc.font(FONT.regular).fontSize(TYPE.small).fillColor(COLOR.subtle)
      .text(sanitizeForPdf(`For: ${info.audience.join(' · ')}`), { width: pageW - left * 2 });
    doc.moveDown(0.3);
  }
  if (info.purpose) {
    doc.font(FONT.italic).fontSize(TYPE.body).fillColor(COLOR.subtle)
      .text(sanitizeForPdf(info.purpose), { width: pageW - left * 2, lineGap: 2 });
  }

  doc.moveDown(1.2);
}

// ── Score card row ────────────────────────────────────────────────────────────

export interface ScoreCardItem {
  label: string;
  value: string;
  variant?: 'neutral' | 'success' | 'warning' | 'risk' | 'confidence';
}

export function drawScoreCards(doc: Doc, items: ScoreCardItem[]): void {
  if (items.length === 0) return;
  const left = PAGE.margin;
  const pageW = doc.page.width - left * 2;
  const gap = SPACE.sm;
  const cardW = (pageW - gap * (items.length - 1)) / items.length;
  const cardH = 56;

  ensureSpace(doc, cardH + SPACE.md);
  const y = doc.y;

  items.forEach((item, i) => {
    const x = left + i * (cardW + gap);
    const c = item.variant === 'success' ? { fg: COLOR.success, bg: COLOR.successBg, border: COLOR.successBorder }
      : item.variant === 'warning' ? { fg: COLOR.warning, bg: COLOR.warningBg, border: COLOR.warningBorder }
      : item.variant === 'risk' ? { fg: COLOR.risk, bg: COLOR.riskBg, border: COLOR.riskBorder }
      : item.variant === 'confidence' ? { fg: COLOR.confidence, bg: COLOR.confidenceBg, border: COLOR.confidenceBorder }
      : { fg: COLOR.ink, bg: COLOR.surfaceRaised, border: COLOR.line };

    doc.roundedRect(x, y, cardW, cardH, 6).fillAndStroke(c.bg, c.border);
    doc.font(FONT.regular).fontSize(TYPE.micro).fillColor(c.fg)
      .text(sanitizeForPdf(item.label.toUpperCase()), x + SPACE.sm, y + SPACE.sm, { width: cardW - SPACE.md });
    doc.font(FONT.bold).fontSize(TYPE.h2).fillColor(c.fg)
      .text(sanitizeForPdf(item.value), x + SPACE.sm, y + SPACE.sm + 14, { width: cardW - SPACE.md });
  });

  doc.y = y + cardH + SPACE.md;
}

// ── Callout ───────────────────────────────────────────────────────────────────

function calloutVariantFor(label: string): 'warning' | 'risk' | 'confidence' | 'neutral' {
  const l = label.toLowerCase();
  if (l.includes('risk')) return 'risk';
  if (l.includes('assumption') || l.includes('warning') || l.includes('source needed') || l.includes('source needs')) return 'warning';
  return 'neutral';
}

export function drawCallout(doc: Doc, label: string, items: InlineRun[][]): void {
  const left = PAGE.margin;
  const width = doc.page.width - left * 2;
  const variant = calloutVariantFor(label);
  const c = variant === 'risk' ? { fg: COLOR.risk, bg: COLOR.riskBg, border: COLOR.riskBorder }
    : variant === 'warning' ? { fg: COLOR.warning, bg: COLOR.warningBg, border: COLOR.warningBorder }
    : { fg: COLOR.ink, bg: COLOR.surfaceRaised, border: COLOR.line };

  // Measure height first so we can draw the box, then the content on top.
  const padding = SPACE.sm;
  const lineHeight = 13;
  const labelHeight = 14;
  const textWidth = width - padding * 2 - 14;
  let linesCount = 0;
  for (const item of items) {
    const text = runsToPlainText(item);
    linesCount += doc.font(FONT.regular).fontSize(TYPE.small).heightOfString(text, { width: textWidth }) / lineHeight;
  }
  const boxHeight = labelHeight + Math.max(1, Math.ceil(linesCount)) * lineHeight + padding * 2;

  ensureSpace(doc, boxHeight + SPACE.sm);
  const y = doc.y;
  doc.roundedRect(left, y, width, boxHeight, 6).fillAndStroke(c.bg, c.border);

  doc.font(FONT.bold).fontSize(TYPE.small).fillColor(c.fg).text(sanitizeForPdf(label.toUpperCase()), left + padding, y + padding, { width: width - padding * 2 });
  let cursorY = y + padding + labelHeight;
  for (const item of items) {
    doc.roundedRect(left + padding, cursorY + 4, 4, 4, 1).fill(c.fg);
    doc.font(FONT.regular).fontSize(TYPE.small).fillColor(c.fg)
      .text(sanitizeForPdf(runsToPlainText(item)), left + padding + 14, cursorY, { width: textWidth });
    cursorY = doc.y;
  }

  doc.y = y + boxHeight + SPACE.sm;
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function drawTable(doc: Doc, header: string[], rows: string[][]): void {
  const left = PAGE.margin;
  const width = doc.page.width - left * 2;
  const colW = width / header.length;
  const cellPad = 6;
  const rowLineHeight = 12;

  const rowHeight = (cells: string[]): number => {
    let max = rowLineHeight + cellPad * 2;
    for (const cell of cells) {
      const h = doc.font(FONT.regular).fontSize(TYPE.small).heightOfString(sanitizeForPdf(cell), { width: colW - cellPad * 2 }) + cellPad * 2;
      if (h > max) max = h;
    }
    return max;
  };

  const drawRow = (cells: string[], opts: { header?: boolean }) => {
    const h = rowHeight(cells);
    ensureSpace(doc, h);
    const y = doc.y;
    if (opts.header) {
      doc.rect(left, y, width, h).fill(COLOR.brand);
    } else {
      doc.rect(left, y, width, h).fillAndStroke(COLOR.surface, COLOR.line);
    }
    cells.forEach((cell, i) => {
      const x = left + i * colW;
      doc.font(opts.header ? FONT.bold : FONT.regular).fontSize(TYPE.small)
        .fillColor(opts.header ? COLOR.white : COLOR.ink)
        .text(sanitizeForPdf(cell), x + cellPad, y + cellPad, { width: colW - cellPad * 2 });
    });
    doc.y = y + h;
  };

  drawRow(header, { header: true });
  for (const row of rows) drawRow(row, {});
  doc.moveDown(0.5);
}

// ── Block renderer (walks parseMarkdown() output) ────────────────────────────

export function drawBlocks(doc: Doc, blocks: Block[]): void {
  const left = PAGE.margin;
  const width = doc.page.width - left * 2;

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        ensureSpace(doc, 30);
        const size = block.level === 1 ? TYPE.h1 : block.level === 2 ? TYPE.h2 : TYPE.h3;
        doc.moveDown(block.level === 1 ? 0.6 : 0.4);
        doc.x = left;
        writeRuns(doc, block.runs.map((r) => ({ ...r, bold: true })), { size, color: block.level === 3 ? COLOR.subtle : COLOR.ink });
        doc.moveDown(0.25);
        break;
      }
      case 'paragraph': {
        ensureSpace(doc, 16);
        doc.x = left;
        writeRuns(doc, block.runs, { size: TYPE.body, color: COLOR.ink, lineGap: 2 });
        doc.moveDown(0.35);
        break;
      }
      case 'list': {
        const indent = block.ordered ? 20 : 14;
        block.items.forEach((item, idx) => {
          ensureSpace(doc, 14);
          const marker = block.ordered ? `${idx + 1}.` : '•';
          const y = doc.y;
          doc.font(FONT.regular).fontSize(TYPE.body).fillColor(COLOR.brand).text(marker, left, y, { width: indent, lineBreak: false });
          doc.y = y;
          doc.x = left + indent;
          writeRuns(doc, item, { size: TYPE.body, color: COLOR.ink, lineGap: 1 });
        });
        doc.moveDown(0.35);
        break;
      }
      case 'callout': {
        drawCallout(doc, block.label, block.items);
        break;
      }
      case 'blockquote': {
        ensureSpace(doc, 20);
        const y = doc.y;
        const text = runsToPlainText(block.runs);
        const h = doc.font(FONT.italic).fontSize(TYPE.body).heightOfString(sanitizeForPdf(text), { width: width - 16 });
        doc.rect(left, y, 3, h).fill(COLOR.brandMid);
        doc.font(FONT.italic).fontSize(TYPE.body).fillColor(COLOR.subtle).text(sanitizeForPdf(text), left + 12, y, { width: width - 12 });
        doc.moveDown(0.35);
        break;
      }
      case 'table': {
        drawTable(doc, block.header, block.rows);
        break;
      }
      case 'hr': {
        doc.moveDown(0.3);
        hr(doc, COLOR.line, 0.5);
        doc.moveDown(0.3);
        break;
      }
    }
  }
}

// ── Footer / pagination ───────────────────────────────────────────────────────

export function stampFooter(doc: Doc, opts: { text: string; startPage?: number }): void {
  const range = doc.bufferedPageRange();
  const startPage = opts.startPage ?? 0;
  for (let i = startPage; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const pageNum = i - startPage + 1;
    const totalPages = range.count - startPage;
    hr(doc, COLOR.line, 0.5);
    doc.font(FONT.regular).fontSize(TYPE.micro).fillColor(COLOR.muted).text(
      sanitizeForPdf(`${opts.text} · Page ${pageNum} of ${totalPages}`),
      PAGE.margin,
      doc.page.height - PAGE.footerHeight,
      { align: 'center', width: doc.page.width - PAGE.margin * 2 },
    );
  }
}

// ── Failed-quality diagnostic page ───────────────────────────────────────────

export function drawFailedQualityDiagnostic(doc: Doc, opts: {
  brandName: string;
  title: string;
  qualityStatus: string;
  failCount: number;
  warnCount: number;
  passedCount: number;
  checks: Array<{ label: string; status: string; message: string }>;
}): void {
  const left = PAGE.margin;
  const width = doc.page.width - left * 2;

  doc.rect(left, 70, 34, 34).fill(COLOR.risk);
  doc.font(FONT.bold).fontSize(16).fillColor(COLOR.white).text('!', left, 79, { width: 34, align: 'center' });
  doc.font(FONT.bold).fontSize(TYPE.h2).fillColor(COLOR.risk).text(sanitizeForPdf(opts.brandName), left + 44, 78);

  doc.y = 140;
  doc.font(FONT.bold).fontSize(TYPE.display).fillColor(COLOR.risk).text('Quality Failed', left, doc.y, { width });
  doc.moveDown(0.3);
  doc.font(FONT.bold).fontSize(TYPE.h2).fillColor(COLOR.ink).text('Not Build-Ready', { width });
  doc.moveDown(0.8);

  doc.font(FONT.regular).fontSize(TYPE.body).fillColor(COLOR.subtle).text(
    sanitizeForPdf(`"${opts.title}" did not pass its quality gate. A full presentation-quality export is intentionally withheld until the underlying content is fixed — exporting a polished-looking document for failing content would misrepresent its readiness.`),
    { width, lineGap: 2 },
  );
  doc.moveDown(1);

  drawScoreCards(doc, [
    { label: 'Status', value: opts.qualityStatus, variant: 'risk' },
    { label: 'Passed', value: String(opts.passedCount), variant: 'success' },
    { label: 'Warnings', value: String(opts.warnCount), variant: 'warning' },
    { label: 'Failed', value: String(opts.failCount), variant: 'risk' },
  ]);

  doc.moveDown(0.5);
  if (opts.checks.length > 0) {
    doc.font(FONT.bold).fontSize(TYPE.h3).fillColor(COLOR.ink).text('Failing checks');
    doc.moveDown(0.3);
    for (const check of opts.checks.filter((c) => c.status === 'failed' || c.status === 'fail')) {
      ensureSpace(doc, 24);
      const c = statusColor(check.status);
      doc.roundedRect(left, doc.y, 4, 4, 1).fill(c.fg);
      doc.font(FONT.bold).fontSize(TYPE.small).fillColor(c.fg).text(sanitizeForPdf(check.label), left + 12, doc.y - 4, { width: width - 12 });
      doc.font(FONT.regular).fontSize(TYPE.small).fillColor(COLOR.subtle).text(sanitizeForPdf(check.message), left + 12, doc.y, { width: width - 12 });
      doc.moveDown(0.4);
    }
  }
}
