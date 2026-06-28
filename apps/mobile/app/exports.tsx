import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { SemanticColor } from '@signalkit/ui';
import { Screen, ScreenTitle, Card, Badge, EmptyState } from '../components/ui';
import { useT } from '../lib/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExportJob {
  id: string;
  packId: string;
  type: string;
  language: string;
  roleBrief: string | null;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  artifact: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

function statusBadgeVariant(status: ExportJob['status']): SemanticColor {
  if (status === 'ready') return 'ready';
  if (status === 'failed') return 'failed';
  if (status === 'processing') return 'warning';
  return 'muted';
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Export detail card ────────────────────────────────────────────────────────

function ExportDetailCard({ job }: { job: ExportJob }) {
  const isReady = job.status === 'ready';
  const isFailed = job.status === 'failed';

  return (
    <View style={styles.jobCard}>
      <Card>
        <View style={styles.jobHeader}>
          <Text style={styles.jobType}>{typeLabel(job.type)}</Text>
          <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
        </View>

        <View style={styles.jobMeta}>
          <Text style={styles.metaItem}>Lang: <Text style={styles.metaValue}>{job.language.toUpperCase()}</Text></Text>
          {job.roleBrief ? (
            <Text style={styles.metaItem}>Role: <Text style={styles.metaValue}>{job.roleBrief}</Text></Text>
          ) : null}
          {job.artifact ? (
            <Text style={styles.metaItem}>Size: <Text style={styles.metaValue}>{fileSizeLabel(job.artifact.sizeBytes)}</Text></Text>
          ) : null}
          <Text style={styles.metaItem}>
            Created: <Text style={styles.metaValue}>{new Date(job.createdAt).toLocaleDateString()}</Text>
          </Text>
        </View>

        {isReady && job.artifact ? (
          <View style={styles.jobActions}>
            <Text style={styles.fileName}>{job.artifact.fileName}</Text>
            <Text style={styles.downloadNote}>Open the web app to download this export.</Text>
          </View>
        ) : null}

        {isFailed && job.errorCode ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>Error: {job.errorCode}</Text>
          </View>
        ) : null}

        {(job.status === 'queued' || job.status === 'processing') ? (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#555" />
            <Text style={styles.processingText}>
              {job.status === 'queued' ? 'Waiting in queue…' : 'Generating export…'}
            </Text>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ExportsScreen() {
  const t = useT();
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!wsId || !selectedPackId) return;
    try {
      const list = await apiGet<ExportJob[]>(`/workspaces/${wsId}/packs/${selectedPackId}/exports`);
      setJobs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exports');
    }
  }, [wsId, selectedPackId]);

  useEffect(() => {
    setLoading(true);
    apiGet<{ memberships: { workspace: { id: string } }[] }>('/me')
      .then((me) => {
        const id = me.memberships[0]?.workspace.id ?? null;
        setWsId(id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!wsId) return;
    apiGet<{ id: string }[]>(`/workspaces/${wsId}/niches`)
      .then((niches) => {
        if (niches.length === 0) return;
        return apiGet<{ id: string }[]>(`/workspaces/${wsId}/niches/${niches[0].id}/packs`);
      })
      .then((packs) => {
        if (packs && packs.length > 0) setSelectedPackId(packs[0].id);
      })
      .catch(() => {/* no packs yet */});
  }, [wsId]);

  useEffect(() => { void loadJobs(); }, [wsId, selectedPackId]);

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
    if (!hasActive) return;
    const timer = setInterval(() => { void loadJobs(); }, 3000);
    return () => clearInterval(timer);
  }, [jobs, loadJobs]);

  const readyCount = jobs.filter((j) => j.status === 'ready').length;
  const processingCount = jobs.filter((j) => j.status === 'processing' || j.status === 'queued').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  return (
    <Screen>
      <ScreenTitle title={t('export.center')} subtitle="Export your Product Document Pack" />

      {jobs.length > 0 ? (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{readyCount}</Text>
            <Text style={styles.statLabel}>Ready</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{processingCount}</Text>
            <Text style={styles.statLabel}>Processing</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, failedCount > 0 ? styles.statNumberFailed : null]}>{failedCount}</Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <Card>
          <ActivityIndicator size="large" color="#111" />
        </Card>
      ) : null}

      {error ? (
        <Card>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        {!loading && jobs.length === 0 ? (
          <Card>
            <EmptyState
              title="No exports yet"
              body="Use the web app to generate exports from your Product Document Pack."
            />
          </Card>
        ) : null}

        {jobs.map((job) => (
          <ExportDetailCard key={job.id} job={job} />
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.refreshBtn} onPress={() => { void loadJobs(); }}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>

      <Text style={styles.webNote}>
        To generate new exports, open the Export Center in the web app.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#f8f8f8', borderRadius: 6, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e8e8e8' },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#111' },
  statNumberFailed: { color: '#c00' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  jobCard: { marginBottom: 12 },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  jobType: { fontSize: 13, fontWeight: '600', color: '#111', flex: 1, marginRight: 8 },
  jobMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  metaItem: { fontSize: 11, color: '#888' },
  metaValue: { color: '#555', fontWeight: '500' },
  jobActions: { marginTop: 8 },
  fileName: { fontSize: 11, color: '#555', fontFamily: 'monospace', marginBottom: 4 },
  downloadNote: { fontSize: 11, color: '#888', fontStyle: 'italic' },
  errorRow: { marginTop: 6, backgroundColor: '#fff0f0', borderRadius: 4, padding: 6 },
  errorText: { fontSize: 11, color: '#c00' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  processingText: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  refreshBtn: { marginTop: 12, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 6, alignItems: 'center' },
  refreshText: { fontSize: 13, fontWeight: '600', color: '#111' },
  webNote: { marginTop: 16, fontSize: 11, color: '#aaa', textAlign: 'center', fontStyle: 'italic' },
});
