'use client';

/**
 * Projects — real, founder-committed implementation projects. Only opportunities
 * that reached a Build-Ready pack AND were consciously promoted by the founder
 * appear here. Raw research contexts live under /signalkit/research; failed or
 * non-build-ready packs never appear here.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, border } from '@signalkit/ui';
import { Button, Card, Badge, EmptyState, PageHeader, LoadingState, ErrorState, palette } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { firstWorkspaceId, decisionApi, type ImplementationProjectView } from '../../../lib/api';

export default function ProjectsPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_workspace'>('loading');
  const [projects, setProjects] = useState<ImplementationProjectView[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const ws = await firstWorkspaceId();
      if (!ws) return setState('no_workspace');
      setProjects(await decisionApi.listProjects(ws));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader title={t('nav.projects')} subtitle={t('projects.impl.subtitle')} />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'no_workspace' && <EmptyState title={t('research.empty')} body={t('research.emptyBody')} />}

      {state === 'ready' && projects.length === 0 && (
        <EmptyState
          title={t('projects.impl.empty')}
          body={t('projects.impl.emptyBody')}
          action={<Link href="/signalkit/packs" style={{ textDecoration: 'none' }}><Button variant="secondary">{t('nav.packs')}</Button></Link>}
        />
      )}

      {state === 'ready' && projects.length > 0 && (
        <Card style={{ padding: 0 }}>
          {projects.map((p, i) => (
            <Link
              key={p.id}
              href={`/signalkit/projects/${p.id}`}
              style={{
                display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md,
                padding: spacing.lg, textDecoration: 'none', color: 'inherit',
                borderBottom: i < projects.length - 1 ? `${border.hairline}px solid ${palette.line}` : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: typography.weight.medium }}>{p.niche.title}</div>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 2 }}>
                  {p.researchProject.name} · {t('projects.impl.committed')} {new Date(p.committedAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge variant="opportunity">{t(`ambition.${p.ambitionMode}` as never)}</Badge>
                {p.buildReadySnapshot && <Badge variant="ready">{t('readiness.buildReady')}</Badge>}
                {p.ventureReadySnapshot && <Badge variant="confidence">{t('readiness.ventureReady')}</Badge>}
                {p.unicornPotentialSnapshot && <Badge variant="success">{t('readiness.unicornPotential')}</Badge>}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
