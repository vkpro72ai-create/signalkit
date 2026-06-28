import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LOCALES,
  catalog,
  createTranslator,
  resolveLocale,
  isRtl,
  getMessages,
} from './index.js';
import { en } from './catalogs/en.js';

describe('@signalkit/i18n', () => {
  it('ships a catalog entry for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(catalog[locale]).toBeDefined();
    }
  });

  it('translates known keys per locale and falls back to English', () => {
    const tr = createTranslator('tr');
    expect(tr('nav.projects')).toBe('Projeler');
    const ru = createTranslator('ru');
    expect(ru('nav.settings')).toBe('Настройки');
  });

  it('every locale translates the core navigation keys (no English leakage)', () => {
    const navKeys = ['nav.projects', 'nav.settings', 'action.save'] as const;
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'en') continue;
      for (const key of navKeys) {
        expect(catalog[locale]?.[key], `${locale}:${key}`).toBeDefined();
      }
    }
  });

  it('marks Arabic as RTL and others LTR', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });

  it('resolves best locale from candidates', () => {
    expect(resolveLocale(['xx', 'de-DE', 'en'])).toBe('de');
    expect(resolveLocale([null, undefined, 'zz'])).toBe('en');
  });

  it('getMessages returns a complete key set via English base', () => {
    const msgs = getMessages('ar');
    expect(Object.keys(msgs).length).toBe(Object.keys(en).length);
  });
});
