'use client';

import { useEffect, useState } from 'react';
import { spacing, typography } from '@signalkit/ui';
import {
  Card,
  PageHeader,
  Table,
  Badge,
  ModelCostBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  Button,
  palette,
} from '../../../../components/ui';
import { useT } from '../../../../lib/i18n';
import { apiGet } from '../../../../lib/api';

interface GroupRow {
  provider?: string;
  model?: string;
  taskType?: string;
  _count: number;
  _sum: { estimatedCost: number | null };
}
interface UsageSummary {
  totals: { _count: number; _sum: { estimatedCost: number | null; inputTokens: number | null } };
  byProvider: GroupRow[];
  byModel: GroupRow[];
  byTask: GroupRow[];
  failures: number;
  mostExpensive: { model: string; taskType: string; estimatedCost: number }[];
}
interface MeResponse {
  memberships: { workspace: { id: string } }[];
}

export default function AiUsagePage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<UsageSummary | null>(null);

  async function load() {
    setState('loading');
    try {
      const me = await apiGet<MeResponse>('/me');
      const workspaceId = me.memberships[0]?.workspace.id;
      if (!workspaceId) {
        setData(null);
        setState('ready');
        return;
      }
      setData(await apiGet<UsageSummary>(`/llm/usage?workspaceId=${workspaceId}`));
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title="AI Usage" subtitle={t('settings.llm')} />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && (
        <ErrorState
          title={t('state.error.title')}
          body={t('state.error.body')}
          action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>}
        />
      )}

      {state === 'ready' && (!data || data.totals._count === 0) && (
        <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
      )}

      {state === 'ready' && data && data.totals._count > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Badge variant="confidence">{data.totals._count} calls</Badge>
            <ModelCostBadge usd={data.totals._sum.estimatedCost ?? 0} label={t('label.estCost')} />
            <Badge variant={data.failures > 0 ? 'risk' : 'success'}>{data.failures} failures</Badge>
          </div>

          <Card>
            <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>By provider</h2>
            <Table
              columns={[
                { key: 'p', header: 'Provider', render: (r: GroupRow) => r.provider },
                { key: 'n', header: 'Calls', render: (r) => String(r._count) },
                { key: 'c', header: t('label.estCost'), render: (r) => `$${(r._sum.estimatedCost ?? 0).toFixed(4)}` },
              ]}
              rows={data.byProvider}
            />
          </Card>

          <Card>
            <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>By task</h2>
            <Table
              columns={[
                { key: 'task', header: 'Task', render: (r: GroupRow) => (r.taskType ?? '').replace(/_/g, ' ') },
                { key: 'n', header: 'Calls', render: (r) => String(r._count) },
                { key: 'c', header: t('label.estCost'), render: (r) => `$${(r._sum.estimatedCost ?? 0).toFixed(4)}` },
              ]}
              rows={data.byTask}
            />
          </Card>

          <Card>
            <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Most expensive</h2>
            {data.mostExpensive.length === 0 ? (
              <span style={{ color: palette.subtle }}>—</span>
            ) : (
              <Table
                columns={[
                  { key: 'm', header: 'Model', render: (r: { model: string }) => r.model },
                  { key: 't', header: 'Task', render: (r: { taskType: string }) => r.taskType.replace(/_/g, ' ') },
                  { key: 'c', header: t('label.estCost'), render: (r: { estimatedCost: number }) => `$${r.estimatedCost.toFixed(4)}` },
                ]}
                rows={data.mostExpensive}
              />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
