'use client';

import { EmptyState, PageHeader } from '../../../components/ui';
import { useT } from '../../../lib/i18n';

export default function MarketComparePage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('market.compare')} subtitle={t('label.market')} />
      <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
    </div>
  );
}
