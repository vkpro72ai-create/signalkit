/**
 * Register screen — create account via backend /auth/register.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../lib/auth';
import { ApiException } from '../lib/api';
import { tk, Button, Spacer } from '../components/brand';

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await register(email.trim().toLowerCase(), password, name.trim() || undefined);
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

  const isValid = email.trim().length > 0 && password.length >= 8;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingVertical: 48,
        }}
        keyboardShouldPersistTaps="handled"
      >
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
            Create account
          </Text>
          <Text style={{ fontSize: 15, color: tk.color.subtle, marginTop: 6 }}>
            Start your SignalKit workspace today.
          </Text>
        </View>

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

        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: tk.color.subtle, marginBottom: 6, letterSpacing: 0.3 }}>
              NAME (optional)
            </Text>
            <TextInput
              style={inputStyle}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={tk.color.muted}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: tk.color.subtle, marginBottom: 6, letterSpacing: 0.3 }}>
              EMAIL
            </Text>
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
            <Text style={{ fontSize: 12, fontWeight: '600', color: tk.color.subtle, marginBottom: 6, letterSpacing: 0.3 }}>
              PASSWORD (min 8 chars)
            </Text>
            <TextInput
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="••••••••"
              placeholderTextColor={tk.color.muted}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />
          </View>
        </View>

        <Spacer h={24} />

        <Button
          label="Create account"
          onPress={handleRegister}
          loading={loading}
          disabled={!isValid}
          size="lg"
        />

        <Spacer h={8} />
        <Text style={{ fontSize: 12, color: tk.color.muted, textAlign: 'center', lineHeight: 18 }}>
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </Text>

        <Spacer h={20} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          <Text style={{ fontSize: 14, color: tk.color.subtle }}>Already have an account?</Text>
          <Link href="/login" asChild>
            <Pressable>
              <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.brand }}>Sign in</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
