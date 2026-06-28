import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, ScreenTitle, Card, Badge, colors } from '../../components/ui';
import { useT } from '../../lib/i18n';

/**
 * Read-only niche detail (companion app). Four scores are shown as SEPARATE
 * values — Opportunity, Confidence, Venture Scale and Build Readiness — plus a
 * Venture Thesis summary and key kill reasons. The full breakdowns, Build
 * Blueprint and market comparison live on web (do not overbuild mobile). Values
 * populate once mobile auth + a selected workspace are wired.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.subtle, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

export default function NicheDetailScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <ScreenTitle title={t('pipeline.niches')} subtitle={String(id)} />
      <Card>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Stat label={t('label.score')} value="—" />
          <Stat label={t('label.confidence')} value="—" />
        </View>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
          <Stat label="Venture scale" value="—" />
          <Stat label="Build readiness" value="—" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Badge variant="muted">read-only</Badge>
          <Badge variant="evidence">{t('label.evidence')}</Badge>
        </View>
      </Card>

      <Card>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>Venture thesis</Text>
        <Text style={{ color: colors.subtle, fontSize: 12 }}>
          Breakout thesis, entry wedge, expansion path and venture-scale narrative are summarized here.
          Venture scale is potential, not a guarantee — no fabricated market size.
        </Text>
      </Card>

      <Card>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>Kill reasons & assumptions</Text>
        <Text style={{ color: colors.subtle, fontSize: 12 }}>
          The weakest assumptions and what must be true to validate the opportunity.
          Assumptions are not facts; unresolved questions stay open.
        </Text>
      </Card>

      <Text style={{ color: colors.subtle, fontSize: 12 }}>
        Full score breakdowns, the Venture Thesis detail, the Build Blueprint and market comparison are available on the web app.
      </Text>
    </Screen>
  );
}
