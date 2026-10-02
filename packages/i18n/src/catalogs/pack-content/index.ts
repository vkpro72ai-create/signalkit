import type { LocaleCode } from '@signalkit/shared';
import { en, type PackContentKey } from './en.js';
import { ru } from './ru.js';
import { tr } from './tr.js';
import { de } from './de.js';
import { es } from './es.js';
import { fr } from './fr.js';
import { pt } from './pt.js';
import { ar } from './ar.js';
import { hi } from './hi.js';
import { id } from './id.js';

export type { PackContentKey };

/** Content catalog, keyed by locale. `en` is the complete source; others are partial with English fallback. */
export const packContentCatalog: Record<LocaleCode, Partial<Record<PackContentKey, string>>> = {
  en,
  ru,
  tr,
  de,
  es,
  fr,
  pt,
  ar,
  hi,
  id,
};

/** Substitute `{name}` tokens in `template` with `vars[name]`, leaving unknown tokens untouched. */
function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** A translator bound to a locale for pack/export content strings, with English fallback. */
export type PackContentTranslator = (key: PackContentKey, vars?: Record<string, string | number>) => string;

/**
 * Create a translator for AI-generated document content (headings, boilerplate)
 * — distinct from the UI translator in ../../index.ts, since this catalog has a
 * different owner and lifecycle (product-pack authors, not UI copywriters).
 */
export function createPackContentTranslator(locale: LocaleCode): PackContentTranslator {
  return (key, vars) => {
    const template = packContentCatalog[locale]?.[key] ?? packContentCatalog.en[key] ?? key;
    return format(template, vars);
  };
}
