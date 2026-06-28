/**
 * Expo app configuration — production-ready.
 *
 * Icons/splash: replace placeholder values with real assets before release.
 *   - Replace icon.png (1024x1024)
 *   - Replace adaptive-icon.png (Android foreground)
 *   - Replace splash/image.png (splash screen)
 *
 * EAS: see eas.json for build profiles.
 * Required EAS secrets: EXPO_TOKEN (CI), GOOGLE_SERVICES_JSON_CONTENTS (Android Push)
 */
import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SignalKit',
  slug: 'signalkit',
  version: '0.2.0',
  runtimeVersion: { policy: 'appVersion' },
  orientation: 'portrait',
  scheme: 'signalkit',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    mockBilling: process.env.EXPO_PUBLIC_MOCK_BILLING ?? 'false',
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '092735b2-7500-4929-9160-e72a33d03bb4',
    },
  },

  splash: {
    resizeMode: 'contain',
    backgroundColor: '#F4F3EF',
  },

  assetBundlePatterns: ['**/*'],

  ios: {
    bundleIdentifier: 'com.signalkit.app',
    supportsTablet: true,
    requireFullScreen: false,
    buildNumber: '1',
  },

  android: {
    package: 'com.signalkit.app',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#F4F3EF',
    },
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
    ],
  },

  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },

  plugins: [
    'expo-router',
    // TODO(session-16): add expo-secure-store, expo-haptics when installed
    // 'expo-secure-store',
    // 'expo-haptics',
    // 'expo-blur',
  ],

  experiments: {
    typedRoutes: true,
  },

  updates: {
    url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID ?? '092735b2-7500-4929-9160-e72a33d03bb4'}`,
    fallbackToCacheTimeout: 0,
  },
});
