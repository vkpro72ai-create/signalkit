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

const IS_DEV = (process.env.EXPO_PUBLIC_ENV ?? 'development') !== 'production';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';
const GIT_COMMIT = process.env.EXPO_PUBLIC_GIT_COMMIT ?? 'unknown';
const BUILD_TS = process.env.EXPO_PUBLIC_BUILD_TIMESTAMP ?? '';
const APP_VERSION = '0.2.0';

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
  const { plan, backendPlan: plan_debug } = useEntitlements();
  const { locale, setLocale } = useI18n();
  const { isDemo, loginDemo } = useAuth();
  const [showLocales, setShowLocales] = useState(false);
  const [showBuildInfo, setShowBuildInfo] = useState(false);

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

        {/* Build Info — always visible so the installed APK is identifiable */}
        <View>
          <Pressable
            onPress={() => setShowBuildInfo((v) => !v)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: tk.color.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Build Info
            </Text>
            <Text style={{ fontSize: 12, color: tk.color.muted }}>{showBuildInfo ? '▲' : '▼'}</Text>
          </Pressable>
          {showBuildInfo && (
            <Card style={{ gap: 6 }}>
              <InfoRow label="Version" value={`v${APP_VERSION}`} />
              <InfoRow label="Commit" value={GIT_COMMIT} mono />
              <InfoRow
                label="Built"
                value={BUILD_TS ? BUILD_TS.slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown'}
              />
              <InfoRow label="API URL" value={API_URL} mono />
              <InfoRow
                label="Environment"
                value={process.env.EXPO_PUBLIC_ENV ?? 'development'}
              />
              <InfoRow label="Email" value={user?.email ?? '—'} />
              <InfoRow label="Role" value={ws?.role ?? '—'} />
              <InfoRow label="Backend plan" value={plan_debug} mono />
              <InfoRow label="Mobile plan" value={plan} />
              <InfoRow
                label="Mock billing"
                value={process.env.EXPO_PUBLIC_MOCK_BILLING ?? 'false'}
              />
              {isDemo && (
                <View style={{
                  marginTop: 4, paddingVertical: 6, paddingHorizontal: 10,
                  borderRadius: tk.radius.sm,
                  backgroundColor: tk.color.warningBg,
                  borderWidth: 1, borderColor: tk.color.warningBorder,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: tk.color.warning }}>
                    ⚠ DEMO MODE — no real auth
                  </Text>
                </View>
              )}
            </Card>
          )}
        </View>

        {/* Developer tools — non-production builds only */}
        {IS_DEV && (
          <View>
            <SectionHeader title="Developer" />
            <Card style={{ gap: 0 }}>
              {!isDemo ? (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Enable Demo Mode',
                      'Demo mode bypasses authentication and shows the app with an empty workspace. Use this to audit screens without a backend connection.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Enable Demo Mode',
                          onPress: () => { loginDemo(); router.replace('/'); },
                        },
                      ],
                    );
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 14, paddingHorizontal: 4,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: tk.color.warning }}>
                    Enable Demo Mode
                  </Text>
                  <Text style={{ fontSize: 12, color: tk.color.subtle, marginTop: 2 }}>
                    Bypass auth — audit UI without backend
                  </Text>
                </Pressable>
              ) : (
                <View style={{ paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.warning }}>
                    ⚠ Demo Mode active
                  </Text>
                  <Text style={{ fontSize: 12, color: tk.color.subtle, marginTop: 2 }}>
                    Sign out to return to real auth.
                  </Text>
                </View>
              )}
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
          SignalKit v{APP_VERSION} · Evidence-backed product intelligence
        </Text>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <Text style={{ fontSize: 12, color: tk.color.subtle, flexShrink: 0 }}>{label}</Text>
      <Text
        style={{
          fontSize: 12,
          color: tk.color.ink,
          fontWeight: '500',
          fontFamily: mono ? 'monospace' : undefined,
          flex: 1,
          textAlign: 'right',
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}
