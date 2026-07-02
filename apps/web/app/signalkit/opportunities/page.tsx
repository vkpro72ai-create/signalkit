'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography } from '@signalkit/ui';
import type { ConfidenceLevel, RiskLevel } from '@signalkit/shared';
import {
  Card,
  PageHeader,
  Badge,
  Button,
  ScoreBadge,
  ConfidenceBadge,
  RiskBadge,
  EvidenceBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  palette,
} from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import {
  firstWorkspaceId,
  workspaceApi,
  opportunityApi,
  type AiRunMetadata,
  type DiscoverOpportunitiesResult,
  type GeneratedOpportunityCard,
} from '../../../lib/api';

export default function OpportunitiesPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_project'>('loading');
  const [ws, setWs] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<GeneratedOpportunityCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiRunMetadata | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const workspaceId = await firstWorkspaceId();
      setWs(workspaceId);
      if (!workspaceId) return setState('no_project');
      const projects = await workspaceApi.listProjects(workspaceId);
      const projectId = projects[0]?.id ?? null;
      setPid(projectId);
      if (!projectId) return setState('no_project');
      setOpportunities(await opportunityApi.listAll(workspaceId));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function discover() {
    if (!ws || !pid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await opportunityApi.discover(ws, pid, {
        market: 'United States',
        verticals: ['AI', 'B2B SaaS'],
        language: 'en',
        mode: 'find_opportunities',
      });
      applyDiscoveryResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discovery failed.');
    } finally {
      setBusy(false);
    }
  }

  function applyDiscoveryResult(result: DiscoverOpportunitiesResult) {
    setLastRun(result.generation);
    if (result.opportunities.length > 0) {
      setOpportunities(result.opportunities);
    }
  }

  const sorted = [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore);

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        title={t('nav.opportunities')}
        subtitle={`${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} · evidence-backed, no fabricated market sizing`}
        action={state === 'ready' ? <Button onClick={() => void discover()} disabled={busy}>{busy ? 'Scanning…' : 'Find opportunities'}</Button> : undefined}
      />

      {error && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>Discovery error</div>
          <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{error}</div>
        </Card>
      )}

      {lastRun && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>AI Run Metadata</div>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Badge variant="muted">{lastRun.durationMs} ms</Badge>
            <ConfidenceBadge level={lastRun.status === 'success' ? 'high' : 'low'} label={lastRun.status} />
            <EvidenceBadge count={lastRun.inputTokens ?? 0} label="input tokens" />
            <EvidenceBadge count={lastRun.outputTokens ?? 0} label="output tokens" />
          </div>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: spacing.sm }}>
            {lastRun.provider} / {lastRun.model} · {lastRun.task} · {new Date(lastRun.generatedAt).toLocaleString()}
            {lastRun.usageLogId ? ` · usage ${lastRun.usageLogId}` : ''}
          </div>
        </Card>
      )}

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'no_project' && (
        <EmptyState
          title="No project yet"
          body="Go to the home dashboard to start your Opportunity Radar."
          action={<Link href="/signalkit" style={{ textDecoration: 'none' }}><Button variant="secondary">Go to dashboard</Button></Link>}
        />
      )}

      {state === 'ready' && (sorted.length === 0 ? (
        <EmptyState
          title="Find opportunities"
          body="SignalKit scans real signals and evidence for product opportunities worth building. No hype, no fake TAM."
          action={<Button variant="secondary" onClick={() => void discover()} disabled={busy}>{busy ? 'Scanning…' : 'Find opportunities'}</Button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
          {sorted.map((n) => (
            <Link key={n.id} href={`/signalkit/opportunities/${n.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card>
                <div style={{ fontWeight: typography.weight.semibold }}>{n.name}</div>
                <div style={{ color: palette.subtle, fontSize: typography.size.sm, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>{n.oneLiner}</div>
                {n.targetMarket && (
                  <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginBottom: spacing.sm }}>
                    Target market: {n.targetMarket}
                  </div>
                )}
                {n.assumptions && n.assumptions.length > 0 && (
                  <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginBottom: spacing.sm }}>
                    Assumption: {n.assumptions[0]}
                  </div>
                )}
                <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <ScoreBadge score={n.opportunityScore} label={t('label.score')} />
                  <ConfidenceBadge level={n.confidence.level as ConfidenceLevel} label={t('label.confidence')} />
                  {n.ventureScaleScore != null && <ScoreBadge score={n.ventureScaleScore} label="Venture scale" />}
                  {n.buildReadinessScore != null && <ScoreBadge score={n.buildReadinessScore} label="Build readiness" />}
                  <EvidenceBadge count={n.evidenceCount} label={t('label.evidence')} />
                  <RiskBadge level={n.riskLevel as RiskLevel} label={t('label.risk')} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
