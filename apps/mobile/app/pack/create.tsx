/**
 * Create Pack — Step 1. Pick a found opportunity (variant A, `?nicheId=`) or
 * write a founder idea (variant B). SignalKit amplifies exactly this idea —
 * it never searches for or swaps in a different one.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { workspaceApi, nicheApi, ApiException } from '../../lib/api';
import { impact } from '../../lib/haptics';
import {
  tk, Card, Button, SkeletonCard, ErrorState, ScoreGrid, Spacer,
} from '../../components/brand';

type Niche = {
  id: string;
  name: string;
  opportunityScore: number;
  confidence: { level: string; value: number };
};

const labelStyle = { fontSize: 12, fontWeight: '600' as const, color: tk.color.subtle, marginBottom: 6, letterSpacing: 0.3 };
const inputStyle = {
  backgroundColor: tk.color.surface, borderColor: tk.color.line, borderWidth: 1.5,
  borderRadius: tk.radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: tk.color.ink,
};

function ReassuranceNote() {
  return (
    <View style={{
      backgroundColor: tk.color.brandFaint, borderColor: tk.color.brandLight, borderWidth: 1,
      borderRadius: tk.radius.md, padding: 12, flexDirection: 'row', gap: 8,
    }}>
      <Text style={{ fontSize: 14 }}>ℹ</Text>
      <Text style={{ fontSize: 13, color: tk.color.ink, flex: 1, lineHeight: 18 }}>
        SignalKit won't search for a different idea. The pack is built around exactly the idea below —
        strengthening its strategy, product, build plan and go-to-market.
      </Text>
    </View>
  );
}

export default function CreatePack() {
  const { nicheId } = useLocalSearchParams<{ nicheId?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  // Variant A — existing opportunity
  const [niche, setNiche] = useState<Niche | null>(null);
  const [loadingNiche, setLoadingNiche] = useState(!!nicheId);
  const [error, setError] = useState<string | null>(null);

  // Variant B — founder's own idea
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [forWhom, setForWhom] = useState('');
  const [problem, setProblem] = useState('');
  const [market, setMarket] = useState('');
  const [constraints, setConstraints] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadNiche = useCallback(async () => {
    if (!wsId || !nicheId) { setLoadingNiche(false); return; }
    try {
      const data = await workspaceApi.niches(wsId);
      const found = data.find((n) => n.id === nicheId);
      setNiche(found ?? null);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load this opportunity.');
    } finally {
      setLoadingNiche(false);
    }
  }, [wsId, nicheId]);

  useEffect(() => { loadNiche(); }, [loadNiche]);

  function continueFromOpportunity() {
    impact();
    router.push(`/pack/create-confirm?nicheId=${nicheId}`);
  }

  async function submitOwnIdea() {
    const composed = [
      title.trim(),
      description.trim(),
      problem.trim() ? `Problem it solves: ${problem.trim()}` : '',
      constraints.trim() ? `What's already known / constraints: ${constraints.trim()}` : '',
    ].filter(Boolean).join('\n\n');

    if (composed.length < 40) {
      setFormError('Add a bit more detail — describe the idea and the problem it solves.');
      return;
    }
    if (!wsId) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const projects = await workspaceApi.projects(wsId);
      const projectId = projects[0]?.id;
      if (!projectId) throw new Error('Create a project on the web app first.');

      const created = await nicheApi.createFromIdea(wsId, projectId, {
        founderIdea: composed,
        targetAudience: forWhom.trim() || undefined,
        targetMarket: market.trim() || undefined,
      });
      impact();
      router.push(`/pack/create-confirm?nicheId=${created.id}`);
    } catch (e) {
      setFormError(e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Could not create this idea.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tk.color.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: tk.space.base, paddingTop: tk.space.lg, paddingBottom: 64, gap: tk.space.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.4 }}>
            {nicheId ? 'Create Product Pack' : 'Create Product Pack from your idea'}
          </Text>
          <Text style={{ fontSize: 14, color: tk.color.subtle, marginTop: 4 }}>
            {nicheId ? 'Turn this opportunity into a build-ready pack.' : 'Describe your idea — SignalKit amplifies exactly it.'}
          </Text>
        </View>

        {nicheId ? (
          <>
            {loadingNiche && <SkeletonCard />}
            {!loadingNiche && error && <ErrorState message={error} onRetry={loadNiche} />}
            {!loadingNiche && niche && (
              <Card style={{ gap: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: tk.color.subtle, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Selected idea
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: tk.color.ink }}>{niche.name}</Text>
                <ScoreGrid opportunity={niche.opportunityScore} confidence={niche.confidence.value} ventureScale={null} buildReadiness={null} />
              </Card>
            )}
            <ReassuranceNote />
            <Button label="Создать пакет по этой идее" onPress={continueFromOpportunity} disabled={loadingNiche || !niche} />
          </>
        ) : (
          <>
            <View style={{ gap: 12 }}>
              <View>
                <Text style={labelStyle}>PRODUCT NAME</Text>
                <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="e.g. Clinic WhatsApp Copilot" placeholderTextColor={tk.color.muted} />
              </View>
              <View>
                <Text style={labelStyle}>DESCRIPTION</Text>
                <TextInput
                  style={[inputStyle, { minHeight: 90, textAlignVertical: 'top' }]}
                  value={description} onChangeText={setDescription} multiline
                  placeholder="What does it do? Who is it for?" placeholderTextColor={tk.color.muted}
                />
              </View>
              <View>
                <Text style={labelStyle}>FOR WHOM</Text>
                <TextInput style={inputStyle} value={forWhom} onChangeText={setForWhom} placeholder="Target audience" placeholderTextColor={tk.color.muted} />
              </View>
              <View>
                <Text style={labelStyle}>PROBLEM IT SOLVES</Text>
                <TextInput
                  style={[inputStyle, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={problem} onChangeText={setProblem} multiline
                  placeholder="What pain does it remove?" placeholderTextColor={tk.color.muted}
                />
              </View>
              <View>
                <Text style={labelStyle}>MARKET</Text>
                <TextInput style={inputStyle} value={market} onChangeText={setMarket} placeholder="e.g. United States, global" placeholderTextColor={tk.color.muted} />
              </View>
              <View>
                <Text style={labelStyle}>CONSTRAINTS (OPTIONAL)</Text>
                <TextInput
                  style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={constraints} onChangeText={setConstraints} multiline
                  placeholder="What's already known or off the table?" placeholderTextColor={tk.color.muted}
                />
              </View>
            </View>

            <ReassuranceNote />

            {formError && (
              <View style={{ backgroundColor: tk.color.riskBg, borderColor: tk.color.riskBorder, borderWidth: 1, borderRadius: tk.radius.md, padding: 12 }}>
                <Text style={{ color: tk.color.risk, fontSize: 13 }}>{formError}</Text>
              </View>
            )}

            <Button label="Создать пакет" onPress={submitOwnIdea} loading={submitting} />
            <Spacer h={8} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
