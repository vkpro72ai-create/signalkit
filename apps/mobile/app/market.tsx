import { useState } from 'react';
import { Text, Pressable } from 'react-native';
import { MARKET_SCOPES, type MarketScope } from '@signalkit/shared';
import { Screen, ScreenTitle, Card, colors } from '../components/ui';
import { useT } from '../lib/i18n';

const LABELS: Record<MarketScope, string> = {
  current_location: 'Use my current location',
  country_of_residence: 'Use my country of residence',
  manual_country: 'Choose another country',
  manual_region: 'Choose a region',
  multi_country: 'Compare several markets',
  global: 'Global opportunity search',
};

/** Market Selector — the market step of the New Project flow on mobile. */
export default function MarketScreen() {
  const t = useT();
  const [scope, setScope] = useState<MarketScope>('global');
  return (
    <Screen>
      <ScreenTitle title={t('pipeline.market')} subtitle={t('market.compare')} />
      <Card>
        {MARKET_SCOPES.map((s) => {
          const active = s === scope;
          return (
            <Pressable
              key={s}
              onPress={() => setScope(s)}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}
            >
              <Text style={{ color: colors.ink, fontWeight: active ? '600' : '400' }}>
                {active ? '● ' : '○ '}
                {LABELS[s]}
              </Text>
            </Pressable>
          );
        })}
      </Card>
      <Text style={{ color: colors.subtle, fontSize: 12 }}>
        Current-location search needs consent; you can always pick a market manually or go global.
      </Text>
    </Screen>
  );
}
