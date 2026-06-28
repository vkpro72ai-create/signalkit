'use client';

import Link from 'next/link';
import { Button, EmptyState, PageHeader } from '../../../components/ui';
import { useT } from '../../../lib/i18n';

export default function ProjectsPage() {
  const t = useT();
  return (
    <div>
      <PageHeader
        title={t('nav.projects')}
        subtitle={t('app.tagline')}
        action={
          <Link href="/projects/new" style={{ textDecoration: 'none' }}>
            <Button>{t('action.newProject')}</Button>
          </Link>
        }
      />
      <EmptyState
        title={t('state.empty.title')}
        body={t('state.empty.body')}
        action={
          <Link href="/projects/new" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{t('action.newProject')}</Button>
          </Link>
        }
      />
    </div>
  );
}
