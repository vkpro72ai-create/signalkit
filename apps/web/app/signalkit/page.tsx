'use client';

/**
 * SignalKit product home — the Opportunity Radar dashboard.
 * Self-starting: creates a workspace/project in one click, never a dead end.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography } from '@signalkit/ui';
import { Card, Button, LoadingState, ErrorState, Table, palette } from '../../components/ui';
import { StatTrendCard, HeroOpportunityCard, SidePanel, levelLabel, buildOpportunityColumns } from '../../components/dashboard';
import { useT } from '../../lib/i18n';
import {
  apiGet,
  firstWorkspaceId,
  workspaceApi,
  opportunityApi,
  type ProjectView,
  type OpportunityCard as OpportunityCardData,
  type RadarSummary,
  type MeWorkspaces,
} from '../../lib/api';

type ViewState = 'loading' | 'error' | 'ready';

export default function SignalKitHome() {
  const t = useT();
  const [state, setState] = useState<ViewState>('loading');
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [ws, setWs] = useState<{ id: string; name: string } | null>(null);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityCardData[]>([]);
  const [summary, setSummary] = useState<RadarSummary | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const me = await apiGet<MeWorkspaces>('/me');
      setDisplayName(me.user.displayName ?? me.user.email);
      const membership = me.memberships[0];
      if (!membership) {
        setWs(null);
        setProject(null);
        setState('ready');
        return;
      }
      setWs({ id: membership.workspace.id, name: membership.workspace.name });
      const projects = await workspaceApi.listProjects(membership.workspace.id);
      const p = projects[0] ?? null;
      setProject(p);
      if (p) {
        // Same call/shape the Opportunities page uses (scoped to this project) —
        // previously Home and Opportunities used two different endpoints for
        // what was meant to be the same "top opportunities" concept.
        const [opps, radarSummary] = await Promise.all([
          opportunityApi.listAll(membership.workspace.id, p.id),
          opportunityApi.radarSummary(membership.workspace.id, p.id),
        ]);
        setOpportunities(opps);
        setSummary(radarSummary);
      } else {
        setOpportunities([]);
        setSummary(null);
      }
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createWorkspace() {
    setBusy(true);
    try {
      await workspaceApi.create('My Product Lab');
      await createProject((await firstWorkspaceId()) ?? '');
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function createProject(workspaceId: string) {
    if (!workspaceId) return;
    await workspaceApi.createProject(
      workspaceId,
      'Opportunity Radar',
      'Continuously scan the market for evidence-backed product opportunities.',
    );
  }

  async function startRadar() {
    if (!ws) return;
    setBusy(true);
    try {
      await createProject(ws.id);
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function findOpportunities() {
    if (!ws || !project) return;
    setBusy(true);
    try {
      await opportunityApi.discover(ws.id, project.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <LoadingState label={t('state.loading')} />;
  if (state === 'error') {
    return <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />;
  }

  const ranked = [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore);
  const top = ranked[0] ?? null;
  const rest = ranked.slice(0, 5);
  const columns = buildOpportunityColumns(t, (row) => ranked.indexOf(row) + 1);

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={{ marginBottom: spacing.xl }}>
        <p style={{ color: palette.subtle, fontSize: typography.size.sm, margin: 0 }}>
          {displayName ? `${greeting(t)}, ${displayName}` : greeting(t)}
        </p>
        <h1 style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold, margin: `${spacing.xs}px 0 0` }}>
          {t('radar.title')}
        </h1>
      </div>

      {/* No workspace yet — self-starting, single click */}
      {!ws && (
        <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
          <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>
            {t('radar.onboarding.createLab.title')}
          </div>
          <p style={{ color: palette.subtle, maxWidth: 460, margin: `0 auto ${spacing.lg}px` }}>
            {t('radar.onboarding.createLab.body')}
          </p>
          <Button onClick={() => void createWorkspace()} disabled={busy}>
            {busy ? t('radar.onboarding.createLab.busy') : t('radar.onboarding.createLab.cta')}
          </Button>
        </Card>
      )}

      {/* Workspace exists, no project — one click to start the radar */}
      {ws && !project && (
        <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
          <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>
            {t('radar.onboarding.startRadar.title')}
          </div>
          <p style={{ color: palette.subtle, maxWidth: 460, margin: `0 auto ${spacing.lg}px` }}>
            {ws.name} — {t('radar.onboarding.startRadar.body')}
          </p>
          <Button onClick={() => void startRadar()} disabled={busy}>
            {busy ? t('radar.onboarding.startRadar.busy') : t('radar.onboarding.startRadar.cta')}
          </Button>
        </Card>
      )}

      {/* Full dashboard */}
      {ws && project && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.lg, marginBottom: spacing.xl }}>
            <StatTrendCard
              label={t('radar.stat.opportunitiesFound')}
              value={String(summary?.opportunitiesFound.total ?? opportunities.length)}
              deltaPct={summary?.opportunitiesFound.deltaPct ?? null}
              deltaSuffix={t('radar.stat.deltaWeek')}
            />
            <StatTrendCard
              label={t('radar.stat.avgConfidence')}
              value={summary ? `${Math.round(summary.avgConfidence.value * 100)}%` : '—'}
              deltaPct={summary?.avgConfidence.deltaPct ?? null}
              deltaSuffix={t('radar.stat.deltaWeek')}
            />
            <StatTrendCard
              label={t('radar.stat.investorInterest')}
              value={summary ? levelLabel(summary.investorInterest.level, t) : '—'}
              deltaPct={summary?.investorInterest.deltaPct ?? null}
              deltaSuffix={t('radar.stat.deltaWeek')}
            />
            <StatTrendCard
              label={t('radar.stat.aiEngine')}
              value={summary?.aiEngine.displayName ?? t('aiEngine.defaultName')}
              deltaPct={null}
              deltaSuffix={summary?.aiEngine.active ? t('radar.stat.aiEngineActive') : t('radar.stat.aiEngineIdle')}
            />
          </div>

          {opportunities.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
              <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>
                {t('radar.empty.title')}
              </div>
              <p style={{ color: palette.subtle, maxWidth: 460, margin: `0 auto ${spacing.lg}px` }}>{t('radar.empty.body')}</p>
              <Button onClick={() => void findOpportunities()} disabled={busy}>
                {busy ? t('radar.empty.busy') : t('radar.empty.cta')}
              </Button>
            </Card>
          ) : (
            <div>
              {top ? (
                <div style={{ marginBottom: spacing.lg }}>
                  <HeroOpportunityCard
                    eyebrow={t('radar.hero.eyebrow')}
                    title={top.name}
                    description={top.oneLiner}
                    tags={[top.targetMarket, `${t('radar.hero.riskTag')}: ${levelLabel(top.riskLevel, t)}`].filter((tag): tag is string => Boolean(tag))}
                    score={top.opportunityScore}
                    whyNowLabel={t('radar.table.whyNow')}
                    whyNow={top.whyNow || '—'}
                    cta={t('radar.hero.cta')}
                    onCtaClick={() => {
                      window.location.href = `/signalkit/opportunities/${top.id}`;
                    }}
                    aside={
                      <>
                        <SidePanel title={t('radar.side.nextAction.title')}>
                          <div style={{ fontWeight: typography.weight.medium, marginBottom: spacing.xs }}>
                            {t('radar.side.nextAction.headline')}
                          </div>
                          <p style={{ color: palette.subtle, fontSize: typography.size.sm, marginBottom: spacing.md }}>
                            {t('radar.side.nextAction.body')}
                          </p>
                          <Link href={`/signalkit/opportunities/${top.id}`} style={{ textDecoration: 'none' }}>
                            <Button>{t('radar.side.nextAction.cta')}</Button>
                          </Link>
                        </SidePanel>

                        <SidePanel title={t('radar.side.investorSignal.title')}>
                          {summary ? (
                            <>
                              <div style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: 2 }}>
                                {levelLabel(summary.investorInterest.level, t)}
                              </div>
                              {typeof summary.investorInterest.deltaPct === 'number' ? (
                                <div style={{ fontSize: typography.size.xs, color: summary.investorInterest.deltaPct >= 0 ? '#13502B' : '#6A1B1B', marginBottom: spacing.sm }}>
                                  {summary.investorInterest.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(summary.investorInterest.deltaPct).toFixed(0)}% {t('radar.stat.deltaWeek')}
                                </div>
                              ) : (
                                <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginBottom: spacing.sm }}>{t('radar.side.investorSignal.noHistory')}</div>
                              )}
                              <p style={{ color: palette.subtle, fontSize: typography.size.sm, margin: 0 }}>{t('radar.side.investorSignal.body')}</p>
                            </>
                          ) : null}
                        </SidePanel>
                      </>
                    }
                  />
                </div>
              ) : null}

              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>{t('radar.table.title')}</h2>
                  <div style={{ display: 'flex', gap: spacing.sm }}>
                    <Button variant="ghost" onClick={() => void findOpportunities()} disabled={busy}>
                      {busy ? t('radar.empty.busy') : t('radar.table.rescan')}
                    </Button>
                    <Link href="/signalkit/opportunities" style={{ textDecoration: 'none' }}>
                      <Button variant="secondary">{t('radar.table.viewAll')}</Button>
                    </Link>
                  </div>
                </div>
                <Table columns={columns} rows={rest} />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function greeting(t: ReturnType<typeof useT>): string {
  const h = new Date().getHours();
  if (h < 12) return t('radar.greeting.morning');
  if (h < 18) return t('radar.greeting.afternoon');
  return t('radar.greeting.evening');
}
