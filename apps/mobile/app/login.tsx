/**
 * Login screen — email/password auth against backend JWT.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../lib/auth';
import { ApiException } from '../lib/api';
import { tk, Button, Spacer } from '../components/brand';

const IS_DEV = (process.env.EXPO_PUBLIC_ENV ?? 'development') !== 'production';

export default function Login() {
  const router = useRouter();
  const { login, loginDemo } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiException
          ? err.message
          : 'Something went wrong. Check your connection.',
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDemo() {
    loginDemo();
    router.replace('/');
  }

  return (
    // 'padding' on both platforms avoids the Android height-reduction loop that
    // causes infinite layout re-measurements when combined with flexGrow + center.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 80,
          paddingBottom: 56,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Brand */}
        <View style={{ marginBottom: 40 }}>
          <View style={{
            width: 52, height: 52, borderRadius: 14,
            backgroundColor: tk.color.brand,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF' }}>S</Text>
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5 }}>
            Welcome back
          </Text>
          <Text style={{ fontSize: 15, color: tk.color.subtle, marginTop: 6 }}>
            Sign in to your SignalKit workspace.
          </Text>
        </View>

        {/* Error */}
        {error && (
          <View style={{
            backgroundColor: tk.color.riskBg,
            borderColor: tk.color.riskBorder,
            borderWidth: 1,
            borderRadius: tk.radius.md,
            padding: 12,
            marginBottom: 16,
          }}>
            <Text style={{ color: tk.color.risk, fontSize: 14, fontWeight: '500' }}>{error}</Text>
          </View>
        )}

        {/* Fields */}
        <View style={{ gap: 12 }}>
          <View>
            <Text style={labelStyle}>EMAIL</Text>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              placeholderTextColor={tk.color.muted}
              returnKeyType="next"
            />
          </View>

          <View>
            <Text style={labelStyle}>PASSWORD</Text>
            <TextInput
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="••••••••"
              placeholderTextColor={tk.color.muted}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>
        </View>

        <Spacer h={24} />

        <Button
          label="Sign in"
          onPress={handleLogin}
          loading={loading}
          disabled={!email.trim() || !password}
          size="lg"
        />

        <Spacer h={20} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          <Text style={{ fontSize: 14, color: tk.color.subtle }}>No account?</Text>
          <Link href="/register" asChild>
            <Pressable>
              <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.brand }}>Create one</Text>
            </Pressable>
          </Link>
        </View>

        {/* Dev diagnostics + demo mode — visible in non-production builds only */}
        {IS_DEV && (
          <>
            <Spacer h={40} />
            <View style={{
              borderRadius: tk.radius.md,
              borderWidth: 1,
              borderColor: tk.color.warningBorder,
              backgroundColor: tk.color.warningBg,
              padding: 12,
              gap: 4,
            }}>
              <Text style={{ fontSize: 12, color: tk.color.warning, fontWeight: '700' }}>
                DEV BUILD
              </Text>
              <Text style={{ fontSize: 11, color: tk.color.warning }}>
                API: {process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000'}
              </Text>
              {process.env.EXPO_PUBLIC_GIT_COMMIT ? (
                <Text style={{ fontSize: 11, color: tk.color.warning }}>
                  Commit: {process.env.EXPO_PUBLIC_GIT_COMMIT} · {process.env.EXPO_PUBLIC_BUILD_TIMESTAMP?.slice(0, 16).replace('T', ' ')}
                </Text>
              ) : null}
            </View>
            <Spacer h={12} />
            <Pressable
              onPress={handleDemo}
              style={({ pressed }) => ({
                paddingVertical: 12,
                alignItems: 'center',
                borderRadius: tk.radius.md,
                borderWidth: 1,
                borderColor: tk.color.warningBorder,
                backgroundColor: pressed ? tk.color.warningBg : 'transparent',
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: tk.color.warning }}>
                ⚠ Demo Mode — bypass auth (dev only)
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: '600' as const,
  color: tk.color.subtle,
  marginBottom: 6,
  letterSpacing: 0.3,
};

const inputStyle = {
  height: 48,
  backgroundColor: tk.color.surface,
  borderColor: tk.color.line,
  borderWidth: 1.5,
  borderRadius: tk.radius.md,
  paddingHorizontal: 14,
  fontSize: 15,
  color: tk.color.ink,
};
