/**
 * Add comment / request addition — creates a scoped amendment, not a full
 * regenerate. There is no Regenerate button anywhere on mobile.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { packApi, commentsApi, ApiException, type PackDocument } from '../../../lib/api';
import { impact } from '../../../lib/haptics';
import { tk, Card, Button, Chip } from '../../../components/brand';

type ScopeId = 'all' | 'strategy_business' | 'product_design' | 'technical_ai';

const SCOPES: Array<{ id: ScopeId; label: string; docTypes: string[] | null }> = [
  { id: 'all', label: 'Весь пакет', docTypes: null },
  {
    id: 'strategy_business', label: 'Стратегия и бизнес',
    docTypes: ['product_vision', 'market_context', 'market_selection_memo', 'target_audience_icp', 'jobs_to_be_done', 'monetization_plan', 'go_to_market_plan', 'analytics_plan'],
  },
  {
    id: 'product_design', label: 'Продукт и дизайн',
    docTypes: ['problem_map', 'user_scenarios', 'feature_checklist', 'mvp_scope', 'post_mvp_scope', 'ux_flow', 'screen_map', 'design_brd'],
  },
  {
    id: 'technical_ai', label: 'Техническая часть и AI',
    docTypes: ['backend_brd', 'frontend_brd', 'data_model', 'api_requirements', 'ai_agent_instructions', 'acceptance_criteria'],
  },
];

export default function Amend() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  const [documents, setDocuments] = useState<PackDocument[]>([]);
  const [scope, setScope] = useState<ScopeId>('all');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wsId || !id) return;
    try {
      const pack = await packApi.get(wsId, id);
      setDocuments(pack.documents ?? []);
    } catch {
      // Non-fatal — submit will surface an error if documents can't be resolved.
    }
  }, [wsId, id]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!wsId || !id || text.trim().length < 5) {
      setError('Describe what should be added or fixed.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const scopeDef = SCOPES.find((s) => s.id === scope)!;
      const targets = scopeDef.docTypes
        ? documents.filter((d) => scopeDef.docTypes!.includes(d.docType))
        : documents;

      if (targets.length === 0) throw new Error('No documents match this scope.');

      for (const doc of targets) {
        await commentsApi.create(wsId, id, doc.id, text.trim());
      }
      await commentsApi.applyPackComments(wsId, id);

      impact();
      setDone(true);
      setTimeout(() => router.replace(`/pack/${id}`), 1200);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Could not submit the amendment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.color.canvas, alignItems: 'center', justifyContent: 'center', gap: 8, padding: tk.space.base }}>
        <Text style={{ fontSize: 40 }}>✓</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: tk.color.ink }}>Пакет дополнен</Text>
        <Text style={{ fontSize: 13, color: tk.color.subtle, textAlign: 'center' }}>Возвращаемся к пакету…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tk.color.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: tk.space.base, paddingTop: tk.space.lg, paddingBottom: 64, gap: tk.space.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.3 }}>
            Что нужно добавить или исправить?
          </Text>
          <Text style={{ fontSize: 13, color: tk.color.subtle, marginTop: 4 }}>
            Это создаёт дополнение к пакету, а не полную перегенерацию.
          </Text>
        </View>

        <Card>
          <TextInput
            style={{ minHeight: 120, fontSize: 15, color: tk.color.ink, textAlignVertical: 'top' }}
            value={text}
            onChangeText={setText}
            multiline
            placeholder={'Например:\n"Добавь больше про монетизацию для США"\n"Убери медицинские обещания"\n"Расширь backend plan"'}
            placeholderTextColor={tk.color.muted}
          />
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SCOPES.map((s) => (
            <Chip key={s.id} label={s.label} selected={scope === s.id} onPress={() => { impact(); setScope(s.id); }} />
          ))}
        </View>

        {error && (
          <View style={{ backgroundColor: tk.color.riskBg, borderColor: tk.color.riskBorder, borderWidth: 1, borderRadius: tk.radius.md, padding: 12 }}>
            <Text style={{ color: tk.color.risk, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        <Button label="Добавить дополнение" onPress={submit} loading={submitting} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
