/**
 * Vibe Coding Prompts — self-contained prompts for AI coding agents, grouped
 * by role. A separate execution artifact; not part of the main PDF.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { inferPromptRole, type PromptRole } from '@signalkit/shared';
import { useAuth } from '../../../lib/auth';
import { packApi, ApiException, type AiAgentPrompt } from '../../../lib/api';
import { openOrShareExport } from '../../../lib/export';
import { impact } from '../../../lib/haptics';
import {
  tk, Card, Button, SectionHeader, SkeletonCard, EmptyState, ErrorState,
} from '../../../components/brand';

const ROLE_LABELS: Record<PromptRole, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  ai: 'AI',
  qa: 'QA',
  integration: 'Integration',
  general: 'General',
};

const ROLE_ORDER: PromptRole[] = ['frontend', 'backend', 'ai', 'qa', 'integration', 'general'];

function PromptCard({ prompt }: { prompt: AiAgentPrompt }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    impact();
    await Clipboard.setStringAsync(prompt.promptBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card style={{ gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.ink }}>{prompt.title}</Text>
      <Text style={{ fontSize: 12, color: tk.color.subtle }}>Target: {prompt.targetAgent}</Text>
      <Text style={{ fontSize: 13, color: tk.color.ink }} numberOfLines={4}>{prompt.promptBody}</Text>
      <Button label={copied ? 'Copied ✓' : 'Copy prompt'} onPress={copy} variant="secondary" size="sm" />
    </Card>
  );
}

export default function Prompts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const wsId = user?.workspaces?.[0]?.id;

  const [prompts, setPrompts] = useState<AiAgentPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!wsId || !id) { setLoading(false); return; }
    try {
      const pack = await packApi.get(wsId, id);
      setPrompts(pack.metadata?.executionHandoff?.aiAgentPromptBundleDraft ?? []);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load the prompts.');
    } finally {
      setLoading(false);
    }
  }, [wsId, id]);

  useEffect(() => { load(); }, [load]);

  async function downloadZip() {
    if (!wsId || !id) return;
    setDownloading(true);
    setError(null);
    try {
      await openOrShareExport(wsId, id, 'ai_agent_engineering_bundle', 'application/zip');
    } catch (e) {
      setError(e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Could not download the ZIP.');
    } finally {
      setDownloading(false);
    }
  }

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    items: prompts.filter((p) => inferPromptRole(p.relatedSections) === role),
  })).filter((g) => g.items.length > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ padding: tk.space.base, paddingBottom: 64, gap: tk.space.lg }}
      showsVerticalScrollIndicator={false}
    >
      {loading && <SkeletonCard />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && prompts.length === 0 && !error && (
        <EmptyState icon="🤖" title="No prompts yet" body="This pack doesn't have a prompt bundle draft yet." />
      )}

      {!loading && grouped.map((group) => (
        <View key={group.role}>
          <SectionHeader title={`${ROLE_LABELS[group.role]} (${group.items.length})`} />
          <View style={{ gap: 8 }}>
            {group.items.map((p) => <PromptCard key={p.title} prompt={p} />)}
          </View>
        </View>
      ))}

      {!loading && prompts.length > 0 && (
        <Button label="Download ZIP" onPress={downloadZip} loading={downloading} />
      )}
    </ScrollView>
  );
}
