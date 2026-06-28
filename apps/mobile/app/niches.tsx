import { View } from 'react-native';
import { Link } from 'expo-router';
import { Screen, ScreenTitle, Card, ScoreBadge, RiskBadge, ConfidenceBadge, Button } from '../components/ui';
import { Text } from 'react-native';
import { useT } from '../lib/i18n';

export default function NichesScreen() {
  const t = useT();
  return (
    <Screen>
      <ScreenTitle title={t('nav.niches')} subtitle={t('pipeline.niches')} />
      <Card>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#1B1F24', marginBottom: 8 }}>
          Clinic WhatsApp AI sales copilot
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <ScoreBadge score={78} label={t('score.band.strong')} />
          <ConfidenceBadge level="medium" label={t('label.confidence')} />
          <RiskBadge level="medium" label={t('label.risk')} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Link href="/niches/demo" asChild>
            <Button label={t('action.viewEvidence')} variant="secondary" />
          </Link>
        </View>
      </Card>
    </Screen>
  );
}
