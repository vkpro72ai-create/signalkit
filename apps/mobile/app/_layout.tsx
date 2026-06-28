import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nProvider } from '../lib/i18n';

export default function RootLayout() {
  return (
    <I18nProvider>
      <StatusBar style="auto" />
      {/* Flat 2D: in-screen titles, solid surfaces, no gradients. */}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FBFCFD' },
          headerTintColor: '#1B1F24',
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#FBFCFD' },
          headerShown: false,
        }}
      />
    </I18nProvider>
  );
}
