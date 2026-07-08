/**
 * Packs tab — list Product Document Packs across projects.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useEntitlements } from '../../lib/entitlements';
import { workspaceApi, packApi, ApiException } from '../../lib/api';
import { impact } from '../../lib/haptics';
import type { SemanticColor } from '@signalkit/ui';
import {
  tk, Card, Badge, IconButton, SkeletonCard, EmptyState, ErrorState, Divider, PaywallGate,
} from '../../components/brand';

type PackWithNiche = {
  pack: Awaited<ReturnType<typeof packApi.list>>[number];
  nicheId: string;
  nicheName: string;
};

export default function Packs() {
  const router = useRouter();
  const { user } = useAuth();
  const { canFullPack } = useEntitlements();
  const wsId = user?.workspaces?.[0]?.id;

  const [packs, setPacks] = useState<PackWithNiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!wsId) { setLoading(false); return; }
    try {
      const niches = await workspaceApi.niches(wsId);
      const results: PackWithNiche[] = [];
      for (const niche of niches.slice(0, 5)) {
        const ps = await packApi.list(wsId, niche.id);
        for (const p of ps) {
          results.push({ pack: p, nicheId: niche.id, nicheName: niche.name });
        }
      }
      setPacks(results);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load packs.');
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

  function statusVariant(status: string): SemanticColor {
    if (status === 'ready') return 'ready';
    if (status === 'generating') return 'evidence';
    if (status === 'failed') return 'failed';
    return 'muted';
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tk.color.brand} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{
        paddingTop: 64, paddingHorizontal: tk.space.base, paddingBottom: tk.space.lg,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.4 }}>Product Packs</Text>
          <Text style={{ fontSize: 14, color: tk.color.subtle, marginTop: 4 }}>
            Document collections across your projects
          </Text>
        </View>
        <IconButton icon="+" onPress={() => { impact(); router.push('/pack/create'); }} />
      </View>

      <View style={{ paddingHorizontal: tk.space.base, gap: 12 }}>
        {loading && [1, 2].map((i) => <SkeletonCard key={i} />)}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !wsId && <EmptyState icon="⊡" title="No workspace" body="Connect a workspace on the web app." />}
        {!loading && wsId && packs.length === 0 && !error && (
          <EmptyState
            icon="⊡"
            title="No packs yet"
            body="Generate a Product Pack from the web app after creating a project and finding opportunities."
          />
        )}

        {!loading && packs.map(({ pack, nicheName }) => {
          const isPremium = pack.depth !== 'quick_opportunity' && !canFullPack;
          return (
            <Pressable
              key={pack.id}
              onPress={() => {
                impact();
                if (isPremium) { router.push('/paywall'); return; }
                router.push(`/pack/${pack.id}`);
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <Card style={{ gap: 12 }}>
                <PaywallGate locked={isPremium} onUnlock={() => router.push('/paywall')}>
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: tk.color.brand, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>
                          {nicheName}
                        </Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: tk.color.ink }}>
                          {pack.depth.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Pack
                        </Text>
                      </View>
                      <Badge variant={statusVariant(pack.status)} size="sm">
                        {pack.status}
                      </Badge>
                    </View>

                    <Divider style={{ marginVertical: 12 }} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: tk.color.ink }}>{pack.documentCount}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Docs</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: tk.color.opportunity }}>{pack.approvedCount}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Approved</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: tk.color.warning }}>{pack.inReviewCount}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Review</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '500', color: tk.color.muted, marginTop: 4 }}>
                          {pack.language.toUpperCase()}
                        </Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Lang</Text>
                      </View>
                    </View>
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
