/**
 * Exports tab — view export jobs across packs.
 * Shows status, type, metadata. Download/open on web.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useEntitlements } from '../../lib/entitlements';
import { workspaceApi, packApi, ApiException } from '../../lib/api';
import { impact } from '../../lib/haptics';
import {
  tk, Card, Badge, SectionHeader, SkeletonCard, EmptyState, ErrorState, Divider, Spacer, StatusDot, PaywallGate,
} from '../../components/brand';

type ExportJob = {
  id: string;
  type: string;
  status: string;
  language?: string;
  roleBrief?: string;
  fileSize?: number;
  fileName?: string;
  createdAt: string;
  error?: string;
};

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusVariant(status: string): any {
  if (status === 'ready') return 'ready';
  if (status === 'processing' || status === 'queued') return 'evidence';
  if (status === 'failed') return 'failed';
  return 'muted';
}

export default function Exports() {
  const router = useRouter();
  const { user } = useAuth();
  const { canExportPDF, canExportBundle } = useEntitlements();
  const wsId = user?.workspaces?.[0]?.id;

  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [packId, setPackId] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!wsId) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    try {
      const niches = await workspaceApi.niches(wsId);
      const niche = niches[0];
      if (!niche) { setLoading(false); return; }

      const packs = await packApi.list(wsId, niche.id);
      const p = packs[0];
      if (!p) { setLoading(false); return; }

      setPackId(p.id);
      const data = await packApi.exports(wsId, p.id);
      setJobs(data);

      // Poll if any jobs are active
      const hasActive = data.some((j) => j.status === 'queued' || j.status === 'processing');
      if (hasActive) {
        pollingRef.current = setTimeout(() => load(true), 3000);
      }
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load exports.');
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => {
    load();
    return () => { if (pollingRef.current) clearTimeout(pollingRef.current); };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const readyCount = jobs.filter((j) => j.status === 'ready').length;
  const processingCount = jobs.filter((j) => j.status === 'processing' || j.status === 'queued').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  const isPremiumType = (type: string) => {
    const pdf = type.includes('pdf');
    const bundle = type.includes('bundle') || type.includes('engineering') || type.includes('ai_agent');
    if (pdf && !canExportPDF) return true;
    if (bundle && !canExportBundle) return true;
    return false;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tk.color.brand} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ paddingTop: 64, paddingHorizontal: tk.space.base, paddingBottom: tk.space.base }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.4 }}>Exports</Text>
        <Text style={{ fontSize: 14, color: tk.color.subtle, marginTop: 4 }}>
          PDFs, AI bundles, role briefs and Markdown ZIPs
        </Text>
      </View>

      {/* Stats Row */}
      {!loading && jobs.length > 0 && (
        <View style={{ paddingHorizontal: tk.space.base, marginBottom: tk.space.base }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { label: 'Ready', count: readyCount, color: tk.color.success },
              { label: 'Processing', count: processingCount, color: '#3B82F6' },
              { label: 'Failed', count: failedCount, color: tk.color.risk },
            ].map((s) => (
              <View key={s.label} style={{
                flex: 1, backgroundColor: tk.color.surface, borderColor: tk.color.line,
                borderWidth: 1, borderRadius: tk.radius.md, padding: 12, alignItems: 'center',
              }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: s.color }}>{s.count}</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: tk.space.base, gap: 10 }}>
        {loading && [1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !wsId && <EmptyState icon="↓" title="No workspace" body="Connect a workspace on the web app." />}
        {!loading && wsId && jobs.length === 0 && !error && (
          <EmptyState
            icon="↓"
            title="No exports yet"
            body="Generate exports from the web Export Center. They'll appear here with live status."
          />
        )}

        {!loading && jobs.map((job) => {
          const locked = isPremiumType(job.type);
          return (
            <Pressable
              key={job.id}
              onPress={() => { impact(); if (locked) router.push('/paywall'); }}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <Card>
                <PaywallGate locked={locked} onUnlock={() => router.push('/paywall')}>
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <View style={{ paddingTop: 3 }}>
                        <StatusDot status={job.status as 'ready' | 'processing' | 'failed' | 'queued' | 'expired'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.ink }}>
                          {formatType(job.type)}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {job.language && (
                            <Text style={{ fontSize: 12, color: tk.color.subtle }}>{job.language.toUpperCase()}</Text>
                          )}
                          {job.roleBrief && (
                            <Text style={{ fontSize: 12, color: tk.color.subtle }}>· {job.roleBrief}</Text>
                          )}
                          {job.fileSize ? (
                            <Text style={{ fontSize: 12, color: tk.color.muted }}>· {formatBytes(job.fileSize)}</Text>
                          ) : null}
                        </View>
                      </View>
                      <Badge variant={statusVariant(job.status)} size="sm">{job.status}</Badge>
                    </View>

                    {job.status === 'processing' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color={tk.color.brand} />
                        <Text style={{ fontSize: 12, color: tk.color.subtle }}>Generating…</Text>
                      </View>
                    )}

                    {job.status === 'ready' && (
                      <View style={{
                        backgroundColor: tk.color.brandFaint,
                        borderRadius: tk.radius.sm,
                        padding: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <Text style={{ fontSize: 11 }}>💻</Text>
                        <Text style={{ fontSize: 12, color: tk.color.brand, fontWeight: '500', flex: 1 }}>
                          Open the web app to download {job.fileName ?? 'this file'}.
                        </Text>
                      </View>
                    )}

                    {job.status === 'failed' && job.error && (
                      <View style={{
                        backgroundColor: tk.color.riskBg,
                        borderRadius: tk.radius.sm,
                        padding: 8,
                      }}>
                        <Text style={{ fontSize: 12, color: tk.color.risk }}>{job.error}</Text>
                      </View>
                    )}

                    <Text style={{ fontSize: 11, color: tk.color.muted }}>
                      {new Date(job.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </PaywallGate>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
