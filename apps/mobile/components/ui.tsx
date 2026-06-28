/**
 * Mobile UI primitives — premium flat 2D, React Native. Same semantic presenters
 * as web (@signalkit/ui) so a badge means the same thing on both platforms; only
 * the rendering primitives differ.
 */
import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import {
  colorFor,
  scoreVariant,
  riskVariant,
  confidenceVariant,
  documentStatusVariant,
  type SemanticColor,
} from '@signalkit/ui';
import type { ConfidenceLevel, DocumentStatus, RiskLevel } from '@signalkit/shared';

export const colors = {
  ink: '#1B1F24',
  subtle: '#5A626E',
  line: '#E2E6EB',
  surface: '#FFFFFF',
  canvas: '#FBFCFD',
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary' }: { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' }) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPrimary ? colors.ink : colors.surface,
          borderColor: isPrimary ? colors.ink : colors.line,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: isPrimary ? '#FFFFFF' : colors.ink, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ variant, children }: { variant: SemanticColor; children: ReactNode }) {
  const c = colorFor(variant, 'light');
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '500' }}>{children}</Text>
    </View>
  );
}

export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  return (
    <Badge variant={scoreVariant(score).variant}>
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
export function DocumentStatusPill({ status, label }: { status: DocumentStatus; label?: string }) {
  return <Badge variant={documentStatusVariant(status)}>{label ?? status.replace('_', ' ')}</Badge>;
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 16, marginBottom: 4 }}>{title}</Text>
      {body ? <Text style={{ color: colors.subtle, textAlign: 'center' }}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  screenContent: { padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 14, color: colors.subtle, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 16 },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  badge: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', borderRadius: 10 },
});
