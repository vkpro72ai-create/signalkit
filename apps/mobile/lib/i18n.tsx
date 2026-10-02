import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createTranslator,
  isRtl,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type LocaleCode,
  type MessageKey,
  type Translator,
} from '@signalkit/i18n';

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: Translator;
  isRtl: boolean;
  locales: readonly LocaleCode[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<LocaleCode>(DEFAULT_LOCALE);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: createTranslator(locale),
      isRtl: isRtl(locale),
      locales: SUPPORTED_LOCALES,
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

export function useT(): (key: MessageKey) => string {
  return useI18n().t;
}
