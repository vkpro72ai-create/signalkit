'use client';

/**
 * Object lineage breadcrumb: Research → Opportunity → Product Pack → Project.
 * Every object shows where it came from and links back in one click, so users
 * never have to hunt through global lists to reconstruct provenance.
 */
import Link from 'next/link';
import type { Route } from 'next';
import { spacing, typography, radius } from '@signalkit/ui';
import { useT } from '../lib/i18n';
import { palette } from './ui';
import type { LineageView } from '../lib/api';

interface Node {
  label: string;
  value: string;
  href: string | null;
}

export function LineageBar({ lineage, current }: { lineage: LineageView; current: 'research' | 'opportunity' | 'pack' | 'project' }) {
  const t = useT();
  const pack = lineage.pack ?? lineage.packs?.[0] ?? null;
  const nodes: Node[] = [
    lineage.research && { label: t('lineage.research'), value: lineage.research.name, href: `/signalkit/opportunities?project=${lineage.research.id}` },
    lineage.opportunity && { label: t('lineage.opportunity'), value: lineage.opportunity.title, href: `/signalkit/opportunities/${lineage.opportunity.id}` },
    pack && { label: t('lineage.pack'), value: pack.title, href: `/signalkit/packs/${pack.id}` },
    lineage.project && { label: t('lineage.project'), value: '→', href: `/signalkit/projects/${lineage.project.id}` },
  ].filter(Boolean) as Node[];

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs,
        padding: `${spacing.xs}px ${spacing.sm}px`, marginBottom: spacing.lg,
        borderRadius: radius.md, background: palette.surface, border: `1px solid ${palette.line}`,
        fontSize: typography.size.xs,
      }}
    >
      {nodes.map((n, i) => {
        const isCurrent = n.label === t(`lineage.${current}` as never);
        const content = (
          <span style={{ color: isCurrent ? palette.ink : palette.subtle, fontWeight: isCurrent ? typography.weight.semibold : typography.weight.regular }}>
            <span style={{ opacity: 0.6 }}>{n.label}: </span>{n.value}
          </span>
        );
        return (
          <span key={n.label} style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.xs }}>
            {i > 0 && <span style={{ color: palette.subtle }}>›</span>}
            {n.href && !isCurrent ? (
              <Link href={n.href as Route} style={{ textDecoration: 'none' }}>{content}</Link>
            ) : content}
          </span>
        );
      })}
    </div>
  );
}
