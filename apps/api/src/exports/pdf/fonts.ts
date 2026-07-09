import path from 'path';

/**
 * Unicode font registration for pdfkit. The built-in "Helvetica" family
 * pdfkit ships is a PDF standard font (WinAnsi/Latin-1, 1 byte per glyph) —
 * it cannot encode Cyrillic and silently produces mojibake instead of
 * throwing. Noto Sans (SIL Open Font License, embedded below) covers Latin +
 * Cyrillic + most punctuation/currency, so every string in a Product Pack
 * renders correctly regardless of language.
 *
 * Font files live in apps/api/assets/fonts (sibling of src/, copied into the
 * Docker image explicitly in apps/api/Dockerfile — pnpm's `deploy` command
 * only follows the package.json dependency graph, not arbitrary asset dirs).
 */
export const FONT = {
  regular: 'NotoSans',
  bold: 'NotoSans-Bold',
  italic: 'NotoSans-Italic',
} as const;

const FONT_FILES: Record<string, string> = {
  [FONT.regular]: 'NotoSans-Regular.ttf',
  [FONT.bold]: 'NotoSans-Bold.ttf',
  [FONT.italic]: 'NotoSans-Italic.ttf',
};

function assetsDir(): string {
  // dist/exports/pdf/fonts.js -> ../../../assets  (== apps/api/assets at runtime)
  return path.join(__dirname, '..', '..', '..', 'assets', 'fonts');
}

export function registerFonts(doc: PDFKit.PDFDocument): void {
  const dir = assetsDir();
  for (const [name, file] of Object.entries(FONT_FILES)) {
    doc.registerFont(name, path.join(dir, file));
  }
}

/**
 * Characters that Noto Sans's base instance doesn't carry a glyph for
 * (arrow/dingbat codepoints live in a separate Noto Symbols font upstream).
 * Callouts/scorecards draw their own vector arrows/bullets/checkmarks with
 * pdfkit primitives instead of relying on these glyphs; this normalizer
 * covers the remaining case — an arrow character arriving inside
 * LLM-generated document body text — so it degrades to plain, safe text
 * instead of a missing-glyph box.
 */
const UNSUPPORTED_GLYPH_FALLBACK: Record<string, string> = {
  '→': '->', // →
  '⇒': '=>', // ⇒
  '⟶': '->', // ⟶
  '➜': '->', // ➜
  '➔': '->', // ➔
  '➤': '->', // ➤
  '✓': '[x]', // ✓
  '✔': '[x]', // ✔
  '✗': '[ ]', // ✗
  '●': '•', // ● -> •
  '○': '•', // ○ -> •
  '■': '•', // ■ -> •
  '□': '•', // □ -> •
  '▶': '›', // ▶ -> ›
  '▸': '›', // ▸ -> ›
};

const UNSUPPORTED_GLYPH_RE = new RegExp(`[${Object.keys(UNSUPPORTED_GLYPH_FALLBACK).join('')}]`, 'g');

/** Replace glyphs Noto Sans can't render with a safe equivalent. Never drops a character. */
export function sanitizeForPdf(text: string): string {
  return text.replace(UNSUPPORTED_GLYPH_RE, (ch) => UNSUPPORTED_GLYPH_FALLBACK[ch] ?? ch);
}
