/**
 * Settings tab — account, workspace, language, subscription, logout.
 */
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useEntitlements } from '../../lib/entitlements';
import { useI18n } from '../../lib/i18n';
import { impact } from '../../lib/haptics';
import {
  tk, Card, Divider, Avatar, PlanBadge, ListRow, SectionHeader,
} from '../../components/brand';
import type { LocaleCode } from '@signalkit/shared';

const LOCALES: Array<{ code: LocaleCode; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ru', label: 'Russian', native: 'Русский' },
  { code: 'tr', label: 'Turkish', native: 'Türkçe' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia' },
];

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { plan } = useEntitlements();
  const { locale, setLocale } = useI18n();
  const [showLocales, setShowLocales] = useState(false);

  const ws = user?.workspaces?.[0];

  async function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await impact();
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 64 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ paddingTop: 64, paddingHorizontal: tk.space.base, paddingBottom: tk.space.lg }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.4 }}>Settings</Text>
      </View>

      <View style={{ paddingHorizontal: tk.space.base, gap: tk.space.xl }}>

        {/* Account */}
        <View>
          <SectionHeader title="Account" />
          <Card style={{ gap: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }}>
              <Avatar name={user?.name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: tk.color.ink }}>
                  {user?.name ?? 'User'}
                </Text>
                <Text style={{ fontSize: 13, color: tk.color.subtle }}>{user?.email}</Text>
              </View>
              <PlanBadge plan={plan} />
            </View>
          </Card>
        </View>

        {/* Workspace */}
        {ws && (
          <View>
            <SectionHeader title="Workspace" />
            <Card style={{ gap: 0 }}>
              <ListRow
                icon="🏢"
                title={ws.name}
                subtitle={`Role: ${ws.role}`}
              />
            </Card>
          </View>
        )}

        {/* Subscription */}
        <View>
          <SectionHeader title="Subscription" />
          <Card style={{ gap: 0 }}>
            <ListRow
              icon="⭐"
              title={plan === 'free' ? 'Free plan' : plan === 'pro' ? 'Pro plan' : 'Team plan'}
              subtitle={plan === 'free' ? 'Limited exports · Basic packs' : 'All exports · Full packs · Multi-market'}
              onPress={() => { impact(); router.push('/paywall'); }}
            />
            {plan === 'free' && (
              <>
                <Divider style={{ marginVertical: 0 }} />
                <Pressable
                  onPress={() => { impact(); router.push('/paywall'); }}
                  style={{ paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.brand }}>Upgrade to Pro →</Text>
                </Pressable>
              </>
            )}
          </Card>
        </View>

        {/* Language */}
        <View>
          <SectionHeader
            title="Language"
            action={showLocales ? 'Done' : 'Change'}
            onAction={() => setShowLocales((v) => !v)}
          />
          <Card style={{ gap: 0 }}>
            <ListRow
              icon="🌐"
              title="Interface language"
              subtitle={LOCALES.find((l) => l.code === locale)?.native ?? locale}
              onPress={() => setShowLocales((v) => !v)}
            />
            {showLocales && (
              <>
                <Divider style={{ marginVertical: 0 }} />
                <View style={{ paddingVertical: 8, gap: 0 }}>
                  {LOCALES.map((l, i) => (
                    <View key={l.code}>
                      <Pressable
                        onPress={() => { setLocale(l.code); impact(); }}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 12,
                          paddingHorizontal: 4,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View>
                          <Text style={{ fontSize: 15, fontWeight: locale === l.code ? '700' : '500', color: tk.color.ink }}>
                            {l.native}
                          </Text>
                          {l.native !== l.label && (
                            <Text style={{ fontSize: 12, color: tk.color.subtle }}>{l.label}</Text>
                          )}
                        </View>
                        {locale === l.code && (
                          <Text style={{ fontSize: 16, color: tk.color.brand, fontWeight: '700' }}>✓</Text>
                        )}
                      </Pressable>
                      {i < LOCALES.length - 1 && <Divider style={{ marginVertical: 0 }} />}
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>
        </View>

        {/* Product */}
        <View>
          <SectionHeader title="Product" />
          <Card style={{ gap: 0 }}>
            <ListRow
              icon="🌍"
              title="Web app"
              subtitle="Full editing, source ingestion, LLM config"
            />
            <Divider style={{ marginVertical: 0 }} />
            <ListRow
              icon="📋"
              title="Export Center"
              subtitle="Generate and download PDFs, bundles, briefs"
              onPress={() => router.push('/exports')}
            />
          </Card>
        </View>

        {/* Dev */}
        {process.env.NODE_ENV === 'development' && (
          <View>
            <SectionHeader title="Developer" />
            <Card style={{ gap: 0 }}>
              <View style={{ paddingVertical: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: tk.color.warning }}>DEV MODE</Text>
                <Text style={{ fontSize: 12, color: tk.color.subtle, marginTop: 2 }}>
                  API: {process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'}
                </Text>
                <Text style={{ fontSize: 12, color: tk.color.subtle }}>
                  Mock billing: {process.env.EXPO_PUBLIC_MOCK_BILLING ?? 'false'}
                </Text>
              </View>
            </Card>
          </View>
        )}

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => ({
            paddingVertical: 16,
            alignItems: 'center',
            borderRadius: tk.radius.md,
            borderWidth: 1,
            borderColor: tk.color.riskBorder,
            backgroundColor: tk.color.riskBg,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.risk }}>Sign out</Text>
        </Pressable>

        <Text style={{ fontSize: 11, color: tk.color.muted, textAlign: 'center' }}>
          SignalKit v0.2.0 · Evidence-backed product intelligence
        </Text>
      </View>
    </ScrollView>
  );
}
