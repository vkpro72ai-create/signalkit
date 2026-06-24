/**
 * @signalkit/i18n — locale detection, fallback, formatting and translation
 * primitives. Full translation catalogs land in Session 3; this establishes the
 * single, non-duplicated i18n contract used by web and mobile.
 */
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  RTL_LOCALES,
  type LocaleCode,
} from '@signalkit/shared';

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, RTL_LOCALES };
export type { LocaleCode };

/** A flat translation dictionary for one locale. */
export type Messages = Record<string, string>;

/** A catalog maps each locale to its message dictionary. */
export type Catalog = Partial<Record<LocaleCode, Messages>>;

/** Type guard: is the given string a supported locale? */
export function isSupportedLocale(value: string): value is LocaleCode {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Does this locale render right-to-left? */
export function isRtl(locale: LocaleCode): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

/**
 * Resolve the best supported locale from a prioritized list of candidates
 * (e.g. user setting, Accept-Language, device locale), falling back to default.
 */
export function resolveLocale(
  candidates: readonly (string | null | undefined)[],
  fallback: LocaleCode = DEFAULT_LOCALE,
): LocaleCode {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const base = candidate.split('-')[0]?.toLowerCase();
    if (base && isSupportedLocale(base)) return base;
  }
  return fallback;
}

/**
 * Look up a message with locale fallback chain. Returns the key itself if no
 * translation exists in any locale (never throws, never silently shows blank).
 */
export function translate(
  catalog: Catalog,
  locale: LocaleCode,
  key: string,
  fallback: LocaleCode = DEFAULT_LOCALE,
): string {
  return catalog[locale]?.[key] ?? catalog[fallback]?.[key] ?? key;
}

/** Locale-aware number formatting. */
export function formatNumber(
  locale: LocaleCode,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Locale-aware currency formatting. */
export function formatCurrency(locale: LocaleCode, value: number, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/** Locale-aware date/time formatting. */
export function formatDate(
  locale: LocaleCode,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, options).format(date);
}
