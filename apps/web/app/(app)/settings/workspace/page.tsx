'use client';

import { Card, EmptyState, PageHeader } from '../../../../components/ui';
import { useT } from '../../../../lib/i18n';

export default function WorkspaceSettingsPage() {
  const t = useT();
  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={t('settings.workspace')} subtitle={t('nav.settings')} />
      <Card>
        <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
      </Card>
    </div>
  );
}
