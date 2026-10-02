'use client';

/**
 * Radar/Opportunities dashboard widgets — compound components built on the
 * generic primitives in ./ui.tsx (Card, Badge, Button) and the shared flat
 * 2D token system (no gradients/glassmorphism — see packages/ui/src/tokens.ts).
 * Kept separate from ui.tsx because these are dashboard-specific compounds,
 * not generic atoms reused across every page.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { spacing, radius, border, typography, colorFor, scoreVariant } from '@signalkit/ui';
import { Card, Badge, Button, EvidenceBadge, palette, type Column } from './ui';
import type { Translator } from '@signalkit/i18n';
import type { OpportunityCard as OpportunityCardData } from '../lib/api';

/** Same low/medium/high(+very_*) band labels used for confidence AND venture-scale/investor-interest levels — one translation source, not one per page. */
export function levelLabel(level: string, t: Translator): string {
  switch (level) {
    case 'very_low':
      return t('level.veryLow');
    case 'low':
      return t('level.low');
    case 'medium':
      return t('level.medium');
    case 'high':
      return t('level.high');
    case 'very_high':
      return t('level.veryHigh');
    default:
      return level;
  }
}

/**
 * The ranked-opportunity table columns shared by the Radar (Home) and
 * Opportunities pages — previously each page had its own separate rendering
 * of "top opportunities," which had silently drifted to use different data
 * sources. `rankOf` looks up each row's position in the full ranked list
 * (not the possibly-shorter slice actually rendered), so a "top 5" slice
 * still shows real ranks 1-5, not always 1-5 regardless of slicing.
 */
