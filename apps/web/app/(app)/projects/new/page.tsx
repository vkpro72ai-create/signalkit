'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { MARKET_SCOPES, type MarketScope } from '@signalkit/shared';
import { Button, Card, PageHeader, palette } from '../../../../components/ui';
import { MarketSelector } from '../../../../components/market-selector';
import { useT } from '../../../../lib/i18n';
import { apiPost, firstWorkspaceId } from '../../../../lib/api';

const SCOPE_LABELS: Record<MarketScope, string> = {
  current_location: 'Use my current location',
  country_of_residence: 'Use my country of residence',
  manual_country: 'Choose another country',
  manual_region: 'Choose a region',
  multi_country: 'Compare several markets',
  global: 'Global opportunity search',
};

export default function NewProjectPage() {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [scope, setScope] = useState<MarketScope>('global');
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = {
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `${border.hairline}px solid ${palette.line}`,
    fontSize: typography.size.sm,
    width: '100%',
  } as const;
  const sectionTitle = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.subtle } as const;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const workspaceId = await firstWorkspaceId();
      if (!workspaceId) throw new Error('no_workspace');
      const project = await apiPost<{ id: string }>(`/workspaces/${workspaceId}/projects`, {
        name,
        goal,
        marketScope: scope,
        targetCountry: country || undefined,
        targetCountries: scope === 'multi_country' ? countries : undefined,
      });
      router.push(`/niches?project=${project.id}`);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error';
      // The geo resolver returns location_consent_required / residence_required etc.
      setError(code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={t('action.newProject')} subtitle={t('app.tagline')} />
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <Card>
          <div style={sectionTitle}>1 · {t('pipeline.project')}</div>
          <input style={{ ...field, marginTop: spacing.sm }} placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
          <textarea
            style={{ ...field, marginTop: spacing.sm, minHeight: 64 }}
            placeholder="Project goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </Card>

        <Card>
          <div style={sectionTitle}>2 · {t('pipeline.market')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginTop: spacing.sm }}>
            {MARKET_SCOPES.map((s) => {
              const active = s === scope;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  style={{
                    textAlign: 'start',
                    padding: spacing.md,
                    borderRadius: radius.md,
                    border: `${border.hairline}px solid ${active ? palette.ink : palette.line}`,
                    background: active ? palette.canvas : palette.surface,
                    color: palette.ink,
                    fontSize: typography.size.sm,
                    cursor: 'pointer',
                  }}
                >
                  {SCOPE_LABELS[s]}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: spacing.md }}>
            <MarketSelector
              scope={scope}
              country={country}
              onCountry={setCountry}
              countries={countries}
              onCountries={setCountries}
            />
          </div>
        </Card>

        {error && (
          <div style={{ color: '#6A1B1B', fontSize: typography.size.sm }}>
            {error === 'location_consent_required'
              ? 'Location consent is required for current-location search. Enable it in Language & Region, or pick another market.'
              : error === 'residence_required'
                ? 'Set your country of residence in Language & Region first.'
                : t('state.error.body')}
          </div>
        )}

        <div style={{ display: 'flex', gap: spacing.sm }}>
          <Button type="submit" disabled={busy}>{t('action.create')}</Button>
          <Button variant="ghost" onClick={() => router.push('/projects')}>{t('action.cancel')}</Button>
        </div>
      </form>
    </div>
  );
}
