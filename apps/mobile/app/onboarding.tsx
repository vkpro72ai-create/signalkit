/**
 * Onboarding — discovery-first setup wizard.
 * Steps: Welcome → Role → Goal → Market → Verticals → Language → Account
 * No emoji icons. Explicit market selection. No location inference.
 */
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '../lib/onboarding';
import { useAuth } from '../lib/auth';
import { impact } from '../lib/haptics';
import { tk } from '../components/brand';

// ─── Data ────────────────────────────────────────────────────────────────────

type Role = 'founder' | 'operator' | 'agency' | 'investor' | 'builder';
type Goal =
  | 'find_opportunities' | 'track_niches' | 'validate_idea'
  | 'generate_docs' | 'ai_build_pack' | 'analyze_market';
type Vertical = string;
type Lang = string;

const ROLES: Array<{ id: Role; label: string; desc: string }> = [
  { id: 'founder', label: 'Founder', desc: 'Building a new product from scratch' },
  { id: 'operator', label: 'Product Operator', desc: 'Owning roadmap, metrics and growth' },
  { id: 'agency', label: 'Agency / Studio', desc: 'Shipping products for clients' },
  { id: 'investor', label: 'Investor / Scout', desc: 'Evaluating deals and market opportunities' },
  { id: 'builder', label: 'Builder', desc: 'Writing code and shipping features' },
];

const GOALS: Array<{ id: Goal; label: string }> = [
  { id: 'find_opportunities', label: 'Find new product opportunities' },
  { id: 'track_niches', label: 'Track fast-growing niches' },
  { id: 'validate_idea', label: 'Validate an existing idea' },
  { id: 'generate_docs', label: 'Generate product documentation' },
  { id: 'ai_build_pack', label: 'Prepare AI-agent build pack' },
  { id: 'analyze_market', label: 'Analyze a specific market' },
];

const MARKETS = [
  { id: 'us', label: 'United States' },
  { id: 'global_en', label: 'Global English-speaking' },
  { id: 'uk', label: 'United Kingdom' },
  { id: 'ca', label: 'Canada' },
  { id: 'au_nz', label: 'Australia / New Zealand' },
  { id: 'eu', label: 'EU (multiple markets)' },
  { id: 'de', label: 'Germany' },
  { id: 'fr', label: 'France' },
  { id: 'es', label: 'Spain' },
  { id: 'nordics', label: 'Nordics' },
  { id: 'uae', label: 'UAE / Gulf' },
  { id: 'sg', label: 'Singapore' },
  { id: 'in', label: 'India' },
  { id: 'br', label: 'Brazil' },
  { id: 'custom', label: 'Other / Custom' },
];

const VERTICALS = [
  { id: 'ai', label: 'AI & Automation' },
  { id: 'health', label: 'Health & Wellness' },
  { id: 'fintech', label: 'Fintech' },
  { id: 'b2b_saas', label: 'B2B SaaS' },
  { id: 'consumer', label: 'Consumer' },
  { id: 'real_estate', label: 'Real Estate' },
  { id: 'womens_health', label: "Women's Health" },
  { id: 'productivity', label: 'Productivity' },
  { id: 'founder_tools', label: 'Founder Tools' },
  { id: 'education', label: 'Education' },
  { id: 'climate', label: 'Climate & Sustainability' },
  { id: 'custom', label: 'Other / Custom' },
];

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'pt', label: 'Português' },
  { id: 'ar', label: 'العربية' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'tr', label: 'Türkçe' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleCard({ label, desc, selected, onPress }: { label: string; desc: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 16, paddingHorizontal: 18,
        borderRadius: tk.radius.md, borderWidth: 1.5,
        borderColor: selected ? tk.color.brand : tk.color.border,
        backgroundColor: selected ? tk.color.brandBg : tk.color.surface,
        opacity: pressed ? 0.8 : 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: selected ? tk.color.brand : tk.color.ink, marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 13, color: tk.color.subtle, lineHeight: 18 }}>{desc}</Text>
      </View>
      {selected && (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: tk.color.brand, alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>
        </View>
      )}
    </Pressable>
  );
}

function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 11, paddingHorizontal: 16,
        borderRadius: tk.radius.sm, borderWidth: 1.5,
        borderColor: selected ? tk.color.brand : tk.color.border,
        backgroundColor: selected ? tk.color.brandBg : tk.color.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? tk.color.brand : tk.color.ink }}>{label}</Text>
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Step = 'welcome' | 'role' | 'goal' | 'market' | 'verticals' | 'language' | 'account';
const STEPS: Step[] = ['welcome', 'role', 'goal', 'market', 'verticals', 'language', 'account'];

