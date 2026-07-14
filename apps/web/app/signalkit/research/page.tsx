'use client';

/**
 * Opportunity Search — the research/search containers (market + geography +
 * discovery goal). This is what the Prisma `Project` model actually is; it is
 * NOT an implementation project (those live under /signalkit/projects).
 *
 * Lifecycle: draft (just created) -> active (opportunities found) ->
 * archived (either promoted into an Implementation Project automatically, or
 * archived/deleted by hand once the search is done). Archived searches are
 * hidden from this list by default so it only shows what's still in progress.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, border } from '@signalkit/ui';
import { Button, Card, EmptyState, PageHeader, LoadingState, ErrorState, palette } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { firstWorkspaceId, workspaceApi, type ProjectView } from '../../../lib/api';

function statusLabelKey(status: string): 'research.status.draft' | 'research.status.active' | 'research.status.archived' {
  if (status === 'draft') return 'research.status.draft';
  if (status === 'archived') return 'research.status.archived';
  return 'research.status.active';
}

export default function ResearchPage() {
  const t = useT();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_workspace'>('loading');
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: 'archive' | 'delete' } | null>(null);

  const load = useCallback(async (includeArchived: boolean) => {
    setState('loading');
    try {
      const ws = await firstWorkspaceId();
      if (!ws) return setState('no_workspace');
      setWorkspaceId(ws);
      setProjects(await workspaceApi.listProjects(ws, { includeArchived }));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(showArchived); }, [load, showArchived]);

  async function handleArchive(project: ProjectView, archived: boolean) {
    if (!workspaceId || busy) return;
    setBusy({ id: project.id, action: 'archive' });
    try {
      await workspaceApi.archiveProject(workspaceId, project.id, archived);
      setProjects((prev) =>
        archived && !showArchived
          ? prev.filter((p) => p.id !== project.id)
          : prev.map((p) => (p.id === project.id ? { ...p, status: archived ? 'archived' : 'active' } : p)),
      );
    } catch {
      window.alert(t('research.archiveError'));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(project: ProjectView) {
    if (!workspaceId || busy) return;
    const confirmed = window.confirm(t('research.deleteConfirm').replace('{name}', project.name));
    if (!confirmed) return;
    setBusy({ id: project.id, action: 'delete' });
    try {
      await workspaceApi.deleteProject(workspaceId, project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'project_has_committed_implementation') {
        window.alert(t('research.deleteBlocked').replace('{name}', project.name));
      } else {
        window.alert(t('research.deleteError'));
      }
    } finally {
      setBusy(null);
    }
  }

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
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load(showArchived)}>{t('action.retry')}</Button>} />}
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
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.sm }}>
            <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? t('research.hideArchived') : t('research.showArchived')}
            </Button>
          </div>
          <Card style={{ padding: 0 }}>
            {projects.map((p, i) => {
              const archived = p.status === 'archived';
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center',
                    padding: spacing.lg,
                    opacity: archived ? 0.6 : 1,
                    borderBottom: i < projects.length - 1 ? `${border.hairline}px solid ${palette.line}` : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: typography.weight.medium }}>{p.name}</div>
                    <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 2 }}>
                      {t(statusLabelKey(p.status))} · {p.marketScope.replace(/_/g, ' ')}{p.targetCountry ? ` · ${p.targetCountry}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                    <Link href={`/signalkit/opportunities?project=${p.id}`} style={{ textDecoration: 'none' }}>
                      <Button variant="secondary">{t('research.viewOpportunities')}</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      disabled={busy?.id === p.id}
                      onClick={() => void handleArchive(p, !archived)}
                    >
                      {busy?.id === p.id && busy.action === 'archive'
                        ? t('action.archiving')
                        : archived ? t('action.unarchive') : t('action.archive')}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy?.id === p.id}
                      onClick={() => void handleDelete(p)}
                    >
                      {busy?.id === p.id && busy.action === 'delete' ? t('action.deleting') : t('action.delete')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
