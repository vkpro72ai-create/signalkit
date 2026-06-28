/**
 * Build Blueprint mobile view — coverage summary, DO_NOT_BUILD, API-to-screen map.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useEntitlements } from '../../lib/entitlements';
import { api, ApiException } from '../../lib/api';
import { impact } from '../../lib/haptics';
import {
  tk, Card, HeroCard, Badge, SectionHeader, ScoreBar, SkeletonCard,
  EmptyState, ErrorState, Divider, Spacer, PaywallGate,
} from '../../components/brand';

type ScreenContract = {
  screenName: string;
  route: string;
  purpose?: string;
  hasEmptyState: boolean;
  hasLoadingState: boolean;
  hasErrorState: boolean;
};

type ApiToScreen = {
  endpoint: string;
  method: string;
  screens: string[];
};

type Blueprint = {
  id: string;
  buildReadinessScore?: number;
  screenContracts?: ScreenContract[];
  apiToScreenMap?: ApiToScreen[];
  doNotBuild?: string[];
  componentContracts?: Array<{ name: string; props?: string[] }>;
  permissionMatrix?: Array<{ role: string; access: string[] }>;
  analyticsEvents?: Array<{ name: string; trigger?: string }>;
  warnings?: string[];
};

export default function BlueprintDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { canBuildBlueprint, canAdvancedBlueprintDetails } = useEntitlements();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wsId || !id) { setLoading(false); return; }
    try {
      const data = await api.get<Blueprint>(`/workspaces/${wsId}/niches/${id}/blueprint`);
      setBlueprint(data);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load blueprint.');
    } finally {
      setLoading(false);
    }
  }, [wsId, id]);

  useEffect(() => { load(); }, [load]);

  const screens = blueprint?.screenContracts ?? [];
  const screenCount = screens.length;
  const coveredEmptyState = screens.filter((s) => s.hasEmptyState).length;
  const coveredLoadingState = screens.filter((s) => s.hasLoadingState).length;
  const coveredErrorState = screens.filter((s) => s.hasErrorState).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 64 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={tk.color.brand} />}
    >
      <View style={{ paddingHorizontal: tk.space.base, gap: tk.space.xl, paddingTop: tk.space.base }}>

        {loading && <SkeletonCard />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !blueprint && !error && (
          <EmptyState
            icon="🗺️"
            title="Blueprint not generated"
            body="Generate the Build Blueprint from the web app to see full screen contracts, API maps and component specs."
          />
        )}

        {!loading && blueprint && (
          <>
            {/* Build Readiness Score */}
            <HeroCard>
              <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.subtle, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
                Build Blueprint
              </Text>
              <ScoreBar score={blueprint.buildReadinessScore ?? null} label="Build Readiness Score" />
            </HeroCard>

            {/* Coverage summary */}
            {screenCount > 0 && (
              <View>
                <SectionHeader title="Screen Coverage" />
                <Card style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.ink }}>{screenCount}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Screens</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.opportunity }}>{coveredEmptyState}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Empty</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.confidence }}>{coveredLoadingState}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Loading</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 28, fontWeight: '800', color: tk.color.risk }}>{coveredErrorState}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>Error</Text>
                    </View>
                  </View>
                  <ScoreBar
                    score={screenCount > 0 ? Math.round((coveredEmptyState / screenCount) * 100) : null}
                    label="Empty state coverage"
                  />
                </Card>
              </View>
            )}

            {/* Screen Contracts */}
            {screenCount > 0 && (
              <PaywallGate locked={!canBuildBlueprint} onUnlock={() => router.push('/paywall')}>
                <View>
                  <SectionHeader title={`Screen Contracts (${screenCount})`} />
                  <View style={{ gap: 8 }}>
                    {screens.map((s, i) => (
                      <Card key={i} style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.ink }}>{s.screenName}</Text>
                            <Text style={{ fontSize: 12, color: tk.color.muted, fontFamily: 'monospace', marginTop: 2 }}>{s.route}</Text>
                          </View>
                        </View>
                        {s.purpose && (
                          <Text style={{ fontSize: 13, color: tk.color.subtle, lineHeight: 18 }}>{s.purpose}</Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {s.hasEmptyState && <Badge variant="ready" size="sm">Empty state ✓</Badge>}
                          {s.hasLoadingState && <Badge variant="confidence" size="sm">Loading ✓</Badge>}
                          {s.hasErrorState && <Badge variant="warning" size="sm">Error ✓</Badge>}
                          {!s.hasEmptyState && <Badge variant="muted" size="sm">Empty state ✗</Badge>}
                        </View>
                      </Card>
                    ))}
                  </View>
                </View>
              </PaywallGate>
            )}

            {/* DO_NOT_BUILD */}
            {(blueprint.doNotBuild?.length ?? 0) > 0 && (
              <View>
                <SectionHeader title="DO NOT BUILD" />
                <Card style={{ borderColor: tk.color.riskBorder, borderWidth: 1.5, gap: 10 }}>
                  <Text style={{ fontSize: 12, color: tk.color.risk, fontWeight: '600', letterSpacing: 0.3 }}>
                    These features are explicitly out of scope for the initial build.
                  </Text>
                  {blueprint.doNotBuild?.map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <Text style={{ color: tk.color.risk, fontWeight: '700', fontSize: 14 }}>✕</Text>
                      <Text style={{ flex: 1, fontSize: 14, color: tk.color.ink, lineHeight: 20 }}>{item}</Text>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* API-to-screen map */}
            {(blueprint.apiToScreenMap?.length ?? 0) > 0 && (
              <PaywallGate locked={!canAdvancedBlueprintDetails} onUnlock={() => router.push('/paywall')}>
                <View>
                  <SectionHeader title={`API-to-Screen Map (${blueprint.apiToScreenMap?.length ?? 0} endpoints)`} />
                  <View style={{ gap: 8 }}>
                    {blueprint.apiToScreenMap?.map((entry, i) => (
                      <Card key={i} style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <View style={{
                            paddingHorizontal: 7, paddingVertical: 2,
                            borderRadius: 4, backgroundColor: tk.color.brandFaint,
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: tk.color.brand, fontFamily: 'monospace' }}>
                              {entry.method}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, color: tk.color.subtle, fontFamily: 'monospace', flex: 1 }}>
                            {entry.endpoint}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {entry.screens.map((s) => (
                            <View key={s} style={{
                              paddingHorizontal: 8, paddingVertical: 2,
                              borderRadius: tk.radius.full, borderWidth: 1, borderColor: tk.color.line,
                            }}>
                              <Text style={{ fontSize: 11, color: tk.color.subtle }}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      </Card>
                    ))}
                  </View>
                </View>
              </PaywallGate>
            )}

            {/* Warnings */}
            {(blueprint.warnings?.length ?? 0) > 0 && (
              <View>
                <SectionHeader title="Build Warnings" />
                <View style={{
                  backgroundColor: tk.color.warningBg, borderColor: tk.color.warningBorder,
                  borderWidth: 1, borderRadius: tk.radius.lg, padding: 14, gap: 8,
                }}>
                  {blueprint.warnings?.map((w, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ color: tk.color.warning, fontWeight: '700' }}>⚠</Text>
                      <Text style={{ flex: 1, fontSize: 13, color: tk.color.warning, lineHeight: 18 }}>{w}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