export function buildOpportunityColumns(t: Translator, rankOf: (row: OpportunityCardData) => number): Column<OpportunityCardData>[] {
  return [
    {
      key: 'rank',
      header: '#',
      render: (row) => <span style={{ color: palette.subtle }}>{rankOf(row)}</span>,
    },
    {
      key: 'name',
      header: t('radar.table.opportunity'),
      render: (row) => (
        <Link href={`/signalkit/opportunities/${row.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: typography.weight.medium, textDecoration: 'underline', textDecorationColor: palette.line }}>{row.name}</div>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 2 }}>{row.oneLiner}</div>
        </Link>
      ),
    },
    {
      key: 'confidence',
      header: t('radar.table.confidence'),
      render: (row) => (
        <div>
          <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium }}>{Math.round(row.confidence.value * 100)}%</div>
          <ConfidenceDots value={row.confidence.value * 100} />
        </div>
      ),
    },
    {
      key: 'evidence',
      header: t('radar.table.evidence'),
      render: (row) => (
        <div>
          <EvidenceBadge count={row.evidenceCount} label={t('radar.table.evidenceUnit')} />
          <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 2 }}>{t('radar.table.evidenceScopeCaption')}</div>
        </div>
      ),
    },
    {
      key: 'investorInterest',
      header: t('radar.table.investorInterest'),
      render: (row) => (row.ventureScaleLevel ? <Badge variant="confidence">{levelLabel(row.ventureScaleLevel, t)}</Badge> : <span style={{ color: palette.subtle }}>—</span>),
    },
    {
      key: 'whyNow',
      header: t('radar.table.whyNow'),
      render: (row) => <span style={{ fontSize: typography.size.sm }}>{row.whyNow || '—'}</span>,
    },
  ];
}

/* ── StatTrendCard ───────────────────────────────────────────────────────── */
export function StatTrendCard({
  icon,
  label,
  value,
  deltaPct,
  deltaSuffix,
  deltaGoodDirection = 'up',
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  /** null/undefined = no comparable prior period; do not render a fabricated 0%. */
  deltaPct?: number | null;
  deltaSuffix?: string;
  deltaGoodDirection?: 'up' | 'down';
}) {
  const hasDelta = typeof deltaPct === 'number' && deltaPct !== 0;
  const isUp = hasDelta && deltaPct! > 0;
  const isGood = hasDelta && (deltaGoodDirection === 'up' ? deltaPct! > 0 : deltaPct! < 0);
  const deltaColor = isGood ? colorFor('success').fg : colorFor('risk').fg;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: palette.subtle, fontSize: typography.size.xs, marginBottom: spacing.xs }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold, color: palette.ink }}>{value}</div>
      {hasDelta ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: spacing.xs, fontSize: typography.size.xs, fontWeight: typography.weight.medium, color: deltaColor }}>
          <span>{isUp ? '▲' : '▼'}</span>
          <span>{Math.abs(deltaPct!).toFixed(0)}%</span>
          {deltaSuffix ? <span style={{ color: palette.subtle, fontWeight: typography.weight.regular }}>{deltaSuffix}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

/* ── ConfidenceDots ──────────────────────────────────────────────────────── */
export function ConfidenceDots({ value, max = 100, totalDots = 8 }: { value: number; max?: number; totalDots?: number }) {
  const clamped = Math.max(0, Math.min(max, value));
  const filled = Math.round((clamped / max) * totalDots);
  const c = colorFor(scoreVariant((clamped / max) * 100).variant);
  return (
    <div style={{ display: 'flex', gap: 3 }} role="img" aria-label={`${Math.round(clamped)}/${max}`}>
      {Array.from({ length: totalDots }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: radius.full,
            background: i < filled ? c.fg : palette.line,
          }}
        />
      ))}
    </div>
  );
}

/* ── Sparkline ───────────────────────────────────────────────────────────── */
/**
 * Minimal inline SVG polyline — this data is a handful of weekly points, not
 * a real time series, so a charting library dependency isn't justified.
 */
export function Sparkline({ points, width = 84, height = 24, color }: { points: number[]; width?: number; height?: number; color?: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => `${i * stepX},${height - ((p - min) / range) * (height - 2) - 1}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={coords} fill="none" stroke={color ?? palette.ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── HeroOpportunityCard ─────────────────────────────────────────────────── */
/**
 * Adapts the mockup's soft radial-glow hero into the existing flat-2D
 * language (docs/UI_UX_PRINCIPLES.md: no gradients, no glassmorphism) — a
 * solid opportunity-tinted card with a flat circular accent, not a blur.
 */
export function HeroOpportunityCard({
  eyebrow,
  title,
  description,
  tags,
  score,
  whyNowLabel,
  whyNow,
  cta,
  onCtaClick,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tags: string[];
  score: number;
  whyNowLabel: string;
  whyNow: string;
  cta: string;
  onCtaClick?: () => void;
  /** Inner cards (e.g. next-action / investor-signal) rendered inside this
   * colored block rather than as a separate page-level side column. */
  aside?: ReactNode;
}) {
  const c = colorFor('opportunity');
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: c.bg,
        border: `${border.hairline}px solid ${c.border}`,
        borderRadius: radius.lg,
        padding: spacing['2xl'],
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -48,
          right: -48,
          width: 180,
          height: 180,
          borderRadius: radius.full,
          background: c.border,
          opacity: 0.3,
        }}
      />
      <div style={{ position: 'relative', display: 'flex', gap: spacing['2xl'], alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 420px', minWidth: 280 }}>
          <Badge variant="opportunity">{eyebrow}</Badge>
          <h2 style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold, margin: `${spacing.sm}px 0`, maxWidth: 560 }}>{title}</h2>
          <p style={{ color: palette.subtle, maxWidth: 520, margin: 0 }}>{description}</p>
          {tags.length > 0 ? (
            <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
              {tags.map((tag) => (
                <Badge key={tag} variant="muted">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xl'], marginTop: spacing.lg, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: typography.size['3xl'], fontWeight: typography.weight.bold, lineHeight: 1 }}>
                {Math.round(score)}
                <span style={{ fontSize: typography.size.sm, color: palette.subtle, fontWeight: typography.weight.regular }}>/100</span>
              </div>
              <div style={{ marginTop: spacing.xs }}>
                <ConfidenceDots value={score} />
              </div>
            </div>
            <div style={{ maxWidth: 320 }}>
              <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginBottom: 2 }}>{whyNowLabel}</div>
              <div style={{ fontSize: typography.size.sm }}>{whyNow}</div>
            </div>
          </div>
          <div style={{ marginTop: spacing.lg }}>
            <Button onClick={onCtaClick}>{cta}</Button>
          </div>
        </div>
        {aside ? (
          <div style={{ flex: '1 1 260px', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {aside}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── SidePanel ───────────────────────────────────────────────────────────── */
export function SidePanel({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm, fontSize: typography.size.sm, fontWeight: typography.weight.semibold }}>
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </Card>
  );
}
