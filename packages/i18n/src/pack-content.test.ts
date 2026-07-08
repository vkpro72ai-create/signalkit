import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '@signalkit/shared';
import { packContentCatalog, createPackContentTranslator } from './catalogs/pack-content/index.js';
import { en } from './catalogs/pack-content/en.js';

describe('pack-content catalog', () => {
  const enKeys = Object.keys(en);

  it('every non-English locale translates every English key (no gaps from typoed keys)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'en') continue;
      const missing = enKeys.filter((key) => !(key in (packContentCatalog[locale] ?? {})));
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('every non-English locale has no stray keys beyond the English source', () => {
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'en') continue;
      const extra = Object.keys(packContentCatalog[locale] ?? {}).filter((key) => !(key in en));
      expect(extra, `${locale} has unknown keys: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('substitutes {placeholders} and falls back to English for unknown locales/keys', () => {
    const t = createPackContentTranslator('ru');
    expect(t('common.step_label', { n: 2, text: 'Оформить заказ' })).toBe('Шаг 2: Оформить заказ');
    const en_ = createPackContentTranslator('en');
    expect(en_('heading.why_now')).toBe('Why now');
  });

  it('the acceptance-criteria template embeds the same gwt tokens used for gate matching', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = createPackContentTranslator(locale);
      const given = t('gwt.given');
      const when = t('gwt.when');
      const then = t('gwt.then');
      const sentence = t('common.acceptance_gwt', { given, when, then, feature: 'X' });
      expect(sentence).toContain(given);
      expect(sentence).toContain(when);
      expect(sentence).toContain(then);
    }
  });
});
