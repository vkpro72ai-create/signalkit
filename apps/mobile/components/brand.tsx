/**
 * SignalKit Mobile Brand System — premium flat 2D, React Native.
 *
 * Design law: no gradients, no neon, no cheap glassmorphism.
 * Frosted/matte effect via opacity + soft borders + shadows (not blur library).
 * Typography scale, spacing scale, score rings/bars, cards, badges, skeletons.
 */
import type { ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colorFor, scoreVariant, riskVariant, confidenceVariant, documentStatusVariant } from '@signalkit/ui';
import type { ConfidenceLevel, DocumentStatus, RiskLevel } from '@signalkit/shared';

// ─── Tokens ──────────────────────────────────────────────────────────────────

export const tk = {
  color: {
    canvas: '#F4F3EF',          // Warm off-white page background
    surface: '#FFFFFF',         // Card / panel surface
    surfaceRaised: '#FAFAF8',   // Slightly elevated surface
    surfaceOverlay: 'rgba(255,255,255,0.88)', // Matte overlay panel

    ink: '#1A1E2B',             // Primary text
    subtle: '#64748B',          // Secondary text
    muted: '#94A3B8',           // Placeholder / disabled
    faint: '#CBD5E1',           // Very light text

    brand: '#1B4332',           // Deep forest green — primary
    brandMid: '#2D6A4F',        // Medium green (hover/active)
    brandLight: '#D8EFE4',      // Light green tint
    brandFaint: '#F0FAF4',      // Faintest green tint

    line: '#E4E7EC',            // Standard border
    lineMid: '#CBD5E1',         // Stronger border
    lineStrong: '#94A3B8',      // Strongest border

    // Semantic
    opportunity: '#0B3D2E',
    opportunityBg: '#E6F4EE',
    opportunityBorder: '#9FD3BE',

    confidence: '#1B3A66',
    confidenceBg: '#E7EFFA',
    confidenceBorder: '#A9C4E8',

    warning: '#6B4E07',
    warningBg: '#FBF1D9',
    warningBorder: '#E6CE8C',

    risk: '#6A1B1B',
    riskBg: '#FBE9E9',
    riskBorder: '#E2A6A6',

    muted2: '#5A626E',
    mutedBg: '#F4F6F8',
    mutedBorder: '#DDE2E8',

    success: '#14532D',
    successBg: '#DCFCE7',
    successBorder: '#86EFAC',
  },

  space: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 48,
    huge: 64,
  },

  radius: {
    xs: 4,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },

  font: {
    // Display
    d1: { fontSize: 36, fontWeight: '700' as const, letterSpacing: -0.5 },
    d2: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },

    // Heading
    h1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.2 },
    h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.1 },
    h3: { fontSize: 17, fontWeight: '600' as const },
    h4: { fontSize: 15, fontWeight: '600' as const },

    // Body
    body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
    bodyMd: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    bodySm: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },

    // Label
    labelLg: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.2 },
    label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.3 },
    labelSm: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const },

    // Number/score
    scoreLg: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -1 },
    scoreMd: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.5 },
    scoreSm: { fontSize: 18, fontWeight: '700' as const },
  },

  shadow: {
    none: {},
    xs: Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
      android: { elevation: 1 },
      default: {},
    }),
    sm: Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
      default: {},
    }),
    md: Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 4 },
      default: {},
    }),
  },
} as const;

// ─── Surface (matte/frosted glass via opacity) ────────────────────────────────

