'use client';

/**
 * Opportunity Search — the research/search containers (market + geography +
 * discovery goal). This is what the Prisma `Project` model actually is; it is
 * NOT an implementation project (those live under /signalkit/projects).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, border } from '@signalkit/ui';
import { Button, Card, EmptyState, PageHeader, LoadingState, ErrorState, palette } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { firstWorkspaceId, workspaceApi, type ProjectView } from '../../../lib/api';

export default function ResearchPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_workspace'>('loading');
  const [projects, setProjects] = useState<ProjectView[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const ws = await firstWorkspaceId();
      if (!ws) return setState('no_workspace');
      setProjects(await workspaceApi.listProjects(ws));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader
        title={t('nav.research')}
        subtitle={t('research.subtitle')}
        action={
          <Link href="/signalkit/research/new" style={{ textDecoration: 'none' }}>
            <Button>{t('action.newProject')}</Button>
          </Link>
        }
      />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'no_workspace' && (
        <EmptyState
          title={t('research.empty')}
          body={t('research.emptyBody')}
          action={<Link href="/signalkit" style={{ textDecoration: 'none' }}><Button variant="secondary">{t('nav.home')}</Button></Link>}
        />
      )}

      {state === 'ready' && projects.length === 0 && (
        <EmptyState
          title={t('research.empty')}
          body={t('research.emptyBody')}
          action={<Link href="/signalkit/research/new" style={{ textDecoration: 'none' }}><Button variant="secondary">{t('action.newProject')}</Button></Link>}
        />
      )}

      {state === 'ready' && projects.length > 0 && (
        <Card style={{ padding: 0 }}>
          {projects.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center',
                padding: spacing.lg,
                borderBottom: i < projects.length - 1 ? `${border.hairline}px solid ${palette.line}` : 'none',
              }}
            >
              <div>
                <div style={{ fontWeight: typography.weight.medium }}>{p.name}</div>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 2 }}>
                  {p.marketScope.replace(/_/g, ' ')}{p.targetCountry ? ` · ${p.targetCountry}` : ''}
                </div>
              </div>
              <Link href={`/signalkit/opportunities?project=${p.id}`} style={{ textDecoration: 'none' }}>
                <Button variant="secondary">{t('research.viewOpportunities')}</Button>
              </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
