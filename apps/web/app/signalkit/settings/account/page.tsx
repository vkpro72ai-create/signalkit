'use client';

import { useEffect, useState } from 'react';
import { spacing, typography, border } from '@signalkit/ui';
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader, palette } from '../../../../components/ui';
import { useT } from '../../../../lib/i18n';
import { accountApi, apiGet, workspaceApi, type EntitlementsView, type MeWorkspaces } from '../../../../lib/api';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  founder_pro: 'Founder Pro',
  agency: 'Agency',
  studio: 'Studio',
  enterprise: 'Enterprise',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.md}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
      <span style={{ fontSize: typography.size.sm, color: palette.subtle }}>{label}</span>
      <span style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium }}>{value}</span>
    </div>
  );
}

const FEATURE_LABELS: Array<{ key: keyof EntitlementsView; label: string }> = [
  { key: 'canDiscovery', label: 'Opportunity discovery' },
  { key: 'canVentureThesis', label: 'Venture Thesis' },
  { key: 'canFullPack', label: 'Full Product Pack depth' },
  { key: 'canBuildBlueprint', label: 'Build Blueprint' },
  { key: 'canMultiMarket', label: 'Multi-market comparison' },
  { key: 'canAdvancedBlueprintDetails', label: 'Advanced blueprint details' },
  { key: 'canExportPDF', label: 'PDF export' },
  { key: 'canExportBundle', label: 'AI-agent bundle export' },
  { key: 'canExportMarkdown', label: 'Markdown export' },
  { key: 'canCreateWorkspace', label: 'Create additional workspaces' },
  { key: 'canCreateProject', label: 'Create additional projects' },
];

export default function AccountSettingsPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [me, setMe] = useState<MeWorkspaces | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsView | null>(null);
  const [aiEngineName, setAiEngineName] = useState('');
  const [aiEngineSaving, setAiEngineSaving] = useState(false);
  const [aiEngineSaved, setAiEngineSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, ent] = await Promise.all([
          apiGet<MeWorkspaces>('/me'),
          accountApi.entitlements(),
        ]);
        setMe(meRes);
        setEntitlements(ent);
        const workspaceId = meRes.memberships[0]?.workspace.id;
        if (workspaceId) {
          const settings = await workspaceApi.getSettings(workspaceId);
          setAiEngineName(settings.aiEngineName ?? '');
        }
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, []);

  async function saveAiEngineName() {
    const workspaceId = me?.memberships[0]?.workspace.id;
    if (!workspaceId) return;
    setAiEngineSaving(true);
    setAiEngineSaved(false);
    try {
      await workspaceApi.updateSettings(workspaceId, { aiEngineName: aiEngineName.trim() || null });
      setAiEngineSaved(true);
    } finally {
      setAiEngineSaving(false);
    }
  }

  if (state === 'loading') return <LoadingState label={t('state.loading')} />;
  if (state === 'error' || !me) return <ErrorState title={t('state.error.title')} body={t('state.error.body')} />;

  const membership = me.memberships[0];
  const plan = entitlements?.plan ?? membership?.billingPlan ?? 'free';
  const isTester = plan !== 'free';

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={t('nav.account')} subtitle={me.user.email} />

      <Card style={{ marginBottom: spacing.xl }}>
        <Row label="Email" value={me.user.email} />
        <Row label="Display name" value={me.user.displayName ?? '—'} />
        <Row label="Workspace" value={membership?.workspace.name ?? '—'} />
        <Row label="Role" value={<span style={{ textTransform: 'capitalize' }}>{membership?.role ?? '—'}</span>} />
        <Row
          label="Plan"
          value={
            <span style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
              {PLAN_LABEL[plan] ?? plan}
              {isTester && <Badge variant="success">Internal tester</Badge>}
            </span>
          }
        />
      </Card>

      <h2 style={{ fontSize: typography.size.lg, marginBottom: spacing.sm }}>{t('settings.aiEngine.title')}</h2>
      <Card style={{ marginBottom: spacing.xl }}>
        <p style={{ color: palette.subtle, fontSize: typography.size.sm, marginTop: 0, marginBottom: spacing.sm }}>
          {t('settings.aiEngine.description')}
        </p>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={aiEngineName}
            onChange={(event) => {
              setAiEngineName(event.target.value);
              setAiEngineSaved(false);
            }}
            placeholder={t('settings.aiEngine.placeholder')}
            style={{ flex: '1 1 240px', border: `${border.hairline}px solid ${palette.line}`, borderRadius: 6, padding: '8px 10px', fontSize: typography.size.sm }}
          />
          <Button variant="secondary" onClick={() => void saveAiEngineName()} disabled={aiEngineSaving}>
            {aiEngineSaving ? t('action.saving') : t('action.save')}
          </Button>
          {aiEngineSaved ? <Badge variant="success">{t('settings.aiEngine.saved')}</Badge> : null}
        </div>
      </Card>

      <h2 style={{ fontSize: typography.size.lg, marginBottom: spacing.sm }}>Entitlements</h2>
      <Card>
        {FEATURE_LABELS.map((f, i) => (
          <div
            key={f.key}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: `${spacing.sm}px 0`,
              borderBottom: i < FEATURE_LABELS.length - 1 ? `${border.hairline}px solid ${palette.line}` : 'none',
            }}
          >
            <span style={{ fontSize: typography.size.sm }}>{f.label}</span>
            <Badge variant={entitlements?.[f.key] ? 'success' : 'muted'}>{entitlements?.[f.key] ? 'Enabled' : 'Locked'}</Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}
