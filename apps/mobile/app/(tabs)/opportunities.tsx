/**
 * Opportunities tab — list of all niches with full scoring display.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { workspaceApi, ApiException } from '../../lib/api';
import { impact } from '../../lib/haptics';
import {
  tk, Card, Badge, ScoreGrid, SectionHeader, SkeletonCard,
  EmptyState, ErrorState, Divider, Spacer, ScoreBar,
} from '../../components/brand';
import { confidenceVariant } from '@signalkit/ui';

type Niche = {
  id: string;
  name: string;
  opportunityScore: number;
  confidence: { level: string; value: number };
  ventureScaleScore?: number;
  buildReadinessScore?: number;
};

export default function Opportunities() {
  const router = useRouter();
  const { user } = useAuth();
  const wsId = user?.workspaces?.[0]?.id;

  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!wsId) { setLoading(false); return; }
    try {
      const data = await workspaceApi.niches(wsId);
      setNiches(data);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load opportunities.');
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = niches.filter((n) =>
    n.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tk.color.brand} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ paddingTop: 64, paddingHorizontal: tk.space.base, paddingBottom: tk.space.base }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.4 }}>Opportunities</Text>
        <Text style={{ fontSize: 14, color: tk.color.subtle, marginTop: 4 }}>
          {niches.length} niche{niches.length !== 1 ? 's' : ''} · scored and ranked
        </Text>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: tk.space.base, marginBottom: tk.space.base }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: tk.color.surface,
          borderColor: tk.color.line, borderWidth: 1.5,
          borderRadius: tk.radius.md, paddingHorizontal: 12, height: 44,
        }}>
          <Text style={{ fontSize: 16, color: tk.color.muted, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, fontSize: 15, color: tk.color.ink }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search opportunities..."
            placeholderTextColor={tk.color.muted}
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: tk.space.base, gap: 12 }}>
        {loading && [1, 2, 3].map((i) => <SkeletonCard key={i} />)}

        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !wsId && !error && (
          <EmptyState icon="◎" title="No workspace" body="Connect to a workspace on the web app first." />
        )}

        {!loading && wsId && filtered.length === 0 && !error && (
          <EmptyState
            icon="◎"
            title={search ? 'No matches' : 'No opportunities yet'}
            body={search ? 'Try a different search term.' : 'Run a niche analysis on the web to populate this list.'}
          />
        )}

        {!loading && filtered.map((niche) => (
          <Pressable
            key={niche.id}
            onPress={() => { impact(); router.push(`/opportunity/${niche.id}`); }}
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
          >
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: tk.color.ink, lineHeight: 22, marginRight: 8 }}>
                  {niche.name}
                </Text>
                <Badge
                  variant={confidenceVariant(niche.confidence.level as any)}
                  size="sm"
                >
                  {niche.confidence.level.replace(/_/g, ' ')}
                </Badge>
              </View>

              <Divider style={{ marginVertical: 0 }} />

              <ScoreGrid
                opportunity={niche.opportunityScore}
                confidence={niche.confidence.value}
                ventureScale={niche.ventureScaleScore ?? null}
                buildReadiness={niche.buildReadinessScore ?? null}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: tk.color.brand }}>View thesis →</Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
