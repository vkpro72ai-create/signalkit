/**
 * Lightweight language detection (no external service). Non-latin scripts are
 * detected definitively by Unicode range; latin languages by stopword frequency.
 * Falls back to the market language when uncertain (never guesses wildly).
 */
import type { LocaleCode } from '@signalkit/shared';

const SCRIPT: Partial<Record<LocaleCode, RegExp>> = {
  ar: /[؀-ۿ]/,
  ru: /[Ѐ-ӿ]/,
  hi: /[ऀ-ॿ]/,
};

const STOPWORDS: Partial<Record<LocaleCode, string[]>> = {
  en: ['the', 'and', 'of', 'to', 'is', 'for', 'with', 'you'],
  de: ['der', 'die', 'und', 'das', 'ist', 'mit', 'nicht', 'ein'],
  es: ['el', 'la', 'de', 'que', 'los', 'una', 'para', 'con'],
  fr: ['le', 'la', 'les', 'des', 'une', 'est', 'pour', 'avec'],
  pt: ['de', 'que', 'os', 'uma', 'para', 'com', 'não', 'mais'],
  tr: ['ve', 'bir', 'bu', 'için', 'ile', 'çok', 'daha', 'olan'],
  id: ['dan', 'yang', 'di', 'untuk', 'dengan', 'ini', 'pada', 'tidak'],
};

export function detectLanguage(text: string, fallback: LocaleCode): LocaleCode {
  const sample = text.slice(0, 2000);
  if (sample.trim().length === 0) return fallback;

  // 1) Definitive script detection.
  for (const [locale, range] of Object.entries(SCRIPT) as [LocaleCode, RegExp][]) {
    if (range.test(sample)) return locale;
  }

  // 2) Latin stopword scoring.
  const words = sample.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.length < 5) return fallback;
  const counts = new Map<string, number>(words.map((w) => [w, 0]));
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

  let best: { locale: LocaleCode; score: number } | null = null;
  for (const [locale, stops] of Object.entries(STOPWORDS) as [LocaleCode, string[]][]) {
    const score = stops.reduce((n, s) => n + (counts.get(s) ?? 0), 0);
    if (!best || score > best.score) best = { locale, score };
  }
  return best && best.score > 0 ? best.locale : fallback;
}
