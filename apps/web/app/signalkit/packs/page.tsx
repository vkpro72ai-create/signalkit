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
import { firstWorkspaceId, opportunityApi, packListApi, type PackListItem } from '../../../lib/api';

interface PackRow extends PackListItem {
  nicheId: string;
  nicheName: string;
}

export default function PacksListPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_project'>('loading');
  const [packs, setPacks] = useState<PackRow[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const ws = await firstWorkspaceId();
      if (!ws) return setState('no_project');
      const niches = await opportunityApi.listAll(ws);
      if (niches.length === 0) return setState('no_project');

      const rows: PackRow[] = [];
      for (const n of niches) {
        const list = await packListApi.listForNiche(ws, n.id).catch(() => []);
        for (const p of list) {
          rows.push({ ...p, nicheId: n.id, nicheName: n.name });
        }
      }
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
      <PageHeader title={t('nav.packs')} subtitle="Build-ready document collections generated from your opportunities." />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}

      {state === 'no_project' && (
        <EmptyState
          title="No opportunities yet"
          body="Product Packs are generated from an opportunity. Find opportunities first, then generate a pack from one."
          action={<Link href="/signalkit/opportunities" style={{ textDecoration: 'none' }}><Button variant="secondary">Go to Opportunities</Button></Link>}
        />
      )}

      {state === 'ready' && packs.length === 0 && (
        <EmptyState
          title="No packs yet"
          body="Open an opportunity and generate its Product Pack — Founder Brief, Venture Thesis, MVP Scope, Build Blueprint and more."
          action={<Link href="/signalkit/opportunities" style={{ textDecoration: 'none' }}><Button variant="secondary">Go to Opportunities</Button></Link>}
        />
      )}

      {state === 'ready' && packs.length > 0 && (
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
          {packs.map((p) => (
            <Link key={p.id} href={`/signalkit/packs/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card>
                <div style={{ fontWeight: typography.weight.semibold }}>{p.title}</div>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>
                  {p.nicheName} · {p.depth.replace(/_/g, ' ')}
                </div>
                <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
                  <DocumentStatusPill status={p.status as DocumentStatus} label={p.status.replace(/_/g, ' ')} />
                  <Badge variant="muted">{p.documents.length} documents</Badge>
                  {p.qualityGate && <Badge variant={p.qualityGate.status === 'failed' ? 'failed' : p.qualityGate.status === 'warnings' ? 'warning' : 'ready'}>gate: {p.qualityGate.status}</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
