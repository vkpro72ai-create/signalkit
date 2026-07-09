/**
 * Line-based Markdown -> structured block parser for the exact dialect
 * ProductPackDocument.body is written in (see `documentToMarkdown()` in
 * apps/api/src/packs/pack.service.ts): `#`/`##`/`###` headings, `**bold**`,
 * `_italic_`, `- `/`* ` bullets, `1. ` numbered lists, `> ` blockquotes,
 * `---`/`***` rules, and occasional GFM pipe tables in free-form LLM section
 * content. Not a general-purpose Markdown engine — deliberately scoped so
 * every construct maps 1:1 to a pdfkit drawing primitive instead of being
 * dumped as raw text.
 *
 * Mirrors the `**Risks**` / `**Assumptions**` / `**Source needs**` callout
 * convention from apps/web/components/markdown.tsx (a bold label line
 * immediately followed by a bullet list) so the same content reads the same
 * way in the web reader and the PDF.
 */

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'list'; ordered: boolean; items: InlineRun[][] }
  | { type: 'callout'; label: string; items: InlineRun[][] }
  | { type: 'blockquote'; runs: InlineRun[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' };

const CALLOUT_LABELS = new Set(['Risks', 'Assumptions', 'Source needs', 'Warnings', 'Warning', 'Risk']);

export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push({ text: part.slice(2, -2), bold: true });
    } else if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      runs.push({ text: part.slice(1, -1), italic: true });
    } else {
      runs.push({ text: part });
    }
  }
  return runs;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return /^\|?[\s:|-]+\|?$/.test(t) && t.includes('-');
}

function splitTableRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((cell) => cell.trim());
}

export function parseMarkdown(body: string): Block[] {
  const lines = body.split('\n');
  const blocks: Block[] = [];

  let paragraphBuf: string[] = [];
  let listBuf: string[] = [];
  let listOrdered = false;
  let pendingCalloutLabel: string | null = null;

  const flushParagraph = () => {
    if (paragraphBuf.length) {
      blocks.push({ type: 'paragraph', runs: parseInline(paragraphBuf.join(' ').trim()) });
      paragraphBuf = [];
    }
  };

  const flushList = () => {
    if (listBuf.length) {
      const items = listBuf.map((item) => parseInline(item));
      if (pendingCalloutLabel) {
        blocks.push({ type: 'callout', label: pendingCalloutLabel, items });
      } else {
        blocks.push({ type: 'list', ordered: listOrdered, items });
      }
      listBuf = [];
    }
    pendingCalloutLabel = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    const trimmed = line.trim();

    // GFM table: a "| a | b |" line followed by a "|---|---|" separator.
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      flushAll();
      const header = splitTableRow(trimmed);
      i += 1; // skip separator
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1]!.trim().startsWith('|')) {
        i += 1;
        rows.push(splitTableRow(lines[i]!));
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);

    if (bulletMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      if (listBuf.length && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listBuf.push((bulletMatch ?? orderedMatch)![1]!);
      continue;
    }

    // Bold-only line immediately preceding a bullet list -> callout label
    // (e.g. "**Risks**" then "- ..." lines), matching the web convention.
    const labelMatch = trimmed.match(/^\*\*([^*]+)\*\*$/);
    if (labelMatch && CALLOUT_LABELS.has(labelMatch[1]!)) {
      flushAll();
      pendingCalloutLabel = labelMatch[1]!;
      continue;
    }

    flushList();

    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      flushParagraph();
      blocks.push({ type: 'hr' });
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.*)$/);
    const h2 = trimmed.match(/^##\s+(.*)$/);
    const h1 = trimmed.match(/^#\s+(.*)$/);
    if (h3 || h2 || h1) {
      flushParagraph();
      const level = h1 ? 1 : h2 ? 2 : 3;
      const text = (h1 ?? h2 ?? h3)![1]!;
      blocks.push({ type: 'heading', level, runs: parseInline(text) });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ type: 'blockquote', runs: parseInline(quote[1]!) });
      continue;
    }

    paragraphBuf.push(trimmed);
  }

  flushAll();
  return blocks;
}
