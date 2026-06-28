/**
 * Paywall screen — production-grade paywall architecture.
 * Mock billing mode: EXPO_PUBLIC_MOCK_BILLING=true
 * TODO(session-16): integrate RevenueCat or Expo IAP.
 */
import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useEntitlements } from '../lib/entitlements';
import { impact } from '../lib/haptics';
import { tk, Button, Divider, Spacer } from '../components/brand';

type BillingPeriod = 'monthly' | 'annual';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    description: 'Get started',
    bullets: [
      '✓ 1 project',
      '✓ Quick Opportunity packs',
      '✓ Venture Thesis view',
      '✓ Export status view',
      '✗ PDF / AI-Agent exports',
      '✗ Full Pack depth',
      '✗ Multi-market',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 49,
    annual: 39,
    description: 'For founders and PMs',
    bullets: [
      '✓ Unlimited projects',
      '✓ All Pack depths',
      '✓ PDF + Markdown exports',
      '✓ AI-Agent Engineering Bundle',
      '✓ Role briefs (all roles)',
      '✓ Multi-market comparison',
      '✓ Build Blueprint full access',
    ],
    recommended: true,
  },
  {
    id: 'team',
    name: 'Team',
    monthly: 149,
    annual: 119,
    description: 'For agencies and studios',
    bullets: [
      '✓ Everything in Pro',
      '✓ 5 team members',
      '✓ White-label exports',
      '✓ Client workspace',
      '✓ Priority support',
      '✓ Governance + review workflow',
    ],
  },
];

export default function Paywall() {
  const router = useRouter();
  const { plan, upgrade, restore, isLoading } = useEntitlements();
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [selected, setSelected] = useState<string>('pro');
  const [purchasing, setPurchasing] = useState(false);

  const isMock = process.env.EXPO_PUBLIC_MOCK_BILLING === 'true';

  async function handlePurchase() {
    await impact();
    setPurchasing(true);
    try {
      // In production: trigger native purchase sheet here
      // RevenueCat: await Purchases.purchasePackage(pkg);
      await new Promise((r) => setTimeout(r, isMock ? 800 : 0));
      if (isMock) upgrade();
      router.back();
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setPurchasing(true);
    try {
      await restore();
      router.back();
    } finally {
      setPurchasing(false);
    }
  }

  if (plan === 'pro' || plan === 'team') {
    return (
      <View style={{ flex: 1, backgroundColor: tk.color.canvas, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>✅</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.ink, textAlign: 'center' }}>
          You're on {plan.charAt(0).toUpperCase() + plan.slice(1)}
        </Text>
        <Text style={{ fontSize: 15, color: tk.color.subtle, marginTop: 8, textAlign: 'center' }}>
          All premium features are unlocked.
        </Text>
        <Spacer h={24} />
        <Button label="Done" onPress={() => router.back()} size="lg" style={{ minWidth: 160 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tk.color.canvas }}>
      {/* Close */}
      <View style={{ paddingTop: 56, paddingHorizontal: tk.space.base, alignItems: 'flex-end' }}>
        <Pressable onPress={() => router.back()}>
          <View style={{
            width: 30, height: 30, borderRadius: 15,
            backgroundColor: tk.color.line, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 14, color: tk.color.ink, fontWeight: '600' }}>✕</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: tk.space.base, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
          <Text style={{ fontSize: 36 }}>🔓</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, textAlign: 'center', letterSpacing: -0.5 }}>
            Unlock SignalKit Pro
          </Text>
          <Text style={{ fontSize: 15, color: tk.color.subtle, textAlign: 'center', lineHeight: 22 }}>
            Full Pack depth · PDF exports · AI-Agent bundles · Multi-market
          </Text>
          {isMock && (
            <View style={{ backgroundColor: tk.color.warningBg, borderColor: tk.color.warningBorder, borderWidth: 1, borderRadius: tk.radius.sm, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 11, color: tk.color.warning, fontWeight: '700' }}>DEV MOCK BILLING — no real payment</Text>
            </View>
          )}
        </View>

        {/* Period Toggle */}
        <View style={{
          flexDirection: 'row', backgroundColor: tk.color.line, borderRadius: tk.radius.md,
          padding: 3, marginBottom: 24,
        }}>
          {(['monthly', 'annual'] as BillingPeriod[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => { setPeriod(p); impact(); }}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: tk.radius.sm,
                alignItems: 'center',
                backgroundColor: period === p ? tk.color.surface : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: period === p ? tk.color.ink : tk.color.subtle }}>
                {p === 'monthly' ? 'Monthly' : 'Annual'}
              </Text>
              {p === 'annual' && (
                <Text style={{ fontSize: 10, fontWeight: '700', color: tk.color.brand }}>Save 20%</Text>
              )}
            </Pressable>
          ))}
        </View>

        {/* Plan Cards */}
        <View style={{ gap: 12, marginBottom: 24 }}>
          {PLANS.map((p) => {
            const price = period === 'annual' ? p.annual : p.monthly;
            const isSelected = selected === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => { setSelected(p.id); impact(); }}
                style={({ pressed }) => ({
                  borderRadius: tk.radius.lg,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? tk.color.brand : tk.color.line,
                  backgroundColor: isSelected ? tk.color.brandFaint : tk.color.surface,
                  padding: tk.space.base,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                {p.recommended && (
                  <View style={{
                    alignSelf: 'flex-start', marginBottom: 8,
                    paddingVertical: 3, paddingHorizontal: 10,
                    borderRadius: tk.radius.full,
                    backgroundColor: tk.color.brand,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>MOST POPULAR</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: tk.color.ink }}>{p.name}</Text>
                    <Text style={{ fontSize: 13, color: tk.color.subtle }}>{p.description}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: price === 0 ? tk.color.muted : tk.color.ink }}>
                      {price === 0 ? 'Free' : `$${price}`}
                    </Text>
                    {price > 0 && <Text style={{ fontSize: 11, color: tk.color.subtle }}>/mo</Text>}
                  </View>
                </View>
                <Divider style={{ marginVertical: 0 }} />
                <View style={{ gap: 6, marginTop: 12 }}>
                  {p.bullets.map((b) => (
                    <Text key={b} style={{
                      fontSize: 13,
                      color: b.startsWith('✓') ? tk.color.ink : tk.color.muted,
                      fontWeight: b.startsWith('✓') ? '500' : '400',
                    }}>
                      {b}
                    </Text>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* CTA */}
        {selected !== 'free' && (
          <Button
            label={isMock ? `Activate ${selected} (Mock)` : `Start ${selected} — ${period === 'annual' ? 'Annual' : 'Monthly'}`}
            onPress={handlePurchase}
            loading={purchasing}
            size="lg"
            style={{ marginBottom: 12 }}
          />
        )}

        <Pressable onPress={handleRestore} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Text style={{ fontSize: 13, color: tk.color.subtle, fontWeight: '500' }}>Restore purchases</Text>
        </Pressable>

        <Spacer h={16} />
        <Text style={{ fontSize: 11, color: tk.color.muted, textAlign: 'center', lineHeight: 16 }}>
          Prices shown in USD. Cancel anytime.{'\n'}
          By subscribing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </View>
  );
}
