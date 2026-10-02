'use client';

/** Implementation project detail — lineage, founder-commitment snapshot,
 * ambition, readiness badges, and top risks captured at promotion time. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { spacing, typography } from '@signalkit/ui';
import { Badge, Card, PageHeader, LoadingState, ErrorState, Button, palette } from '../../../../components/ui';
import { LineageBar } from '../../../../components/lineage-bar';
import { useT } from '../../../../lib/i18n';
import { firstWorkspaceId, decisionApi, type ImplementationProjectView } from '../../../../lib/api';

export default function ImplementationProjectPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [project, setProject] = useState<ImplementationProjectView | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const ws = await firstWorkspaceId();
      if (!ws) return setState('error');
      setProject(await decisionApi.getProject(ws, params.id));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <LoadingState label={t('state.loading')} />;
  if (state === 'error' || !project) return <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />;

  return (
    <div>
      {project.lineage && <LineageBar lineage={project.lineage} current="project" />}
      <PageHeader
        title={project.niche.title}
        subtitle={`${project.researchProject.name} · ${t('projects.impl.committed')} ${new Date(project.committedAt).toLocaleDateString()}`}
      />

      <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.lg }}>
        <Badge variant="opportunity">{t('projects.impl.ambition')}: {t(`ambition.${project.ambitionMode}` as never)}</Badge>
        {project.buildReadySnapshot && <Badge variant="ready">{t('readiness.buildReady')}</Badge>}
        {project.ventureReadySnapshot && <Badge variant="confidence">{t('readiness.ventureReady')}</Badge>}
        {project.unicornPotentialSnapshot && <Badge variant="success">{t('readiness.unicornPotential')}</Badge>}
      </div>

      <Card style={{ marginBottom: spacing.lg }}>
        <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{t('verdict.founderTitle')}</div>
        <div style={{ fontSize: typography.size.sm }}>
          {t('verdict.yourRating')}: {project.founderRatingSnapshot ?? '—'} / 5
        </div>
        {project.founderCommentSnapshot && (
          <div style={{ color: palette.subtle, fontSize: typography.size.sm, marginTop: spacing.xs }}>“{project.founderCommentSnapshot}”</div>
        )}
      </Card>

      {project.topRisksSnapshot.length > 0 && (
        <Card>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{t('promote.topRisks')}</div>
          <ul style={{ margin: 0, paddingInlineStart: spacing.lg, fontSize: typography.size.sm, color: palette.subtle }}>
            {project.topRisksSnapshot.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
