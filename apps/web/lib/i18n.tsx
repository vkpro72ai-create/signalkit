'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createTranslator,
  isRtl,
  isSupportedLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type LocaleCode,
  type MessageKey,
  type Translator,
} from '@signalkit/i18n';

const LOCALE_COOKIE = 'signalkit_locale';

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: Translator;
  dir: 'ltr' | 'rtl';
  locales: readonly LocaleCode[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: LocaleCode;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<LocaleCode>(initialLocale);

  // Hydrate from cookie on first mount (covers static-export / GitHub Pages builds
  // where server-side cookies() is not available and the HTML defaults to 'en').
  useEffect(() => {
    const cookieLocale = readLocaleFromCookie(
      typeof document !== 'undefined' ? document.cookie : undefined,
    );
    if (cookieLocale !== locale) {
      setLocaleState(cookieLocale);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next);
    if (typeof document !== 'undefined') {
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      document.documentElement.lang = next;
      document.documentElement.dir = isRtl(next) ? 'rtl' : 'ltr';
    }
  }, []);

  // Keep <html dir/lang> in sync on mount and locale change.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: createTranslator(locale),
      dir: isRtl(locale) ? 'rtl' : 'ltr',
      locales: SUPPORTED_LOCALES,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

/** Convenience hook returning just the translator. */
export function useT(): (key: MessageKey) => string {
  return useI18n().t;
}

/** Read the persisted locale from a cookie string (server or client). */
export function readLocaleFromCookie(cookieHeader: string | undefined): LocaleCode {
  const match = cookieHeader?.match(new RegExp(`${LOCALE_COOKIE}=([a-z-]+)`));
  const value = match?.[1];
  return value && isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
