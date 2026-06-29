/**
 * Expo app configuration.
 *
 * Icons/splash: replace placeholder values with real assets before release.
 *   - Replace icon.png (1024x1024)
 *   - Replace adaptive-icon.png (Android foreground)
 *   - Replace splash/image.png (splash screen)
 *
 * EAS: see eas.json for build profiles.
 * Required EAS secrets: EXPO_TOKEN (CI), GOOGLE_SERVICES_JSON_CONTENTS (Android Push)
 *
 * Local device testing: set EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000 in .env.local
 * (apk-debug.js writes this automatically by detecting the dev machine IP)
 */
import type { ExpoConfig, ConfigContext } from 'expo/config';

const IS_PRODUCTION = (process.env.EXPO_PUBLIC_ENV ?? 'development') === 'production';

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
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000',
    mockBilling: process.env.EXPO_PUBLIC_MOCK_BILLING ?? 'false',
    env: process.env.EXPO_PUBLIC_ENV ?? 'development',
    buildTimestamp: process.env.EXPO_PUBLIC_BUILD_TIMESTAMP ?? '',
    gitCommit: process.env.EXPO_PUBLIC_GIT_COMMIT ?? '',
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
    // Allow plain HTTP to local dev server. Remove before app store submission.
    usesCleartextTraffic: !IS_PRODUCTION,
  },

  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    // expo-haptics uses system APIs and needs no config plugin
    // expo-blur not actively used yet
  ],

  experiments: {
    typedRoutes: true,
  },

  updates: {
    url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID ?? '092735b2-7500-4929-9160-e72a33d03bb4'}`,
    fallbackToCacheTimeout: 0,
  },
});