export function Surface({
  children,
  style,
  matte = false,
}: {
  children: ReactNode;
  style?: ViewStyle;
  matte?: boolean;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: matte ? tk.color.surfaceOverlay : tk.color.surface,
          borderColor: tk.color.line,
          borderWidth: 1,
          borderRadius: tk.radius.lg,
          padding: tk.space.base,
          ...(tk.shadow.sm as ViewStyle),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Screen wrapper ───────────────────────────────────────────────────────────

export function Screen({
  children,
  style,
  noPad = false,
}: {
  children: ReactNode;
  style?: ViewStyle;
  noPad?: boolean;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={[
        { paddingHorizontal: noPad ? 0 : tk.space.base, paddingTop: tk.space.lg, paddingBottom: tk.space.huge },
        style,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function SafeScreen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flex: 1, backgroundColor: tk.color.canvas }, style]}>
      {children}
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  onPress,
  pressed: _pressed,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  pressed?: boolean;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardBase,
          pressed && { opacity: 0.88, transform: [{ scale: 0.995 }] },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[cardBase, style]}>{children}</View>;
}

const cardBase: ViewStyle = {
  backgroundColor: tk.color.surface,
  borderColor: tk.color.line,
  borderWidth: 1,
  borderRadius: tk.radius.lg,
  padding: tk.space.base,
  ...(tk.shadow.xs as ViewStyle),
};

export function HeroCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: tk.color.brandFaint,
          borderColor: tk.color.brandLight,
          borderWidth: 1.5,
          borderRadius: tk.radius.xl,
          padding: tk.space.xl,
          ...(tk.shadow.sm as ViewStyle),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Typography ───────────────────────────────────────────────────────────────

export function Display({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[tk.font.d2, { color: tk.color.ink }, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[tk.font.h1, { color: tk.color.ink }, style]}>{children}</Text>;
}

export function Subheading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[tk.font.h3, { color: tk.color.ink }, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[tk.font.body, { color: tk.color.subtle }, style]}>{children}</Text>;
}

export function Caption({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[tk.font.labelSm, { color: tk.color.muted }, style]}>{children}</Text>;
}

export function Label({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[tk.font.label, { color: tk.color.subtle }, style]}>{children}</Text>;
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  size = 'md',
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}) {
  const bg: Record<ButtonVariant, string> = {
    primary: tk.color.brand,
    secondary: tk.color.surface,
    ghost: 'transparent',
    danger: tk.color.riskBg,
  };
  const border: Record<ButtonVariant, string> = {
    primary: tk.color.brand,
    secondary: tk.color.line,
    ghost: 'transparent',
    danger: tk.color.riskBorder,
  };
  const fg: Record<ButtonVariant, string> = {
    primary: '#FFFFFF',
    secondary: tk.color.ink,
    ghost: tk.color.brand,
    danger: tk.color.risk,
  };

  const heights: Record<string, number> = { sm: 36, md: 48, lg: 54 };
  const fontSizes: Record<string, number> = { sm: 13, md: 15, lg: 16 };

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: heights[size],
          backgroundColor: disabled ? tk.color.mutedBg : bg[variant],
          borderColor: disabled ? tk.color.line : border[variant],
          borderWidth: 1.5,
          borderRadius: tk.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: tk.space.xl,
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} size="small" />
      ) : (
        <Text
          style={{
            color: disabled ? tk.color.muted : fg[variant],
            fontSize: fontSizes[size],
            fontWeight: '600',
            letterSpacing: 0.1,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  size = 40,
  bg = tk.color.brandLight,
}: {
  icon: string;
  onPress?: () => void;
  size?: number;
  bg?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: size * 0.45 }}>{icon}</Text>
    </Pressable>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

type BadgeSize = 'sm' | 'md';

export function Badge({
  variant,
  children,
  size = 'md',
}: {
  variant: Parameters<typeof colorFor>[0];
  children: ReactNode;
  size?: BadgeSize;
}) {
  const c = colorFor(variant, 'light');
  const pad = size === 'sm' ? { paddingVertical: 2, paddingHorizontal: 8 } : { paddingVertical: 4, paddingHorizontal: 10 };
  return (
    <View
      style={[
        { backgroundColor: c.bg, borderColor: c.border, borderWidth: 1, borderRadius: tk.radius.full, alignSelf: 'flex-start' },
        pad,
      ]}
    >
      <Text style={{ color: c.fg, fontSize: size === 'sm' ? 11 : 12, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const { variant } = scoreVariant(score);
  return (
    <Badge variant={variant}>
      {Math.round(score)}{label ? ` · ${label}` : ''}
    </Badge>
  );
}

export function RiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  return <Badge variant={riskVariant(level)}>{label ?? level}</Badge>;
}

export function ConfidenceBadge({ level, label }: { level: ConfidenceLevel; label?: string }) {
  return <Badge variant={confidenceVariant(level)}>{label ?? level.replace(/_/g, ' ')}</Badge>;
}

export function DocumentStatusPill({ status, label }: { status: DocumentStatus; label?: string }) {
  return <Badge variant={documentStatusVariant(status)}>{label ?? status.replace(/_/g, ' ')}</Badge>;
}

export function PlanBadge({ plan }: { plan: 'free' | 'pro' | 'team' }) {
  const v = plan === 'free' ? 'muted' : plan === 'pro' ? 'confidence' : 'opportunity';
  return <Badge variant={v as Parameters<typeof colorFor>[0]}>{plan.toUpperCase()}</Badge>;
}

// ─── Score Ring (no SVG — uses layered circles) ───────────────────────────────

export function ScoreRing({
  score,
  size = 64,
  label,
}: {
  score: number | null;
  size?: number;
  label?: string;
}) {
  const { variant } = score !== null ? scoreVariant(score) : { variant: 'muted' as const };
  const c = colorFor(variant as Parameters<typeof colorFor>[0], 'light');
  const borderW = size * 0.075;

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: borderW,
          borderColor: c.border,
          backgroundColor: c.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size * 0.32, fontWeight: '700', color: c.fg, letterSpacing: -1 }}>
          {score !== null ? Math.round(score) : '—'}
        </Text>
      </View>
      {label ? (
        <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

export function ScoreBar({
  score,
  label,
  showValue = true,
}: {
  score: number | null;
  label?: string;
  showValue?: boolean;
}) {
  const { variant } = score !== null ? scoreVariant(score) : { variant: 'muted' as const };
  const c = colorFor(variant as Parameters<typeof colorFor>[0], 'light');
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;

  return (
    <View style={{ gap: 4 }}>
      {(label || showValue) ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {label ? <Text style={{ fontSize: 12, fontWeight: '600', color: tk.color.subtle }}>{label}</Text> : <View />}
          {showValue && score !== null ? (
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.fg }}>{Math.round(score)}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ height: 6, backgroundColor: tk.color.mutedBg, borderRadius: tk.radius.full, overflow: 'hidden' }}>
        <View
          style={{
            height: 6,
            width: `${pct}%`,
            backgroundColor: c.border,
            borderRadius: tk.radius.full,
          }}
        />
      </View>
    </View>
  );
}

// ─── Score Grid (4 scores) ───────────────────────────────────────────────────

export function ScoreGrid({
  opportunity,
  confidence,
  ventureScale,
  buildReadiness,
}: {
  opportunity?: number | null;
  confidence?: number | null;
  ventureScale?: number | null;
  buildReadiness?: number | null;
}) {
  const scores = [
    { score: opportunity ?? null, label: 'Opportunity' },
    { score: confidence !== undefined && confidence !== null ? Math.round(confidence * 100) : null, label: 'Confidence' },
    { score: ventureScale ?? null, label: 'Venture' },
    { score: buildReadiness ?? null, label: 'Build' },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: tk.space.sm }}>
      {scores.map((s) => (
        <View key={s.label} style={{ flex: 1, alignItems: 'center' }}>
          <ScoreRing score={s.score} size={52} label={s.label} />
        </View>
      ))}
    </View>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 7,
          paddingHorizontal: 14,
          borderRadius: tk.radius.full,
          borderWidth: 1.5,
          backgroundColor: selected ? tk.color.brand : tk.color.surface,
          borderColor: selected ? tk.color.brand : tk.color.line,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {icon ? <Text style={{ fontSize: 14 }}>{icon}</Text> : null}
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: selected ? '#FFF' : tk.color.ink,
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tk.space.sm }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.subtle, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: tk.color.brand }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── List Row ────────────────────────────────────────────────────────────────

export function ListRow({
  title,
  subtitle,
  badge,
  icon,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  icon?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tk.space.md, paddingVertical: 12 }}>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: tk.color.brandFaint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: tk.color.ink }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 13, color: tk.color.subtle, marginTop: 1 }}>{subtitle}</Text> : null}
        {badge ? <View style={{ marginTop: 4 }}>{badge}</View> : null}
      </View>
      {right ?? (onPress ? <Text style={{ color: tk.color.muted, fontSize: 18 }}>›</Text> : null)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

export function Skeleton({ width, height, radius }: { width?: number | string; height?: number; radius?: number }) {
  return (
    <View
      style={{
        width: (width as number) ?? '100%',
        height: height ?? 16,
        borderRadius: radius ?? tk.radius.sm,
        backgroundColor: tk.color.line,
        opacity: 0.6,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <Card style={{ gap: 10 }}>
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} />
      <Skeleton height={14} width="80%" />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Skeleton height={24} width={60} radius={tk.radius.full} />
        <Skeleton height={24} width={60} radius={tk.radius.full} />
      </View>
    </Card>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: tk.space.xxxl, gap: tk.space.md }}>
      {icon ? <Text style={{ fontSize: 40 }}>{icon}</Text> : null}
      <Text style={{ fontSize: 17, fontWeight: '700', color: tk.color.ink, textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ fontSize: 14, color: tk.color.subtle, textAlign: 'center', lineHeight: 20 }}>{body}</Text> : null}
      {action && onAction ? (
        <Button label={action} onPress={onAction} style={{ marginTop: 4 }} />
      ) : null}
    </View>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: tk.space.xxxl, gap: tk.space.md }}>
      <Text style={{ fontSize: 28 }}>⚠️</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: tk.color.ink, textAlign: 'center' }}>{message}</Text>
      {onRetry ? <Button label="Retry" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: tk.color.line, marginVertical: tk.space.md }, style]} />;
}

