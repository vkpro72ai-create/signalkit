'use client';

/**
 * Web UI primitives — premium flat 2D. Token-driven, no gradients/glassmorphism.
 * Semantic meaning (colors per score/risk/confidence/status) comes from the
 * shared @signalkit/ui presenters so web and mobile stay visually consistent.
 */
import type { CSSProperties, ReactNode } from 'react';
import {
  spacing,
  radius,
  border,
  typography,
  colorFor,
  scoreVariant,
  riskVariant,
  confidenceVariant,
  documentStatusVariant,
  costVariant,
  type SemanticColor,
} from '@signalkit/ui';
import {
  roleHasPermission,
  type ConfidenceLevel,
  type DocumentStatus,
  type Permission,
  type RiskLevel,
  type WorkspaceRole,
} from '@signalkit/shared';

const ink = '#1B1F24';
const subtle = '#5A626E';
const line = '#E2E6EB';
const surface = '#FFFFFF';
const canvas = '#FBFCFD';

/* ── Button ──────────────────────────────────────────────────────────────── */
export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const styles: Record<typeof variant, CSSProperties> = {
    primary: { background: ink, color: '#FFFFFF', border: `${border.hairline}px solid ${ink}` },
    secondary: { background: surface, color: ink, border: `${border.hairline}px solid ${line}` },
    ghost: { background: 'transparent', color: ink, border: `${border.hairline}px solid transparent` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant],
        padding: `${spacing.sm}px ${spacing.lg}px`,
        borderRadius: radius.md,
        fontSize: typography.size.sm,
        fontWeight: typography.weight.medium,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* ── Card ────────────────────────────────────────────────────────────────── */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: surface,
        border: `${border.hairline}px solid ${line}`,
        borderRadius: radius.lg,
        padding: spacing.xl,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Badge family ────────────────────────────────────────────────────────── */
export function Badge({ variant, children }: { variant: SemanticColor; children: ReactNode }) {
  const c = colorFor(variant, 'light');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        background: c.bg,
        color: c.fg,
        border: `${border.hairline}px solid ${c.border}`,
        borderRadius: radius.full,
        padding: `2px ${spacing.sm}px`,
        fontSize: typography.size.xs,
        fontWeight: typography.weight.medium,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const { variant } = scoreVariant(score);
  return (
    <Badge variant={variant}>
      {Math.round(score)}
      {label ? ` · ${label}` : ''}
    </Badge>
  );
}

export function RiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  return <Badge variant={riskVariant(level)}>{label ?? level}</Badge>;
}

export function ConfidenceBadge({ level, label }: { level: ConfidenceLevel; label?: string }) {
  return <Badge variant={confidenceVariant(level)}>{label ?? level.replace('_', ' ')}</Badge>;
}

export function EvidenceBadge({ count, label }: { count: number; label?: string }) {
  return (
    <Badge variant="evidence">
      {count} {label ?? 'evidence'}
    </Badge>
  );
}

export function SourceRefBadge({ count, label }: { count: number; label?: string }) {
  return (
    <Badge variant="muted">
      {count} {label ?? 'sources'}
    </Badge>
  );
}

export function ModelCostBadge({ usd, label }: { usd: number; label?: string }) {
  return (
    <Badge variant={costVariant(usd)}>
      {label ? `${label}: ` : ''}${usd.toFixed(2)}
    </Badge>
  );
}

export function DocumentStatusPill({ status, label }: { status: DocumentStatus; label?: string }) {
  return <Badge variant={documentStatusVariant(status)}>{label ?? status.replace('_', ' ')}</Badge>;
}

/* ── Tabs (controlled) ───────────────────────────────────────────────────── */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: spacing.xs, borderBottom: `${border.hairline}px solid ${line}` }}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `${border.thick}px solid ${isActive ? ink : 'transparent'}`,
              color: isActive ? ink : subtle,
              padding: `${spacing.sm}px ${spacing.md}px`,
              fontSize: typography.size.sm,
              fontWeight: isActive ? typography.weight.semibold : typography.weight.regular,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Table ───────────────────────────────────────────────────────────────── */
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}
export function Table<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div style={{ border: `${border.hairline}px solid ${line}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm }}>
        <thead>
          <tr style={{ background: canvas }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: 'start',
                  padding: spacing.md,
                  color: subtle,
                  fontWeight: typography.weight.medium,
                  borderBottom: `${border.hairline}px solid ${line}`,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: spacing.md, borderBottom: `${border.hairline}px solid ${line}`, color: ink }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── States ──────────────────────────────────────────────────────────────── */
function CenteredBlock({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.sm,
        textAlign: 'center',
        padding: spacing['3xl'],
        border: `${border.hairline}px dashed ${line}`,
        borderRadius: radius.lg,
        color: subtle,
      }}
    >
      <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: ink }}>{title}</div>
      {body ? <div style={{ maxWidth: 420 }}>{body}</div> : null}
      {action}
    </div>
  );
}
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <CenteredBlock title={title} body={body} action={action} />;
}
export function LoadingState({ label }: { label: string }) {
  return <CenteredBlock title={label} />;
}
export function ErrorState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <CenteredBlock title={title} body={body} action={action} />;
}

/* ── PermissionGate ──────────────────────────────────────────────────────── */
/**
 * Renders children only if the role holds the permission, using the SAME shared
 * RBAC matrix the API guard uses — backend permissions are never duplicated.
 */
export function PermissionGate({
  role,
  permission,
  children,
  fallback = null,
}: {
  role: WorkspaceRole | null | undefined;
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (!role || !roleHasPermission(role, permission)) return <>{fallback}</>;
  return <>{children}</>;
}

/* ── AuditEventRow ───────────────────────────────────────────────────────── */
export function AuditEventRow({ action, actor, at }: { action: string; actor: string; at: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: spacing.md,
        padding: `${spacing.sm}px 0`,
        borderBottom: `${border.hairline}px solid ${line}`,
        fontSize: typography.size.sm,
      }}
    >
      <span style={{ color: ink, fontWeight: typography.weight.medium }}>{action}</span>
      <span style={{ color: subtle }}>{actor}</span>
      <span style={{ color: subtle }}>{at}</span>
    </div>
  );
}

/* ── PageHeader ──────────────────────────────────────────────────────────── */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.lg, marginBottom: spacing.xl }}>
      <div>
        <h1 style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold, margin: 0 }}>{title}</h1>
        {subtitle ? <p style={{ color: subtle, marginTop: spacing.xs, marginBottom: 0 }}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export const palette = { ink, subtle, line, surface, canvas };
