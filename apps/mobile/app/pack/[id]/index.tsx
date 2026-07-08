/**
 * Product Pack — Deliverable Hub.
 *
 * Not a document manager: the PDF is the reading surface. This screen is a
 * clean hand-off point for the three deliverables (PDF, Backlog & Sprints,
 * Vibe Coding Prompts) plus a combined ZIP, with a single scoped "add a
 * comment" action. No document list, no regenerate button, no raw QC dump.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { packApi, ApiException, type PackSummary, type PackDocument } from '../../../lib/api';
import { openOrShareExport } from '../../../lib/export';
import { impact } from '../../../lib/haptics';
import {
  tk, Card, Badge, Button, SkeletonCard, EmptyState, ErrorState, Divider,
} from '../../../components/brand';

type Pack = PackSummary & { documents?: PackDocument[] };

function qualityVariant(status?: string): 'ready' | 'evidence' | 'failed' | 'muted' {
  if (status === 'passed') return 'ready';
  if (status === 'warnings') return 'evidence';
  if (status === 'failed') return 'failed';
  return 'muted';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function DeliverableCard({
  title, description, actions,
}: { title: string; description: string; actions: Array<{ label: string; onPress: () => void; loading?: boolean; variant?: 'primary' | 'secondary' }> }) {
  return (
    <Card style={{ gap: 10 }}>
      <View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.ink }}>{title}</Text>
        <Text style={{ fontSize: 13, color: tk.color.subtle, marginTop: 2 }}>{description}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <Button key={a.label} label={a.label} onPress={a.onPress} loading={a.loading} variant={a.variant ?? 'secondary'} size="sm" style={{ flexGrow: 1 }} />
        ))}
      </View>
    </Card>
  );
}

export default function PackHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  const [pack, setPack] = useState<Pack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wsId || !id) { setLoading(false); return; }
    try {
      const data = await packApi.get(wsId, id);
      setPack(data);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load this pack.');
    } finally {
      setLoading(false);
    }
  }, [wsId, id]);

  useEffect(() => { load(); }, [load]);

  const handoff = pack?.metadata?.executionHandoff;
  const hasBacklog = !!handoff?.qiraBacklogDraft;
  const hasPrompts = (handoff?.aiAgentPromptBundleDraft?.length ?? 0) > 0;

  async function runAction(key: string, fn: () => Promise<void>) {
    impact();
    setBusy(key);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  async function pdfAction(action: 'open' | 'download' | 'share') {
    if (!wsId || !id) return;
    await runAction(`pdf-${action}`, () => openOrShareExport(wsId, id, 'full_pdf_pack', 'application/pdf'));
  }

  async function zipAction() {
    if (!wsId || !id) return;
    await runAction('zip', () => openOrShareExport(wsId, id, 'markdown_zip', 'application/zip'));
  }

  async function promptsZipAction() {
    if (!wsId || !id) return;
    await runAction('prompts-zip', () => openOrShareExport(wsId, id, 'ai_agent_engineering_bundle', 'application/zip'));
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 64 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={tk.color.brand} />}
    >
      <View style={{ paddingHorizontal: tk.space.base, gap: tk.space.lg, paddingTop: tk.space.base }}>

        {loading && <SkeletonCard />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && pack && (
          <>
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: tk.color.subtle, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Build-ready Product Pack
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: tk.color.ink }}>{pack.title}</Text>

              <Divider style={{ marginVertical: 2 }} />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Badge variant="muted" size="sm">{pack.language.toUpperCase()}</Badge>
                <Badge variant="muted" size="sm">{pack.verticalTemplate.replace(/_/g, ' ')}</Badge>
                <Badge variant="muted" size="sm">{formatDate(pack.createdAt)}</Badge>
                {pack.qualityGate && (
                  <Badge variant={qualityVariant(pack.qualityGate.status)} size="sm">
                    Quality: {pack.qualityGate.status.replace(/_/g, ' ')}
                  </Badge>
                )}
                <Badge variant="muted" size="sm">{pack.status.replace(/_/g, ' ')}</Badge>
              </View>
              <Text style={{ fontSize: 11, color: tk.color.muted }}>Last updated {formatDate(pack.updatedAt)}</Text>
            </Card>

            {actionError && (
              <View style={{ backgroundColor: tk.color.riskBg, borderColor: tk.color.riskBorder, borderWidth: 1, borderRadius: tk.radius.md, padding: 12 }}>
                <Text style={{ color: tk.color.risk, fontSize: 13 }}>{actionError}</Text>
              </View>
            )}

            <DeliverableCard
              title="Product Pack PDF"
              description="The full pack — vision, product, design, technical build, monetization — as one formatted document."
              actions={[
                { label: 'Open', onPress: () => pdfAction('open'), loading: busy === 'pdf-open', variant: 'primary' },
                { label: 'Download', onPress: () => pdfAction('download'), loading: busy === 'pdf-download' },
                { label: 'Share', onPress: () => pdfAction('share'), loading: busy === 'pdf-share' },
              ]}
            />

            <DeliverableCard
              title="Backlog & Sprints"
              description={hasBacklog ? 'Epics, tasks, dependencies and sprint suggestions — a separate execution artifact.' : 'Not available for this pack yet.'}
              actions={hasBacklog ? [
                { label: 'Open', onPress: () => { impact(); router.push(`/pack/${id}/backlog`); }, variant: 'primary' },
                { label: 'Download', onPress: () => { impact(); router.push(`/pack/${id}/backlog?download=1`); } },
              ] : []}
            />

            <DeliverableCard
              title="Vibe Coding Prompts"
              description={hasPrompts ? 'Self-contained prompts for AI coding agents, grouped by role.' : 'Not available for this pack yet.'}
              actions={hasPrompts ? [
                { label: 'Open', onPress: () => router.push(`/pack/${id}/prompts`), variant: 'primary' },
                { label: 'Download ZIP', onPress: promptsZipAction, loading: busy === 'prompts-zip' },
              ] : []}
            />

            <DeliverableCard
              title="ZIP Export"
              description="Everything in one bundle — PDF, markdown docs, backlog, prompts and metadata."
              actions={[{ label: 'Download', onPress: zipAction, loading: busy === 'zip', variant: 'primary' }]}
            />

            <Button
              label="Добавить комментарий"
              variant="secondary"
              onPress={() => { impact(); router.push(`/pack/${id}/amend`); }}
            />
          </>
        )}

        {!loading && !pack && !error && (
          <EmptyState icon="📦" title="Pack not found" body="Go back and try generating it again." />
        )}
      </View>
    </ScrollView>
  );
}
