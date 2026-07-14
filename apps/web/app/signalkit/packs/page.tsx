'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography } from '@signalkit/ui';
import {
  Card,
  PageHeader,
  Button,
  Badge,
  DocumentStatusPill,
  EmptyState,
  LoadingState,
  ErrorState,
  palette,
} from '../../../components/ui';
import type { DocumentStatus } from '@signalkit/shared';
import { useT } from '../../../lib/i18n';
import { firstWorkspaceId, packListApi, type WorkspacePackListItem } from '../../../lib/api';

export default function PacksListPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_workspace'>('loading');
  const [packs, setPacks] = useState<WorkspacePackListItem[]>([]);

  // One workspace-wide query (PackService.listForWorkspace) instead of
  // fetching every niche in the workspace and then calling listForNiche in a
  // sequential per-niche loop — that N+1 chain across dozens of niches (many
  // of them stale test/demo research contexts) is what made this page look
  // stuck on "Loading…" rather than genuinely be stuck.
  const load = useCallback(async () => {
    setState('loading');
    try {
      const ws = await firstWorkspaceId();
      if (!ws) return setState('no_workspace');
      const rows = await packListApi.listForWorkspace(ws);
      rows.sort((a, b) => (a.title < b.title ? -1 : 1));
      setPacks(rows);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title={t('nav.packs')} subtitle={t('packs.subtitle')} />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}

      {state === 'no_workspace' && (
        <EmptyState
          title={t('packs.emptyTitle')}
          body={t('packs.emptyBody')}
          action={<Link href="/signalkit/opportunities" style={{ textDecoration: 'none' }}><Button variant="secondary">{t('packs.goToOpportunities')}</Button></Link>}
        />
      )}

      {state === 'ready' && packs.length === 0 && (
        <EmptyState
          title={t('packs.emptyTitle')}
          body={t('packs.emptyBody')}
          action={<Link href="/signalkit/opportunities" style={{ textDecoration: 'none' }}><Button variant="secondary">{t('packs.goToOpportunities')}</Button></Link>}
        />
      )}

      {state === 'ready' && packs.length > 0 && (
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
          {packs.map((p) => (
            <Link key={p.id} href={`/signalkit/packs/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card>
                <div style={{ fontWeight: typography.weight.semibold }}>{p.title}</div>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>
                  {p.niche.title} · {p.depth.replace(/_/g, ' ')}
                </div>
                <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
                  <DocumentStatusPill status={p.status as DocumentStatus} label={p.status.replace(/_/g, ' ')} />
                  <Badge variant="muted">{p.documents.length} {t('packs.documents')}</Badge>
                  {p.qualityGate && <Badge variant={p.qualityGate.status === 'failed' ? 'failed' : p.qualityGate.status === 'warnings' ? 'warning' : 'ready'}>{t('packs.gate')}: {p.qualityGate.status}</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