export default function Onboarding() {
  const router = useRouter();
  const { complete } = useOnboarding();
  const { isAuthenticated } = useAuth();

  const [stepIdx, setStepIdx] = useState(0);
  const [role, setRole] = useState<Role | null>(null);
  const [goals, setGoals] = useState<Set<Goal>>(new Set(['find_opportunities']));
  const [market, setMarket] = useState<string | null>(null);
  const [verticals, setVerticals] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState<Lang>('en');

  const step = STEPS[stepIdx];

  function next() { impact(); setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)); }
  function back() { if (stepIdx > 0) setStepIdx((i) => i - 1); }

  function toggleGoal(id: Goal) {
    setGoals((prev) => { const n = new Set(prev); n.has(id) ? (n.size > 1 && n.delete(id)) : n.add(id); return n; });
  }
  function toggleVertical(id: string) {
    setVerticals((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function finish() {
    await impact();
    await complete();
    router.replace(isAuthenticated ? '/' : '/register');
  }

  const canAdvance =
    step === 'welcome' ? true :
    step === 'role' ? !!role :
    step === 'market' ? !!market :
    true;

  return (
    <View style={{ flex: 1, backgroundColor: tk.color.canvas }}>
      <StatusBar barStyle="dark-content" />

      {/* Progress */}
      <View style={{ height: 3, backgroundColor: tk.color.border, marginTop: 52 }}>
        <View style={{ height: 3, width: `${((stepIdx + 1) / STEPS.length) * 100}%`, backgroundColor: tk.color.brand }} />
      </View>

      {/* Nav row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tk.space.base, paddingVertical: 14 }}>
        {stepIdx > 0
          ? <Pressable onPress={back} hitSlop={12}><Text style={{ fontSize: 15, color: tk.color.subtle, fontWeight: '500' }}>← Back</Text></Pressable>
          : <View />
        }
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {STEPS.map((_, i) => (
            <View key={i} style={{ width: i === stepIdx ? 18 : 5, height: 5, borderRadius: 2.5, backgroundColor: i === stepIdx ? tk.color.brand : tk.color.border }} />
          ))}
        </View>
        <Pressable onPress={finish} hitSlop={12}><Text style={{ fontSize: 14, color: tk.color.muted }}>Skip</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: tk.space.base, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

        {/* WELCOME */}
        {step === 'welcome' && (
          <View style={{ paddingTop: 16 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: tk.color.brandBg, borderWidth: 1.5, borderColor: tk.color.brand + '40', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: tk.color.brand }}>SK</Text>
            </View>
            <Text style={{ fontSize: 34, fontWeight: '900', color: tk.color.ink, letterSpacing: -1, lineHeight: 40, marginBottom: 16 }}>
              Find product{'\n'}opportunities{'\n'}worth building.
            </Text>
            <Text style={{ fontSize: 16, color: tk.color.subtle, lineHeight: 26, marginBottom: 32 }}>
              Evidence-backed market intelligence for founders, operators and product teams.
              No hype, no fake TAM — real signals with reasoning.
            </Text>
            {[
              'Opportunity discovery with scoring and evidence',
              'Venture Thesis generated per opportunity',
              'Product Pack — 14 build-ready engineering documents',
              'Build Blueprint with screen contracts and API maps',
            ].map((item) => (
              <View key={item} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: tk.color.brand, marginTop: 9 }} />
                <Text style={{ fontSize: 15, color: tk.color.ink, flex: 1, lineHeight: 22 }}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ROLE */}
        {step === 'role' && (
          <View style={{ paddingTop: 16 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5, marginBottom: 8 }}>What's your role?</Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle, marginBottom: 28, lineHeight: 22 }}>
              We'll surface the most relevant opportunities and documents for you.
            </Text>
            <View style={{ gap: 10 }}>
              {ROLES.map((r) => (
                <RoleCard key={r.id} label={r.label} desc={r.desc} selected={role === r.id} onPress={() => { impact(); setRole(r.id); }} />
              ))}
            </View>
          </View>
        )}

        {/* GOAL */}
        {step === 'goal' && (
          <View style={{ paddingTop: 16 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5, marginBottom: 8 }}>What are you trying to do?</Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle, marginBottom: 28, lineHeight: 22 }}>Select all that apply.</Text>
            <View style={{ gap: 10 }}>
              {GOALS.map((g) => (
                <OptionChip key={g.id} label={g.label} selected={goals.has(g.id)} onPress={() => toggleGoal(g.id)} />
              ))}
            </View>
          </View>
        )}

        {/* MARKET */}
        {step === 'market' && (
          <View style={{ paddingTop: 16 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5, marginBottom: 8 }}>Which market matters most?</Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle, marginBottom: 4, lineHeight: 22 }}>
              We do not infer market from your device location.
            </Text>
            <Text style={{ fontSize: 13, color: tk.color.muted, marginBottom: 24 }}>
              Select your primary opportunity discovery context.
            </Text>
            <View style={{ gap: 8 }}>
              {MARKETS.map((m) => (
                <OptionChip key={m.id} label={m.label} selected={market === m.id} onPress={() => { impact(); setMarket(m.id); }} />
              ))}
            </View>
          </View>
        )}

        {/* VERTICALS */}
        {step === 'verticals' && (
          <View style={{ paddingTop: 16 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5, marginBottom: 8 }}>Which verticals interest you?</Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle, marginBottom: 28, lineHeight: 22 }}>Select any. We'll prioritize these in discovery.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {VERTICALS.map((v) => (
                <Pressable key={v.id} onPress={() => { impact(); toggleVertical(v.id); }} style={({ pressed }) => ({
                  paddingVertical: 10, paddingHorizontal: 14, borderRadius: tk.radius.sm, borderWidth: 1.5,
                  borderColor: verticals.has(v.id) ? tk.color.brand : tk.color.border,
                  backgroundColor: verticals.has(v.id) ? tk.color.brandBg : tk.color.surface,
                  opacity: pressed ? 0.8 : 1,
                })}>
                  <Text style={{ fontSize: 14, fontWeight: verticals.has(v.id) ? '700' : '500', color: verticals.has(v.id) ? tk.color.brand : tk.color.ink }}>
                    {v.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* LANGUAGE */}
        {step === 'language' && (
          <View style={{ paddingTop: 16 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5, marginBottom: 8 }}>Preferred language?</Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle, marginBottom: 28, lineHeight: 22 }}>
              Generated Venture Thesis, Product Packs, and Build Blueprints will use this language.
            </Text>
            <View style={{ gap: 8 }}>
              {LANGUAGES.map((l) => (
                <OptionChip key={l.id} label={l.label} selected={language === l.id} onPress={() => { impact(); setLanguage(l.id); }} />
              ))}
            </View>
          </View>
        )}

        {/* ACCOUNT */}
        {step === 'account' && (
          <View style={{ paddingTop: 16 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.5, marginBottom: 8 }}>Your product lab is ready.</Text>
            <Text style={{ fontSize: 15, color: tk.color.subtle, marginBottom: 32, lineHeight: 22 }}>
              Create an account to save your setup and start discovering opportunities.
              Your preferences sync across mobile and web.
            </Text>
            {[
              { label: 'Role', value: ROLES.find((r) => r.id === role)?.label ?? 'Not selected' },
              { label: 'Market', value: MARKETS.find((m) => m.id === market)?.label ?? 'Not selected' },
              { label: 'Language', value: LANGUAGES.find((l) => l.id === language)?.label ?? 'English' },
              { label: 'Verticals', value: verticals.size > 0 ? `${verticals.size} selected` : 'None' },
            ].map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: tk.color.border }}>
                <Text style={{ fontSize: 14, color: tk.color.subtle }}>{row.label}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: tk.color.ink }}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: tk.space.base, paddingBottom: 40, paddingTop: 16, backgroundColor: tk.color.canvas, borderTopWidth: 1, borderTopColor: tk.color.border }}>
        {step === 'account' ? (
          <View style={{ gap: 10 }}>
            <Pressable onPress={() => { impact(); router.push('/register'); }} style={({ pressed }) => ({ backgroundColor: tk.color.brand, borderRadius: tk.radius.md, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.88 : 1 })}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Create account</Text>
            </Pressable>
            <Pressable onPress={() => { impact(); router.push('/login'); }} style={({ pressed }) => ({ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: tk.color.subtle }}>Already have an account? Sign in</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={canAdvance ? next : undefined}
            style={({ pressed }) => ({ backgroundColor: canAdvance ? tk.color.brand : tk.color.border, borderRadius: tk.radius.md, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.88 : 1 })}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: canAdvance ? '#fff' : tk.color.muted }}>
              {step === 'welcome' ? 'Get started' : 'Continue'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
