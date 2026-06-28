import { View } from 'react-native';
import { Link } from 'expo-router';
import { Screen, ScreenTitle, Card, EmptyState, Button } from '../components/ui';
import { useT } from '../lib/i18n';

export default function ProjectsScreen() {
  const t = useT();
  return (
    <Screen>
      <ScreenTitle title={t('nav.projects')} subtitle={t('app.tagline')} />
      <Card>
        <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
      </Card>
      <View style={{ gap: 8 }}>
        <Link href="/market" asChild>
          <Button label={t('action.newProject')} />
        </Link>
        <Link href="/niches" asChild>
          <Button label={t('nav.niches')} variant="secondary" />
        </Link>
        <Link href="/pack" asChild>
          <Button label={t('nav.pack')} variant="secondary" />
        </Link>
        <Link href="/exports" asChild>
          <Button label={t('nav.exports')} variant="secondary" />
        </Link>
        <Link href="/settings" asChild>
          <Button label={t('nav.settings')} variant="secondary" />
        </Link>
      </View>
    </Screen>
  );
}
