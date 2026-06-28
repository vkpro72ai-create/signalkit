/**
 * Home Dashboard — command center for founders and product teams.
 *
 * Shows: greeting · workspace · hero opportunity · venture thesis preview ·
 * product pack status · build blueprint · recent exports · upgrade prompt.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useEntitlements } from '../../lib/entitlements';
import { ApiException, workspaceApi, packApi } from '../../lib/api';
import { impact } from '../../lib/haptics';
import {
  tk, Card, HeroCard, Badge, ScoreGrid, SectionHeader,
  SkeletonCard, EmptyState, ErrorState, Divider, Spacer, Avatar,
  StatusDot, ScoreBar,
} from '../../components/brand';

function greeting(name?: string | null) {
  const h = new Date().getHours();
  const time = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${time}, ${name.split(' ')[0]}` : time;
}

type Niche = {
  id: string;
  name: string;
  opportunityScore: number;
  confidence: { level: string; value: number };
  ventureScaleScore?: number;
  buildReadinessScore?: number;
};

type ExportJob = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
};

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { plan, upgrade } = useEntitlements();

  const wsId = user?.workspaces?.[0]?.id;
  const wsName = user?.workspaces?.[0]?.name;

  const [niche, setNiche] = useState<Niche | null>(null);
  const [pack, setPack] = useState<Awaited<ReturnType<typeof packApi.get>> | null>(null);
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!wsId) { setLoading(false); return; }
    try {
      const niches = await workspaceApi.niches(wsId);
      const top = niches[0] ?? null;
      setNiche(top);

      if (top) {
        const packs = await packApi.list(wsId, top.id);
        if (packs[0]) {
          const p = await packApi.get(wsId, packs[0].id);
          setPack(p);
          const jobs = await packApi.exports(wsId, packs[0].id);
          setExports(jobs.slice(0, 3));
        }
      }
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load dashboard.');
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

  function nav(path: string) {
    impact();
    router.push(path as '/');
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tk.color.brand} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={{
        paddingTop: 64,
        paddingHorizontal: tk.space.base,
        paddingBottom: tk.space.lg,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: tk.color.subtle }}>
              {wsName ?? 'My workspace'}
            </Text>
            <Text style={{ color: tk.color.muted }}>›</Text>
          </View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.6, lineHeight: 36 }}>
            {greeting(user?.name)}
          </Text>
          <View style={{ marginTop: 8 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: tk.radius.full,
              backgroundColor: tk.color.brandFaint,
              borderWidth: 1,
              borderColor: tk.color.brandLight,
              alignSelf: 'flex-start',
            }}>
              <Text style={{ fontSize: 11 }}>✦</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: tk.color.brand }}>
                Evidence-backed workspace
              </Text>
            </View>
          </View>
        </View>
        <Pressable onPress={() => nav('/settings')} style={{ marginLeft: 12, marginTop: 12 }}>
          <Avatar name={user?.name} size={40} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: tk.space.base, gap: tk.space.xl }}>

        {/* ── Loading ── */}
        {loading && (
          <View style={{ gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}

        {/* ── Error ── */}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {/* ── No workspace ── */}
        {!loading && !wsId && !error && (
          <EmptyState
            icon="🏗️"
            title="No workspace yet"
            body="Create a workspace on the web app to get started. Mobile gives you full read access and smart summaries."
          />
        )}

        {/* ── No project / niche ── */}
        {!loading && wsId && !niche && !error && (
          <EmptyState
            icon="🎯"
            title="Find your first opportunity"
            body="Use the web app to run a niche analysis. Your top opportunity will appear here."
          />
        )}

        {/* ── Hero Opportunity Card ── */}
        {!loading && niche && (
          <>
            <View>
              <SectionHeader title="Top Opportunity" action="All" onAction={() => nav('/opportunities')} />
              <Pressable onPress={() => nav(`/opportunity/${niche.id}`)}>
                <HeroCard>
                  <View style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 19, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.3, lineHeight: 26 }}>
                        {niche.name}
                      </Text>
                      <Badge variant="opportunity" size="sm">View →</Badge>
                    </View>

                    <Divider style={{ marginVertical: 0 }} />

                    <ScoreGrid
                      opportunity={niche.opportunityScore}
                      confidence={niche.confidence.value}
                      ventureScale={niche.ventureScaleScore ?? null}
                      buildReadiness={niche.buildReadinessScore ?? null}
                    />
                  </View>
                </HeroCard>
              </Pressable>
            </View>

            {/* ── Venture Thesis Preview ── */}
            <View>
              <SectionHeader title="Venture Thesis" action="Full thesis" onAction={() => nav(`/opportunity/${niche.id}`)} />
              <Card style={{ gap: 0 }}>
                {[
                  { icon: '⚡', label: 'Why now', placeholder: 'Timing rationale from evidence' },
                  { icon: '🪝', label: 'Entry wedge', placeholder: 'Initial beachhead strategy' },
                  { icon: '↗', label: 'Expansion path', placeholder: 'Subsequent market moves' },
                  { icon: '⚠', label: 'Kill reasons', placeholder: 'Why this could fail' },
                ].map((row, i, arr) => (
                  <View key={row.label}>
                    <Pressable
                      onPress={() => nav(`/opportunity/${niche.id}`)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 14,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{row.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.ink }}>{row.label}</Text>
                        <Text style={{ fontSize: 12, color: tk.color.muted, marginTop: 1 }}>{row.placeholder}</Text>
                      </View>
                      <Text style={{ color: tk.color.muted }}>›</Text>
                    </Pressable>
                    {i < arr.length - 1 && <Divider style={{ marginVertical: 0 }} />}
                  </View>
                ))}
              </Card>
            </View>

            {/* ── Product Pack Status ── */}
            {pack && (
              <View>
                <SectionHeader title="Product Pack" action="Open" onAction={() => nav(`/pack/${pack.id}`)} />
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.ink }}>{pack.documentCount}</Text>
                      <Text style={{ fontSize: 11, color: tk.color.subtle, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 }}>Docs</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: tk.color.line }} />
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.opportunity }}>{pack.approvedCount}</Text>
                      <Text style={{ fontSize: 11, color: tk.color.subtle, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 }}>Approved</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: tk.color.line }} />
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.warning }}>{pack.inReviewCount}</Text>
                      <Text style={{ fontSize: 11, color: tk.color.subtle, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 }}>In review</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: tk.color.line }} />
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.risk }}>{pack.changesRequestedCount}</Text>
                      <Text style={{ fontSize: 11, color: tk.color.subtle, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 }}>Changes</Text>
                    </View>
                  </View>
                  <Divider style={{ marginVertical: 8 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: tk.color.subtle }}>
                      Depth: <Text style={{ fontWeight: '700', color: tk.color.ink }}>{pack.depth.replace(/_/g, ' ')}</Text>
                    </Text>
                    <Pressable onPress={() => nav(`/pack/${pack.id}`)}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.brand }}>Open Pack →</Text>
                    </Pressable>
                  </View>
                </Card>
              </View>
            )}

            {/* ── Build Blueprint Preview ── */}
            <View>
              <SectionHeader title="Build Blueprint" action="View" onAction={() => nav(`/blueprint/${niche.id}`)} />
              <Card style={{ gap: 12 }}>
                <ScoreBar
                  score={niche.buildReadinessScore ?? null}
                  label="Build Readiness"
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['Screen contracts', 'API-to-screen map', 'DO_NOT_BUILD', 'Component specs'].map((item) => (
                    <View key={item} style={{
                      paddingVertical: 4, paddingHorizontal: 10,
                      borderRadius: tk.radius.full,
                      borderWidth: 1, borderColor: tk.color.line,
                      backgroundColor: tk.color.brandFaint,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: tk.color.brand }}>✓ {item}</Text>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => nav(`/blueprint/${niche.id}`)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.brand }}>View Blueprint →</Text>
                </Pressable>
              </Card>
            </View>

            {/* ── Recent Exports ── */}
            {exports.length > 0 && (
              <View>
                <SectionHeader title="Recent Exports" action="All" onAction={() => nav('/exports')} />
                <Card style={{ gap: 0 }}>
                  {exports.map((job, i) => (
                    <View key={job.id}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
                        <StatusDot status={job.status as 'ready' | 'processing' | 'failed' | 'queued' | 'expired'} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: tk.color.ink }}>
                            {job.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Text>
                          <Text style={{ fontSize: 12, color: tk.color.muted }}>
                            {new Date(job.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                        <Badge
                          variant={job.status === 'ready' ? 'ready' : job.status === 'failed' ? 'failed' : 'muted'}
                          size="sm"
                        >
                          {job.status}
                        </Badge>
                      </View>
                      {i < exports.length - 1 && <Divider style={{ marginVertical: 0 }} />}
                    </View>
                  ))}
                </Card>
              </View>
            )}
          </>
        )}

        {/* ── Upgrade Banner ── */}
        {plan === 'free' && !loading && (
          <Pressable
            onPress={() => { impact(); upgrade(); router.push('/paywall'); }}
            style={({ pressed }) => ({
              borderRadius: tk.radius.lg,
              borderWidth: 1.5,
              borderColor: tk.color.brand,
              backgroundColor: tk.color.brandFaint,
              padding: tk.space.base,
              opacity: pressed ? 0.88 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            })}
          >
            <Text style={{ fontSize: 28 }}>🔓</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.brand }}>Unlock Pro</Text>
              <Text style={{ fontSize: 13, color: tk.color.brandMid, marginTop: 1 }}>
                Export PDFs, AI bundles, full Pack depth and multi-market analysis.
              </Text>
            </View>
            <Text style={{ color: tk.color.brand, fontSize: 18 }}>›</Text>
          </Pressable>
        )}

        <Spacer h={20} />
      </View>
    </ScrollView>
  );
}
