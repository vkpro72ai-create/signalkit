'use client';

import { useEffect, useState } from 'react';
import { spacing, typography, radius, border } from '@signalkit/ui';
import {
  Card,
  PageHeader,
  Badge,
  Button,
  Table,
  EmptyState,
  LoadingState,
  ErrorState,
  palette,
} from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { apiGet, apiPost, firstWorkspaceId } from '../../../lib/api';
import { EvidencePanel } from '../../../components/evidence-panel';

interface AdapterView {
  type: string;
  name: string;
  configured: boolean;
  requiresApiKey: boolean;
}
interface SourceView {
  id: string;
  adapter: string;
  url: string | null;
  status: string;
  itemCount: number;
  signalCount: number;
  quality: number;
  freshness: number;
}
interface SignalView {
  id: string;
  signalType: string;
  text: string;
  strengthScore: number;
  sourceQuality: number;
}

const STATUS_VARIANT: Record<string, 'ready' | 'failed' | 'warning' | 'muted'> = {
  parsed: 'ready', failed: 'failed', pending: 'warning', collected: 'warning', excluded: 'muted',
};

export default function SourcesPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_project'>('loading');
  const [ws, setWs] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<AdapterView[]>([]);
  const [sources, setSources] = useState<SourceView[]>([]);
  const [signals, setSignals] = useState<SignalView[]>([]);
  const [url, setUrl] = useState('');
  const [manual, setManual] = useState('');

  async function load() {
    setState('loading');
    try {
      const workspaceId = await firstWorkspaceId();
      setWs(workspaceId);
      const ad = await apiGet<AdapterView[]>('/sources/adapters');
      setAdapters(ad);
      if (!workspaceId) return setState('no_project');
      const projects = await apiGet<{ id: string }[]>(`/workspaces/${workspaceId}/projects`);
      const pid = projects[0]?.id ?? null;
      setProjectId(pid);
      if (!pid) return setState('no_project');
      await refresh(workspaceId, pid);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  async function refresh(workspaceId: string, pid: string) {
    setSources(await apiGet<SourceView[]>(`/workspaces/${workspaceId}/projects/${pid}/sources`));
    setSignals(await apiGet<SignalView[]>(`/workspaces/${workspaceId}/projects/${pid}/signals`));
  }

  useEffect(() => {
    void load();
  }, []);

  async function addSource(adapterType: string, body: Record<string, unknown>) {
    if (!ws || !projectId) return;
    await apiPost(`/workspaces/${ws}/projects/${projectId}/sources`, { adapterType, ...body });
    setUrl('');
    setManual('');
    await refresh(ws, projectId);
  }
  async function act(path: string) {
    if (!ws || !projectId) return;
    await apiPost(`/workspaces/${ws}/sources/${path}`, {});
    await refresh(ws, projectId);
  }

  const field = { padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}`, fontSize: typography.size.sm, flex: 1 } as const;

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title={t('nav.sources')} subtitle={t('pipeline.evidence')} />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && (
        <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />
      )}
      {state === 'no_project' && <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />}

      {(state === 'ready' || state === 'no_project') && (
        <Card style={{ marginBottom: spacing.lg }}>
          <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Adapters</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
            {adapters.map((a) => (
              <Badge key={a.type} variant={a.configured ? 'success' : 'muted'}>
                {a.name}{a.configured ? '' : ' · configuration needed'}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {state === 'ready' && (
        <>
          <Card style={{ marginBottom: spacing.lg }}>
            <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Add a source</h2>
            <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
              <input style={field} placeholder="https://competitor.com/pricing" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button variant="secondary" onClick={() => void addSource('url', { url })}>Add URL</Button>
            </div>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <textarea style={{ ...field, minHeight: 60 }} placeholder="Paste a customer quote, review, note…" value={manual} onChange={(e) => setManual(e.target.value)} />
              <Button variant="secondary" onClick={() => void addSource('manual', { content: manual })}>Add note</Button>
            </div>
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Sources</h2>
            {sources.length === 0 ? (
              <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
            ) : (
              <Table
                columns={[
                  { key: 'a', header: 'Adapter', render: (s: SourceView) => s.adapter.replace(/_/g, ' ') },
                  { key: 's', header: 'Status', render: (s) => <Badge variant={STATUS_VARIANT[s.status] ?? 'muted'}>{s.status}</Badge> },
                  { key: 'q', header: 'Quality', render: (s) => s.quality.toFixed(2) },
                  { key: 'f', header: 'Freshness', render: (s) => s.freshness.toFixed(2) },
                  { key: 'g', header: 'Signals', render: (s) => String(s.signalCount) },
                  {
                    key: 'x',
                    header: '',
                    render: (s) => (
                      <span style={{ display: 'flex', gap: spacing.xs }}>
                        <Button variant="ghost" onClick={() => void act(`${s.id}/retry`)}>{t('action.retry')}</Button>
                        <Button variant="ghost" onClick={() => void act(`${s.id}/exclude`)}>Exclude</Button>
                      </span>
                    ),
                  },
                ]}
                rows={sources}
              />
            )}
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Extracted signals</h2>
            {signals.length === 0 ? (
              <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {signals.map((sig) => (
                  <div key={sig.id} style={{ borderBottom: `${border.hairline}px solid ${palette.line}`, paddingBottom: spacing.sm }}>
                    <div style={{ display: 'flex', gap: spacing.xs, marginBottom: 4 }}>
                      <Badge variant="evidence">{sig.signalType}</Badge>
                      <Badge variant="muted">q {sig.sourceQuality.toFixed(2)}</Badge>
                    </div>
                    <div style={{ fontSize: typography.size.sm }}>{sig.text}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {ws && projectId && <EvidencePanel ws={ws} projectId={projectId} />}
        </>
      )}
    </div>
  );
}
