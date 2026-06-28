/**
 * Root layout — providers, auth/onboarding guard, stack navigator.
 *
 * Flow:
 *  1. Providers load (auth, entitlements, onboarding, i18n)
 *  2. If onboarding not complete → /onboarding
 *  3. If not authenticated → /login
 *  4. Else → /(tabs) home
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nProvider } from '../lib/i18n';
import { AuthProvider, useAuth } from '../lib/auth';
import { EntitlementProvider } from '../lib/entitlements';
import { OnboardingProvider, useOnboarding } from '../lib/onboarding';
import { tk } from '../components/brand';

function AuthGuard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasOnboarded, isLoading: onboardLoading } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (authLoading || onboardLoading) return;

    const inOnboarding = segments[0] === 'onboarding';
    const inAuth = segments[0] === 'login' || segments[0] === 'register';
    const inApp = segments[0] === '(tabs)';

    if (!hasOnboarded && !inOnboarding) {
      router.replace('/onboarding');
      return;
    }

    if (hasOnboarded && !isAuthenticated && !inAuth && !inOnboarding) {
      router.replace('/login');
      return;
    }

    if (hasOnboarded && isAuthenticated && (inAuth || inOnboarding)) {
      router.replace('/');
      return;
    }
  }, [isAuthenticated, authLoading, hasOnboarded, onboardLoading, segments, router]);

  if (authLoading || onboardLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.color.canvas, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={tk.color.brand} />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <AuthProvider>
        <EntitlementProvider>
          <OnboardingProvider>
            <StatusBar style="dark" />
            <AuthGuard />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: tk.color.canvas },
                headerTintColor: tk.color.ink,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: tk.color.canvas },
                headerShown: false,
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="register" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen
                name="opportunity/[id]"
                options={{ headerShown: true, title: '', headerBackTitle: 'Back' }}
              />
              <Stack.Screen
                name="pack/[id]"
                options={{ headerShown: true, title: 'Product Pack', headerBackTitle: 'Back' }}
              />
              <Stack.Screen
                name="blueprint/[id]"
                options={{ headerShown: true, title: 'Build Blueprint', headerBackTitle: 'Back' }}
              />
            </Stack>
          </OnboardingProvider>
        </EntitlementProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
