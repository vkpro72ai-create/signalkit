'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, radius, border } from '@signalkit/ui';
import {
  Card,
  PageHeader,
  Badge,
  ModelCostBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  Button,
  palette,
} from '../../../../components/ui';
import { useT } from '../../../../lib/i18n';
import {
  apiGet,
  estimatePackCostUsd,
  PACK_DEPTHS,
  type CatalogModelView,
  type ProviderView,
} from '../../../../lib/api';

type LoadState = 'loading' | 'error' | 'ready';

export default function AiModelsPage() {
  const t = useT();
  const [state, setState] = useState<LoadState>('loading');
  const [models, setModels] = useState<CatalogModelView[]>([]);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [depth, setDepth] = useState<(typeof PACK_DEPTHS)[number]>('build_ready');

  async function load() {
    setState('loading');
    try {
      const [m, p] = await Promise.all([
        apiGet<CatalogModelView[]>('/llm/models'),
        apiGet<ProviderView[]>('/llm/providers'),
      ]);
      setModels(m);
      setProviders(p);
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
      <PageHeader
        title={t('settings.llm')}
        subtitle={t('app.tagline')}
        action={
          <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
            <Link href="/settings/usage" style={{ textDecoration: 'none' }}>
              <Button variant="secondary">AI Usage</Button>
            </Link>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value as typeof depth)}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: radius.md,
                border: `${border.hairline}px solid ${palette.line}`,
                fontSize: typography.size.sm,
              }}
            >
              {PACK_DEPTHS.map((d) => (
                <option key={d} value={d}>
                  {d.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && (
        <ErrorState
          title={t('state.error.title')}
          body={t('state.error.body')}
          action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>}
        />
      )}

      {state === 'ready' && (
        <>
          <div style={{ marginBottom: spacing.xl }}>
            <h2 style={{ fontSize: typography.size.lg }}>{providers.length} providers</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
              {providers.map((p) => (
                <Badge key={p.type} variant="muted">
                  {p.displayName}
                  {p.requiresBaseUrl ? ' · base URL' : ''}
                </Badge>
              ))}
            </div>
          </div>

          {models.length === 0 ? (
            <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
              {models.map((m) => (
                <ModelCard key={m.id} model={m} depth={depth} t={t} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelCard({
  model,
  depth,
  t,
}: {
  model: CatalogModelView;
  depth: (typeof PACK_DEPTHS)[number];
  t: (k: 'label.score' | 'label.estCost' | 'label.market') => string;
}) {
  const estCost = estimatePackCostUsd(model, depth);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: typography.weight.semibold }}>{model.displayName}</div>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{model.provider}</div>
        </div>
        <ModelCostBadge usd={estCost} label={t('label.estCost')} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
        <Badge variant="confidence">{t('label.score')}: {model.ratingOverall ?? '—'}</Badge>
        <Badge variant="muted">ctx {Math.round(model.contextWindow / 1000)}k</Badge>
        <Badge variant="muted">
          ${model.inputTokenPrice}/${model.outputTokenPrice} per 1M
        </Badge>
        {model.pricingSource ? <Badge variant="draft">src: {model.pricingSource}</Badge> : null}
      </div>

      <div style={{ marginTop: spacing.sm, fontSize: typography.size.xs, color: palette.subtle }}>
        <strong style={{ color: palette.ink }}>+</strong> {model.strengths.slice(0, 2).join(', ')}
        <br />
        <strong style={{ color: palette.ink }}>−</strong> {model.weaknesses.slice(0, 2).join(', ')}
      </div>

      <div style={{ marginTop: spacing.sm, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {model.supportedLanguages.slice(0, 6).map((l) => (
          <span key={l} style={{ fontSize: typography.size.xs, color: palette.subtle }}>
            {l}
          </span>
        ))}
      </div>
    </Card>
  );
}
