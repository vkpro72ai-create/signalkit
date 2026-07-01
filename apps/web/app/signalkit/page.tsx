'use client';

/**
 * SignalKit product home — Opportunity Radar dashboard.
 * Self-starting: creates a workspace/project in one click, never a dead end.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, border } from '@signalkit/ui';
import { Card, Button, Badge, LoadingState, ErrorState, palette } from '../../components/ui';
import { useT } from '../../lib/i18n';
import {
  apiGet,
  firstWorkspaceId,
  workspaceApi,
  opportunityApi,
  type ProjectView,
  type NicheSummary,
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
  const [niches, setNiches] = useState<NicheSummary[]>([]);

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
        const n = await opportunityApi.list(membership.workspace.id, p.id);
        setNiches(n);
      } else {
        setNiches([]);
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
      const n = await opportunityApi.list(ws.id, project.id);
      setNiches(n);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <LoadingState label={t('state.loading')} />;
  if (state === 'error') {
    return <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />;
  }

  const topNiches = [...niches].sort((a, b) => (b.scores[0]?.totalScore ?? 0) - (a.scores[0]?.totalScore ?? 0)).slice(0, 5);

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: spacing.xl }}>
        <p style={{ color: palette.subtle, fontSize: typography.size.sm, margin: 0 }}>
          {displayName ? `${greeting()}, ${displayName}` : greeting()}
        </p>
        <h1 style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold, margin: `${spacing.xs}px 0 0` }}>
          Opportunity Radar
        </h1>
      </div>

      {/* No workspace yet — self-starting, single click */}
      {!ws && (
        <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
          <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>
            Create your product lab
          </div>
          <p style={{ color: palette.subtle, maxWidth: 460, margin: `0 auto ${spacing.lg}px` }}>
            A private workspace for evidence-backed opportunity discovery, Venture Theses and build-ready Product Packs.
          </p>
          <Button onClick={() => void createWorkspace()} disabled={busy}>
            {busy ? 'Setting up…' : 'Create your product lab'}
          </Button>
        </Card>
      )}

      {/* Workspace exists, no project — one click to start the radar */}
      {ws && !project && (
        <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
          <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>
            Start your Opportunity Radar
          </div>
          <p style={{ color: palette.subtle, maxWidth: 460, margin: `0 auto ${spacing.lg}px` }}>
            {ws.name} is ready. Start a radar to begin scanning markets for opportunities worth building.
          </p>
          <Button onClick={() => void startRadar()} disabled={busy}>
            {busy ? 'Starting…' : 'Start Opportunity Radar'}
          </Button>
        </Card>
      )}

      {/* Full dashboard */}
      {ws && project && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.lg, marginBottom: spacing.xl }}>
            <StatCard label="Workspace" value={ws.name} />
            <StatCard label="Project" value={project.name} />
            <StatCard label="Opportunities found" value={String(niches.length)} />
          </div>

          {niches.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
              <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>
                Find your first opportunities
              </div>
              <p style={{ color: palette.subtle, maxWidth: 460, margin: `0 auto ${spacing.lg}px` }}>
                SignalKit scans real signals and evidence — no fabricated market sizing, no hype.
              </p>
              <Button onClick={() => void findOpportunities()} disabled={busy}>
                {busy ? 'Scanning…' : 'Find opportunities'}
              </Button>
            </Card>
          ) : (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>Top opportunities</h2>
                <div style={{ display: 'flex', gap: spacing.sm }}>
                  <Button variant="ghost" onClick={() => void findOpportunities()} disabled={busy}>
                    {busy ? 'Scanning…' : 'Rescan'}
                  </Button>
                  <Link href="/signalkit/opportunities" style={{ textDecoration: 'none' }}>
                    <Button variant="secondary">View all</Button>
                  </Link>
                </div>
              </div>
              {topNiches.map((n) => {
                const s = n.scores[0];
                return (
                  <Link key={n.id} href={`/signalkit/opportunities/${n.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.sm}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                      <div>
                        <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm }}>{n.title}</div>
                        <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 2 }}>{n.oneLiner}</div>
                      </div>
                      {s ? <Badge variant="confidence">{Math.round(s.totalScore)}</Badge> : null}
                    </div>
                  </Link>
                );
              })}
            </Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg, marginTop: spacing.lg }}>
            <QuickLink href="/signalkit/packs" title="Product Packs" body="Build-ready document collections generated from your opportunities." />
            <QuickLink href="/signalkit/sources" title="Sources & Evidence" body="The evidence graph behind every score and thesis." />
          </div>
        </>
      )}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </Card>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href as '/'} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card>
        <div style={{ fontWeight: typography.weight.semibold, marginBottom: 4 }}>{title}</div>
        <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{body}</div>
        <div style={{ marginTop: spacing.sm, fontSize: typography.size.xs, color: palette.ink, fontWeight: typography.weight.medium }}>
          Open →
        </div>
      </Card>
    </Link>
  );
}
