'use client';

import { useEffect, useState } from 'react';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { SUPPORTED_LOCALES, type LocaleCode } from '@signalkit/i18n';
import { Button, Card, PageHeader, Badge, palette } from '../../../../components/ui';
import { useI18n } from '../../../../lib/i18n';
import { apiGet, apiPut, apiDelete, type CountryView } from '../../../../lib/api';

const LOCALE_LABEL: Record<LocaleCode, string> = {
  en: 'English', ru: 'Русский', tr: 'Türkçe', de: 'Deutsch', es: 'Español',
  fr: 'Français', pt: 'Português', ar: 'العربية', hi: 'हिन्दी', id: 'Bahasa Indonesia',
};

interface Me {
  user: { id: string };
  settings: {
    countryOfResidence: string | null;
    geoConsentStatus: string;
    detectedCountry: string | null;
    interfaceLocale?: string;
    defaultDocumentLanguage?: string;
  } | null;
}

function LocaleSelect({ value, onChange }: { value: LocaleCode; onChange: (l: LocaleCode) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as LocaleCode)}
      style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}`, fontSize: typography.size.sm, minWidth: 200 }}
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l} value={l}>{LOCALE_LABEL[l]}</option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg, padding: `${spacing.md}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
      <span style={{ fontSize: typography.size.sm, color: palette.ink }}>{label}</span>
      {children}
    </div>
  );
}

export default function LanguageRegionSettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const [outputLanguage, setOutputLanguage] = useState<LocaleCode>(locale);
  const [countries, setCountries] = useState<CountryView[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [residence, setResidence] = useState('');
  const [consent, setConsent] = useState('unknown');
  const [detected, setDetected] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const m = await apiGet<Me>('/me');
      setMe(m);
      setResidence(m.settings?.countryOfResidence ?? '');
      setConsent(m.settings?.geoConsentStatus ?? 'unknown');
      setDetected(m.settings?.detectedCountry ?? null);
      if (m.settings?.defaultDocumentLanguage) {
        setOutputLanguage(m.settings.defaultDocumentLanguage as LocaleCode);
      }
    } catch {
      /* not signed in / API down — page still renders interface-language control */
    }
  }

  useEffect(() => {
    apiGet<CountryView[]>('/geo/countries').then(setCountries).catch(() => setCountries([]));
    void refresh();
  }, []);

  async function saveLanguages() {
    if (!me) return;
    setSaving(true);
    try {
      await apiPut(`/users/${me.user.id}/settings`, {
        interfaceLocale: locale,
        defaultDocumentLanguage: outputLanguage,
      });
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  function changeInterfaceLocale(l: LocaleCode) {
    setLocale(l);
  }

  async function saveResidence() {
    if (!me) return;
    await apiPut(`/users/${me.user.id}/settings`, { countryOfResidence: residence || undefined });
    void refresh();
  }

  async function grantLocation() {
    // Privacy-clean: coarse country from headers, never coordinates.
    const det = await apiGet<{ country: string | null }>('/geo/detect').catch(() => ({ country: null }));
    await apiPut('/me/geo-consent', {
      status: 'granted',
      locationUsageMode: 'country_only',
      detectedCountry: det.country ?? undefined,
    });
    void refresh();
  }

  async function clearLocation() {
    await apiDelete('/me/location');
    void refresh();
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={t('settings.languageRegion')} subtitle={t('nav.settings')} />

      <Card>
        <Field label={t('settings.interfaceLanguage')}>
          <LocaleSelect value={locale} onChange={changeInterfaceLocale} />
        </Field>
        <Field label={t('settings.outputLanguage')}>
          <LocaleSelect value={outputLanguage} onChange={setOutputLanguage} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md }}>
          {savedAt && <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>Saved {savedAt.toLocaleTimeString()}</span>}
          <Button onClick={() => void saveLanguages()} disabled={saving || !me}>{saving ? 'Saving…' : t('action.save')}</Button>
        </div>
        <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: spacing.sm, marginBottom: 0 }}>
          Interface language applies immediately. Output language is used as the default for newly generated Venture Theses and Product Packs — each project can still target a different market language when created.
        </p>
      </Card>

      <h2 style={{ fontSize: typography.size.lg, marginTop: spacing['2xl'] }}>{t('settings.region')}</h2>
      <Card>
        <Field label={t('settings.countryOfResidence')}>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <select
              value={residence}
              onChange={(e) => setResidence(e.target.value)}
              style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}`, fontSize: typography.size.sm }}
            >
              <option value="">—</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.names['en'] ?? c.code}</option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => void saveResidence()}>{t('action.save')}</Button>
          </div>
        </Field>

        <div style={{ paddingTop: spacing.md }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: typography.size.sm }}>Current location permission</span>
            <Badge variant={consent === 'granted' ? 'success' : 'muted'}>{consent}</Badge>
          </div>
          <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: spacing.xs }}>
            We use location only with consent and store at most your country{detected ? ` (currently ${detected})` : ''}. Never precise coordinates.
          </p>
          <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button variant="secondary" onClick={() => void grantLocation()}>Enable (country-level)</Button>
            <Button variant="ghost" onClick={() => void clearLocation()}>Clear location data</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