// ─── Spacer ───────────────────────────────────────────────────────────────────

export function Spacer({ h = 16 }: { h?: number }) {
  return <View style={{ height: h }} />;
}

// ─── Status Dot ───────────────────────────────────────────────────────────────

export function StatusDot({ status }: { status: 'ready' | 'processing' | 'failed' | 'queued' | 'expired' }) {
  const colors: Record<string, string> = {
    ready: tk.color.success,
    processing: '#3B82F6',
    failed: tk.color.risk,
    queued: tk.color.muted,
    expired: tk.color.muted,
  };
  return (
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[status] ?? tk.color.muted }} />
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 36 }: { name?: string | null; size?: number }) {
  const initials = name
    ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tk.color.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: '#FFF' }}>{initials}</Text>
    </View>
  );
}

// ─── Paywall Lock Overlay ─────────────────────────────────────────────────────

export function PaywallGate({
  children,
  locked,
  onUnlock,
}: {
  children: ReactNode;
  locked: boolean;
  onUnlock?: () => void;
}) {
  if (!locked) return <>{children}</>;
  return (
    <Pressable onPress={onUnlock} style={{ position: 'relative' }}>
      <View style={{ opacity: 0.3, pointerEvents: 'none' }}>{children}</View>
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 22 }}>🔒</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.brand }}>Pro feature</Text>
      </View>
    </Pressable>
  );
}

// ─── Re-export for backward compat with existing ui.tsx imports ───────────────
// Keep the old components/ui.tsx imports working by not removing it.
