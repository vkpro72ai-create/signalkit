import { View } from 'react-native';
import { Link } from 'expo-router';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { useT } from '../lib/i18n';

export default function SettingsScreen() {
  const t = useT();
  return (
    <Screen>
      <ScreenTitle title={t('nav.settings')} />
      <Card>
        <View style={{ gap: 8 }}>
          <Link href="/language" asChild>
            <Button label={t('settings.languageRegion')} variant="secondary" />
          </Link>
          <Link href="/llm" asChild>
            <Button label={t('settings.llm')} variant="secondary" />
          </Link>
        </View>
      </Card>
    </Screen>
  );
}
