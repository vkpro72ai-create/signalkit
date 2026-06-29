/**
 * Onboarding — multi-step wizard.
 * Steps: Welcome → Value props → Role → Target → Market mode → Account CTA
 * Persists completion via OnboardingProvider.
 */
import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useOnboarding } from '../lib/onboarding';
import { impact } from '../lib/haptics';
import { tk, Button, Chip } from '../components/brand';

type Role = 'founder' | 'pm' | 'agency' | 'investor' | 'developer';
type Target = 'startup' | 'validate' | 'build_docs' | 'ai_handoff' | 'research';
type MarketMode = 'global' | 'country' | 'multi';

const ROLES: Array<{ id: Role; label: string; icon: string; desc: string }> = [
  { id: 'founder', label: 'Founder', icon: '🚀', desc: 'Building a new startup' },
  { id: 'pm', label: 'Product Manager', icon: '📋', desc: 'Owning the roadmap' },
  { id: 'agency', label: 'Agency / Studio', icon: '🏢', desc: 'Shipping for clients' },
  { id: 'investor', label: 'Investor / Scout', icon: '🔍', desc: 'Evaluating deals' },
  { id: 'developer', label: 'Developer', icon: '💻', desc: 'Building the product' },
];

const TARGETS: Array<{ id: Target; label: string; icon: string }> = [
  { id: 'startup', label: 'Find startup ideas', icon: '💡' },
  { id: 'validate', label: 'Validate an idea', icon: '✅' },
  { id: 'build_docs', label: 'Build product docs', icon: '📄' },
  { id: 'ai_handoff', label: 'AI agent handoff', icon: '🤖' },
  { id: 'research', label: 'Research a market', icon: '🌍' },
];

const MARKET_MODES: Array<{ id: MarketMode; label: string; icon: string; desc: string }> = [
  { id: 'global', label: 'Global', icon: '🌐', desc: 'Worldwide opportunity intelligence' },
  { id: 'country', label: 'My country', icon: '📍', desc: 'Focus on my home market' },
  { id: 'multi', label: 'Multi-market', icon: '🗺️', desc: 'Compare across regions' },
];

const SLIDES = [
  {
    icon: '🎯',
    headline: 'Find breakout\nproduct opportunities',
    body: 'SignalKit surfaces high-signal market niches before they become obvious. Evidence-backed, not hype-driven.',
  },
  {
    icon: '📊',
    headline: 'From signals to\nventure thesis',
    body: 'Every opportunity comes with a Venture Scale Score, Confidence rating and full reasoning — no fake TAM numbers.',
  },
  {
    icon: '📦',
    headline: 'Build-ready\nProduct Packs',
    body: '27 product documents generated from real market evidence. Ready for founders, PMs, agencies and AI coding agents.',
  },
  {
    icon: '🗺️',
    headline: 'Blueprints for every\nbuild role',
    body: 'Screen contracts, API maps, component specs and DO_NOT_BUILD warnings — everything a team needs to build confidently.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { complete } = useOnboarding();

  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role | null>(null);
  const [targets, setTargets] = useState<Set<Target>>(new Set());
  const [marketMode, setMarketMode] = useState<MarketMode | null>(null);

  const TOTAL_STEPS = SLIDES.length + 3; // slides + role + target + market
  const currentSlide = step < SLIDES.length ? SLIDES[step] : null;
  const isRoleStep = step === SLIDES.length;
  const isTargetStep = step === SLIDES.length + 1;
  const isMarketStep = step === SLIDES.length + 2;

  async function advance() {
    await impact();
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      await complete();
      router.replace('/register');
    }
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  function toggleTarget(id: Target) {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function skip() {
    await complete();
    router.replace('/register');
  }

  const canAdvance = isRoleStep
    ? !!role
    : isTargetStep
      ? targets.size > 0
      : isMarketStep
        ? !!marketMode
        : true;

  return (
    <View style={{ flex: 1, backgroundColor: tk.color.canvas }}>
      {/* Progress */}
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: i <= step ? tk.color.brand : tk.color.line,
            }}
          />
        ))}
      </View>

      {/* Skip */}
      <View style={{ position: 'absolute', top: 54, right: 24 }}>
        <Pressable onPress={skip}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: tk.color.subtle }}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Slide content */}
        {currentSlide && (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: 16 }}>
            <Text style={{ fontSize: 56 }}>{currentSlide.icon}</Text>
            <Text
              style={{
                fontSize: 32,
                fontWeight: '800',
                color: tk.color.ink,
                letterSpacing: -0.8,
                lineHeight: 40,
              }}
            >
              {currentSlide.headline}
            </Text>
            <Text style={{ fontSize: 16, color: tk.color.subtle, lineHeight: 24, fontWeight: '400' }}>
              {currentSlide.body}
            </Text>
          </View>
        )}

        {/* Role step */}
        {isRoleStep && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5 }}>
              I am a...
            </Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle }}>
              This personalises your experience.
            </Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => { setRole(r.id); impact(); }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    padding: 16,
                    borderRadius: tk.radius.lg,
                    borderWidth: 1.5,
                    backgroundColor: role === r.id ? tk.color.brandFaint : tk.color.surface,
                    borderColor: role === r.id ? tk.color.brand : tk.color.line,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ fontSize: 24 }}>{r.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.ink }}>{r.label}</Text>
                    <Text style={{ fontSize: 13, color: tk.color.subtle, marginTop: 1 }}>{r.desc}</Text>
                  </View>
                  {role === r.id && (
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: tk.color.brand,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>✓</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Target step */}
        {isTargetStep && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5 }}>
              What brings you here?
            </Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle }}>Select all that apply.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              {TARGETS.map((t) => (
                <Chip
                  key={t.id}
                  label={`${t.icon}  ${t.label}`}
                  selected={targets.has(t.id)}
                  onPress={() => { toggleTarget(t.id); impact(); }}
                />
              ))}
            </View>
          </View>
        )}

        {/* Market step */}
        {isMarketStep && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5 }}>
              Choose your market focus
            </Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle }}>
              You can change this anytime per project.
            </Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {MARKET_MODES.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => { setMarketMode(m.id); impact(); }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    padding: 16,
                    borderRadius: tk.radius.lg,
                    borderWidth: 1.5,
                    backgroundColor: marketMode === m.id ? tk.color.brandFaint : tk.color.surface,
                    borderColor: marketMode === m.id ? tk.color.brand : tk.color.line,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ fontSize: 28 }}>{m.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.ink }}>{m.label}</Text>
                    <Text style={{ fontSize: 13, color: tk.color.subtle, marginTop: 1 }}>{m.desc}</Text>
                  </View>
                  {marketMode === m.id && (
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: tk.color.brand,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>✓</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 48, paddingTop: 16, gap: 12 }}>
        <Button
          label={step < TOTAL_STEPS - 1 ? 'Continue' : 'Create account'}
          onPress={canAdvance ? advance : undefined}
          disabled={!canAdvance}
          size="lg"
        />
        {step > 0 && (
          <Pressable onPress={back} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: tk.color.subtle, fontWeight: '500' }}>Back</Text>
          </Pressable>
        )}
        {/* Show sign-in link on the final step so returning users aren't stuck */}
        {step === TOTAL_STEPS - 1 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
            <Text style={{ fontSize: 14, color: tk.color.subtle }}>Already have an account?</Text>
            <Link href="/login" asChild>
              <Pressable>
                <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.brand }}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        )}
      </View>
    </View>
  );
}
