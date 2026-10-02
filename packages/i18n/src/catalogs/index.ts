import type { LocaleCode } from '@signalkit/shared';
import { en, type MessageKey } from './en.js';
import { ru } from './ru.js';
import { tr } from './tr.js';
import { de } from './de.js';
import { es } from './es.js';
import { fr } from './fr.js';
import { pt } from './pt.js';
import { ar } from './ar.js';
import { hi } from './hi.js';
import { id } from './id.js';

export type { MessageKey };

/** The full translation catalog, keyed by locale. `en` is the complete source. */
export const catalog: Record<LocaleCode, Partial<Record<MessageKey, string>>> = {
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
