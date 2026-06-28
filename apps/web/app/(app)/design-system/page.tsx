'use client';

import { useState } from 'react';
import { spacing, typography } from '@signalkit/ui';
import { createTranslator, SUPPORTED_LOCALES } from '@signalkit/i18n';
import {
  Button,
  Card,
  Badge,
  ScoreBadge,
  RiskBadge,
  ConfidenceBadge,
  EvidenceBadge,
  SourceRefBadge,
  ModelCostBadge,
  DocumentStatusPill,
  Tabs,
  Table,
  EmptyState,
  LoadingState,
  ErrorState,
  PermissionGate,
  AuditEventRow,
  PageHeader,
  palette,
} from '../../../components/ui';
import { useT } from '../../../lib/i18n';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>{children}</div>
    </Card>
  );
}

export default function DesignSystemPage() {
  const t = useT();
  const [tab, setTab] = useState('a');

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title={t('nav.designSystem')} subtitle="Premium flat 2D · no gradients" />

      <Section title="Buttons">
        <Button>{t('action.create')}</Button>
        <Button variant="secondary">{t('action.cancel')}</Button>
        <Button variant="ghost">{t('action.retry')}</Button>
        <Button disabled>{t('action.generate')}</Button>
      </Section>

      <Section title="Score / Risk / Confidence">
        <ScoreBadge score={88} label={t('score.band.strong')} />
        <ScoreBadge score={62} label={t('score.band.moderate')} />
        <ScoreBadge score={34} label={t('score.band.weak')} />
        <ScoreBadge score={12} label={t('score.band.low')} />
        <RiskBadge level="low" label={t('label.risk')} />
        <RiskBadge level="medium" label={t('label.risk')} />
        <RiskBadge level="high" label={t('label.risk')} />
        <ConfidenceBadge level="very_low" />
        <ConfidenceBadge level="medium" />
        <ConfidenceBadge level="very_high" />
      </Section>

      <Section title="Evidence / Sources / Cost / Status">
        <EvidenceBadge count={7} label={t('label.evidence')} />
        <SourceRefBadge count={4} />
        <ModelCostBadge usd={0.42} label={t('label.estCost')} />
        <ModelCostBadge usd={2.1} label={t('label.estCost')} />
        <ModelCostBadge usd={9.5} label={t('label.estCost')} />
        <DocumentStatusPill status="draft" />
        <DocumentStatusPill status="in_review" />
        <DocumentStatusPill status="approved" />
        <DocumentStatusPill status="failed" />
      </Section>

      <Section title="Tabs">
        <div style={{ width: '100%' }}>
          <Tabs
            tabs={[
              { key: 'a', label: t('pipeline.niches') },
              { key: 'b', label: t('label.evidence') },
              { key: 'c', label: t('pipeline.score') },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>
      </Section>

      <Section title="Table">
        <div style={{ width: '100%' }}>
          <Table
            columns={[
              { key: 'name', header: t('pipeline.niches'), render: (r: { name: string; score: number }) => r.name },
              { key: 'score', header: t('label.score'), render: (r) => <ScoreBadge score={r.score} /> },
            ]}
            rows={[
              { name: 'Clinic WhatsApp AI copilot', score: 78 },
              { name: 'EU AI Act SMB compliance', score: 64 },
            ]}
          />
        </div>
      </Section>

      <Section title="States">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.md, width: '100%' }}>
          <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
          <LoadingState label={t('state.loading')} />
          <ErrorState title={t('state.error.title')} body={t('state.error.body')} />
        </div>
      </Section>

      <Section title="PermissionGate (shared RBAC matrix)">
        <PermissionGate role="viewer" permission="pack:generate" fallback={<Badge variant="muted">viewer cannot generate</Badge>}>
          <Badge variant="success">can generate</Badge>
        </PermissionGate>
        <PermissionGate role="strategist" permission="pack:generate" fallback={<Badge variant="muted">no</Badge>}>
          <Badge variant="success">strategist can generate</Badge>
        </PermissionGate>
      </Section>

      <Section title="Audit rows">
        <div style={{ width: '100%' }}>
          <AuditEventRow action="workspace.created" actor="founder@signalkit.dev" at="2026-06-24" />
          <AuditEventRow action="workspace.settings_updated" actor="strategist@signalkit.dev" at="2026-06-24" />
        </div>
      </Section>

      <Section title="Multilingual label proof — nav.projects across all locales">
        {SUPPORTED_LOCALES.map((l) => (
          <Badge key={l} variant="evidence">
            {l}: {createTranslator(l)('nav.projects')}
          </Badge>
        ))}
      </Section>

      <p style={{ color: palette.subtle, fontSize: typography.size.xs }}>
        No gradients, no glassmorphism, no neon — flat solid tokens only.
      </p>
    </div>
  );
}
