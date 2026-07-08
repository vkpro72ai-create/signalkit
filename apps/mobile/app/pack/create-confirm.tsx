/**
 * Create Pack — Step 2. Confirms scope before generation starts.
 */
import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { packApi, ApiException } from '../../lib/api';
import { impact } from '../../lib/haptics';
import { tk, Card, Button, Chip, SectionHeader } from '../../components/brand';

const CONTENTS = [
  'Vision & Market', 'Product & UX', 'Design Brief', 'Technical Build (backend/API/data)',
  'AI Logic', 'Backlog & Sprints', 'Vibe Coding Prompts', 'Monetization & GTM', 'Hand-off PDF',
];

const VERTICALS: Array<{ id: string; label: string }> = [
  { id: 'b2b_saas', label: 'B2B SaaS' },
  { id: 'mobile_consumer_app', label: 'Consumer App' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'ai_agent_product', label: 'AI Agent' },
  { id: 'api_product', label: 'API Product' },
  { id: 'community_content_product', label: 'Community' },
  { id: 'local_service_saas', label: 'Local Service' },
  { id: 'compliance_saas', label: 'Compliance' },
  { id: 'health_adjacent_product', label: 'Health' },
  { id: 'fintech_adjacent_product', label: 'Fintech' },
  { id: 'ecommerce_tool', label: 'Ecommerce' },
  { id: 'creator_economy_tool', label: 'Creator Economy' },
  { id: 'internal_enterprise_tool', label: 'Enterprise Tool' },
];

const LANGUAGES: Array<{ id: string; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
  { id: 'es', label: 'Español' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français' },
  { id: 'pt', label: 'Português' },
];

export default function CreateConfirm() {
  const { nicheId } = useLocalSearchParams<{ nicheId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  const [vertical, setVertical] = useState('b2b_saas');
  const [language, setLanguage] = useState('en');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!wsId || !nicheId) return;
    setSubmitting(true);
    setError(null);
    try {
      const pack = await packApi.generate(wsId, nicheId, { depth: 'build_ready', vertical, language });
      impact();
      router.replace(`/pack/create-progress?packId=${pack.id}`);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not start generation.');
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ padding: tk.space.base, paddingTop: tk.space.lg, paddingBottom: 64, gap: tk.space.lg }}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={{ fontSize: 24, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.4 }}>Confirm scope</Text>
        <Text style={{ fontSize: 14, color: tk.color.subtle, marginTop: 4 }}>
          The pack will include the following, built around your idea only.
        </Text>
      </View>

      <Card style={{ gap: 8 }}>
        {CONTENTS.map((item) => (
          <View key={item} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Text style={{ color: tk.color.brand, fontWeight: '700' }}>✓</Text>
            <Text style={{ fontSize: 14, color: tk.color.ink, flex: 1 }}>{item}</Text>
          </View>
        ))}
      </Card>

      <View>
        <SectionHeader title="Vertical" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {VERTICALS.map((v) => (
            <Chip key={v.id} label={v.label} selected={vertical === v.id} onPress={() => { impact(); setVertical(v.id); }} />
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title="Язык / Language" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map((l) => (
            <Chip key={l.id} label={l.label} selected={language === l.id} onPress={() => { impact(); setLanguage(l.id); }} />
          ))}
        </View>
      </View>

      {error && (
        <View style={{ backgroundColor: tk.color.riskBg, borderColor: tk.color.riskBorder, borderWidth: 1, borderRadius: tk.radius.md, padding: 12 }}>
          <Text style={{ color: tk.color.risk, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Button label="Начать генерацию" onPress={start} loading={submitting} disabled={!nicheId} />
    </ScrollView>
  );
}
