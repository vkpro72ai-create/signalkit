/**
 * Opportunity detail — full Venture Thesis, all 4 scores, thesis sections.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { ApiException, api } from '../../lib/api';
import { impact } from '../../lib/haptics';
import {
  tk, Card, HeroCard, ScoreGrid, ScoreBar, SectionHeader,
  SkeletonCard, EmptyState, ErrorState,
} from '../../components/brand';

type Niche = {
  id: string;
  name: string;
  opportunityScore: number;
  confidence: { level: string; value: number };
  ventureScaleScore?: number;
  buildReadinessScore?: number;
  ventureThesis?: {
    whyNow?: string;
    macroShifts?: string[];
    entryWedge?: string;
    expansionPath?: string;
    painEconomics?: string;
    distributionWedge?: string;
    dataMoat?: string;
    killReasons?: string[];
    whatMustBeTrue?: string[];
    firstValidationExperiments?: string[];
    unresolvedQuestions?: string[];
    assumptions?: string[];
    evidenceConfidence?: string;
  };
};

type ThesisSection = {
  icon: string;
  label: string;
  key: keyof NonNullable<Niche['ventureThesis']>;
  isList?: boolean;
  isWarning?: boolean;
};

const SECTIONS: ThesisSection[] = [
  { icon: '⚡', label: 'Why now', key: 'whyNow' },
  { icon: '🔄', label: 'Macro shifts', key: 'macroShifts', isList: true },
  { icon: '🪝', label: 'Entry wedge', key: 'entryWedge' },
  { icon: '↗', label: 'Expansion path', key: 'expansionPath' },
  { icon: '💸', label: 'Pain economics', key: 'painEconomics' },
  { icon: '📡', label: 'Distribution wedge', key: 'distributionWedge' },
  { icon: '🏛', label: 'Data / workflow moat', key: 'dataMoat' },
  { icon: '⚠', label: 'Kill reasons', key: 'killReasons', isList: true, isWarning: true },
  { icon: '✓', label: 'What must be true', key: 'whatMustBeTrue', isList: true },
  { icon: '🧪', label: 'First experiments', key: 'firstValidationExperiments', isList: true },
  { icon: '🔵', label: 'Assumptions', key: 'assumptions', isList: true },
  { icon: '❓', label: 'Unresolved questions', key: 'unresolvedQuestions', isList: true },
];

export default function OpportunityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  const [niche, setNiche] = useState<Niche | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wsId || !id) { setLoading(false); return; }
    try {
      const data = await api.get<Niche>(`/workspaces/${wsId}/niches/${id}`);
      setNiche(data);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load opportunity.');
    } finally {
      setLoading(false);
    }
  }, [wsId, id]);

  useEffect(() => { load(); }, [load]);

  const thesis = niche?.ventureThesis;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ paddingBottom: 64 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={tk.color.brand} />}
    >
      <View style={{ paddingHorizontal: tk.space.base, gap: tk.space.xl, paddingTop: tk.space.lg }}>

        {loading && <SkeletonCard />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && niche && (
          <>
            {/* Hero */}
            <HeroCard>
              <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.3, marginBottom: 16, lineHeight: 28 }}>
                {niche.name}
              </Text>
              <ScoreGrid
                opportunity={niche.opportunityScore}
                confidence={niche.confidence.value}
                ventureScale={niche.ventureScaleScore ?? null}
                buildReadiness={niche.buildReadinessScore ?? null}
              />
            </HeroCard>

            {/* Score bars */}
            <Card style={{ gap: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.subtle, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Scores
              </Text>
              <ScoreBar score={niche.opportunityScore} label="Opportunity Score" />
              <ScoreBar score={Math.round(niche.confidence.value * 100)} label="Confidence Score" />
              {niche.ventureScaleScore !== undefined && (
                <ScoreBar score={niche.ventureScaleScore} label="Venture Scale Score" />
              )}
              {niche.buildReadinessScore !== undefined && (
                <ScoreBar score={niche.buildReadinessScore} label="Build Readiness Score" />
              )}
            </Card>

            {/* Evidence confidence note */}
            {thesis?.evidenceConfidence && (
              <View style={{
                backgroundColor: tk.color.confidenceBg,
                borderColor: tk.color.confidenceBorder,
                borderWidth: 1,
                borderRadius: tk.radius.md,
                padding: 12,
                flexDirection: 'row',
                gap: 8,
              }}>
                <Text style={{ fontSize: 14 }}>ℹ</Text>
                <Text style={{ fontSize: 13, color: tk.color.confidence, flex: 1, lineHeight: 18 }}>
                  {thesis.evidenceConfidence}
                </Text>
              </View>
            )}

            {/* Venture Thesis Sections */}
            {thesis && (
              <View>
                <SectionHeader title="Venture Thesis" />
                <View style={{ gap: 10 }}>
                  {SECTIONS.map((section) => {
                    const val = thesis[section.key];
                    if (!val) return null;
                    const isEmpty =
                      (Array.isArray(val) && val.length === 0) ||
                      (typeof val === 'string' && val.trim() === '');
                    if (isEmpty) return null;

                    return (
                      <Card key={section.key} style={{ gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 18 }}>{section.icon}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: section.isWarning ? tk.color.risk : tk.color.ink }}>
                            {section.label}
                          </Text>
                        </View>
                        {section.isList && Array.isArray(val) ? (
                          <View style={{ gap: 6 }}>
                            {(val as string[]).map((item, i) => (
                              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                                <Text style={{ color: section.isWarning ? tk.color.risk : tk.color.brand, fontWeight: '700' }}>
                                  {section.isWarning ? '✕' : '·'}
                                </Text>
                                <Text style={{ flex: 1, fontSize: 14, color: tk.color.ink, lineHeight: 20 }}>
                                  {item}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={{ fontSize: 14, color: tk.color.ink, lineHeight: 22 }}>{val as string}</Text>
                        )}
                      </Card>
                    );
                  })}
                </View>
              </View>
            )}

            {!thesis && (
              <EmptyState
                icon="📊"
                title="Venture Thesis pending"
                body="Generate the Venture Thesis from the web app to see the full breakdown here."
              />
            )}

            {/* Blueprint CTA */}
            <Pressable
              onPress={() => { impact(); router.push(`/blueprint/${id}`); }}
              style={({ pressed }) => ({
                backgroundColor: tk.color.brand,
                borderRadius: tk.radius.lg,
                padding: 16,
                alignItems: 'center',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>View Build Blueprint →</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}
