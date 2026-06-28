import { View, Text } from 'react-native';
import { Screen, ScreenTitle, Card, Badge, colors } from '../components/ui';
import { useT } from '../lib/i18n';

/**
 * Read-only LLM settings summary (mobile is a companion app). Shows the selected
 * provider, default model and usage at a glance. Editing happens on web; values
 * populate once mobile auth + workspace selection are wired.
 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <Text style={{ color: colors.subtle }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

export default function LlmSummaryScreen() {
  const t = useT();
  return (
    <Screen>
      <ScreenTitle title={t('settings.llm')} subtitle={t('nav.settings')} />
      <Card>
        <Row label="Provider" value="—" />
        <Row label="Default model" value="—" />
        <Row label={t('label.estCost')} value="—" />
        <View style={{ marginTop: 12 }}>
          <Badge variant="muted">read-only</Badge>
        </View>
      </Card>
    </Screen>
  );
}
