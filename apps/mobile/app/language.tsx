import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Screen, ScreenTitle, Card, Badge, Button, colors } from '../components/ui';
import { useI18n } from '../lib/i18n';
import type { LocaleCode } from '@signalkit/i18n';

const LOCALE_LABEL: Record<LocaleCode, string> = {
  en: 'English', ru: 'Русский', tr: 'Türkçe', de: 'Deutsch', es: 'Español',
  fr: 'Français', pt: 'Português', ar: 'العربية', hi: 'हिन्दी', id: 'Bahasa Indonesia',
};

export default function LanguageScreen() {
  const { t, locale, setLocale, locales } = useI18n();
  // Consent is local until mobile auth + sync land; privacy stance is identical to web.
  const [consent, setConsent] = useState<'unknown' | 'granted' | 'revoked'>('unknown');

  return (
    <Screen>
      <ScreenTitle title={t('settings.languageRegion')} subtitle={t('settings.interfaceLanguage')} />
      <Card>
        {locales.map((l) => {
          const active = l === locale;
          return (
            <Pressable
              key={l}
              onPress={() => setLocale(l)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}
            >
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: active ? '600' : '400' }}>{LOCALE_LABEL[l]}</Text>
              {active ? <Text style={{ color: colors.ink }}>✓</Text> : <View />}
            </Pressable>
          );
        })}
      </Card>

      <ScreenTitle title={t('settings.region')} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: colors.ink }}>Current location permission</Text>
          <Badge variant={consent === 'granted' ? 'success' : 'muted'}>{consent}</Badge>
        </View>
        <Text style={{ color: colors.subtle, fontSize: 12, marginTop: 6 }}>
          Used only with consent. Stores at most your country — never precise coordinates.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button label="Enable (country-level)" variant="secondary" onPress={() => setConsent('granted')} />
          <Button label="Clear" variant="secondary" onPress={() => setConsent('revoked')} />
        </View>
      </Card>
    </Screen>
  );
}
