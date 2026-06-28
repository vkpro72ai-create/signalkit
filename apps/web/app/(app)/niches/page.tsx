'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography } from '@signalkit/ui';
import type { ConfidenceLevel, RiskLevel } from '@signalkit/shared';
import {
  Card,
  PageHeader,
  Button,
  ScoreBadge,
  ConfidenceBadge,
  RiskBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  palette,
} from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { apiGet, apiPost, firstWorkspaceId } from '../../../lib/api';

interface NicheView {
  id: string;
  title: string;
  oneLiner: string;
  riskLevel: RiskLevel;
  scores: { totalScore: number; confidenceLevel: string }[];
}

export default function NicheDiscoveryPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_project'>('loading');
  const [ws, setWs] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [niches, setNiches] = useState<NicheView[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setState('loading');
    try {
      const workspaceId = await firstWorkspaceId();
      setWs(workspaceId);
      if (!workspaceId) return setState('no_project');
      const projects = await apiGet<{ id: string }[]>(`/workspaces/${workspaceId}/projects`);
      const projectId = projects[0]?.id ?? null;
      setPid(projectId);
      if (!projectId) return setState('no_project');
      setNiches(await apiGet<NicheView[]>(`/workspaces/${workspaceId}/projects/${projectId}/niches`));
      setState('ready');
    } catch {
      setState('error');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function discover() {
    if (!ws || !pid) return;
    setBusy(true);
    try {
      await apiPost(`/workspaces/${ws}/projects/${pid}/discover-niches`, {});
      setNiches(await apiGet<NicheView[]>(`/workspaces/${ws}/projects/${pid}/niches`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        title={t('nav.niches')}
        subtitle={t('pipeline.niches')}
        action={state === 'ready' ? <Button onClick={() => void discover()} disabled={busy}>Discover niches</Button> : undefined}
      />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'no_project' && <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />}

      {state === 'ready' && (niches.length === 0 ? (
        <EmptyState title="No niches yet" body="Add sources, then discover niches from your evidence." action={<Button variant="secondary" onClick={() => void discover()} disabled={busy}>Discover niches</Button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
          {niches.map((n) => {
            const s = n.scores[0];
            return (
              <Link key={n.id} href={`/niches/${n.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card>
                  <div style={{ fontWeight: typography.weight.semibold }}>{n.title}</div>
                  <div style={{ color: palette.subtle, fontSize: typography.size.sm, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>{n.oneLiner}</div>
                  <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                    {s ? <ScoreBadge score={s.totalScore} label={t('label.score')} /> : null}
                    {s ? <ConfidenceBadge level={s.confidenceLevel as ConfidenceLevel} label={t('label.confidence')} /> : null}
                    <RiskBadge level={n.riskLevel} label={t('label.risk')} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
