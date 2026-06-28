import { useState, useEffect } from 'react';
import { Text, ScrollView, View, TouchableOpacity } from 'react-native';
import type { DocumentStatus } from '@signalkit/shared';
import { Screen, ScreenTitle, Card, DocumentStatusPill } from '../components/ui';
import { useT } from '../lib/i18n';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

function authHeaders(): Record<string, string> {
  return {};
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

interface DocSummary {
  id: string;
  docType: string;
  title: string;
  status: string;
  version: number;
  qualityGateStatus: string;
  language: string;
}

interface ResearchUpdate {
  id: string;
  title: string;
  type: string;
  createdAt: string;
}

interface Pack {
  id: string;
  title: string;
  depth: string;
  status: string;
  primaryLanguage: string;
  documents: DocSummary[];
}

const STATUS_DOT: Record<string, string> = {
  draft: '#9CA3AF',
  in_review: '#D97706',
  changes_requested: '#DC2626',
  approved: '#16A34A',
  locked: '#1E40AF',
  archived: '#6B7280',
};

export default function PackScreen() {
  const t = useT();
  const [pack, setPack] = useState<Pack | null>(null);
  const [researchUpdates, setResearchUpdates] = useState<ResearchUpdate[]>([]);
  const [selected, setSelected] = useState<DocSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const me = await apiGet<{ memberships: { workspace: { id: string } }[] }>('/me');
        const ws = me.memberships[0]?.workspace.id;
        if (!ws) return;
        const projects = await apiGet<{ id: string }[]>(`/workspaces/${ws}/projects`);
        const pid = projects[0]?.id;
        if (!pid) return;
        const niches = await apiGet<{ id: string }[]>(`/workspaces/${ws}/projects/${pid}/niches`);
        const nid = niches[0]?.id;
        if (!nid) return;
        const packs = await apiGet<{ id: string }[]>(`/workspaces/${ws}/niches/${nid}/packs`);
        const pid2 = packs[0]?.id;
        if (!pid2) return;
        const p = await apiGet<Pack>(`/workspaces/${ws}/packs/${pid2}`);
        setPack(p);
        const ru = await apiGet<ResearchUpdate[]>(`/workspaces/${ws}/packs/${pid2}/research-updates`);
        setResearchUpdates(ru);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Screen>
        <ScreenTitle title={t('nav.pack')} subtitle="Loading…" />
      </Screen>
    );
  }

  if (!pack) {
    return (
      <Screen>
        <ScreenTitle title={t('nav.pack')} subtitle="No pack generated yet." />
      </Screen>
    );
  }

  if (selected) {
    return (
      <Screen>
        <TouchableOpacity onPress={() => setSelected(null)} style={{ marginBottom: 12 }}>
          <Text style={{ color: '#5A626E', fontSize: 14 }}>← Back to pack</Text>
        </TouchableOpacity>
        <ScreenTitle title={selected.title} subtitle={`v${selected.version} · ${selected.language}`} />
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <DocumentStatusPill status={selected.status as DocumentStatus} label={selected.status.replace(/_/g, ' ')} />
            <Text style={{ fontSize: 12, color: '#5A626E' }}>Quality: {selected.qualityGateStatus}</Text>
          </View>
        </Card>
        <Text style={{ fontSize: 12, color: '#5A626E', marginTop: 8, marginBottom: 4 }}>
          This document is read-only on mobile. Use the web workspace to edit, review, or comment.
        </Text>
      </Screen>
    );
  }

  const stats = {
    total: pack.documents.length,
    approved: pack.documents.filter((d) => d.status === 'approved' || d.status === 'locked').length,
    inReview: pack.documents.filter((d) => d.status === 'in_review').length,
    needsChange: pack.documents.filter((d) => d.status === 'changes_requested').length,
  };

  return (
    <Screen>
      <ScreenTitle title={t('nav.pack')} subtitle={pack.title} />

      {/* Status summary */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <StatBox label="Docs" value={stats.total} />
          <StatBox label="Approved" value={stats.approved} color="#16A34A" />
          <StatBox label="In review" value={stats.inReview} color="#D97706" />
          <StatBox label="Changes" value={stats.needsChange} color="#DC2626" />
        </View>
      </Card>

      {/* Documents */}
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#5A626E', marginTop: 12, marginBottom: 6 }}>Documents</Text>
      <ScrollView>
        {pack.documents.map((d, i) => (
          <TouchableOpacity key={d.id} onPress={() => setSelected(d)}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: '#1B1F24', fontSize: 13, fontWeight: '500' }}>
                    {String(i + 1).padStart(2, '0')} {d.title}
                  </Text>
                  <Text style={{ color: '#5A626E', fontSize: 11 }}>v{d.version} · {d.language}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_DOT[d.status] ?? '#9CA3AF' }} />
                  <DocumentStatusPill status={d.status as DocumentStatus} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Research updates */}
        {researchUpdates.length > 0 && (
          <>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#5A626E', marginTop: 16, marginBottom: 6 }}>Research Updates</Text>
            {researchUpdates.map((ru) => (
              <Card key={ru.id}>
                <Text style={{ color: '#1B1F24', fontSize: 13, fontWeight: '500' }}>{ru.title}</Text>
                <Text style={{ color: '#5A626E', fontSize: 11 }}>
                  {ru.type.replace(/_/g, ' ')} · {new Date(ru.createdAt).toLocaleDateString()}
                </Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatBox({ label, value, color = '#5A626E' }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color }}>{value}</Text>
      <Text style={{ fontSize: 11, color: '#5A626E' }}>{label}</Text>
    </View>
  );
}
