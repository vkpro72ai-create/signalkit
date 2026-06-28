/**
 * Pack detail — premium document reader with metadata panel.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { packApi, ApiException, api } from '../../lib/api';
import { impact } from '../../lib/haptics';
import {
  tk, Card, Badge, SectionHeader, SkeletonCard, EmptyState, ErrorState, Divider, Spacer, DocumentStatusPill,
} from '../../components/brand';

type Document = {
  id: string;
  type: string;
  status: string;
  language: string;
  version: number;
  title?: string;
  content?: string;
  wordCount?: number;
};

type Pack = {
  id: string;
  depth: string;
  language: string;
  status: string;
  documentCount: number;
  approvedCount: number;
  inReviewCount: number;
  changesRequestedCount: number;
  updatedAt: string;
  documents?: Document[];
};

export default function PackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  const [pack, setPack] = useState<Pack | null>(null);
  const [selected, setSelected] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wsId || !id) { setLoading(false); return; }
    try {
      const data = await packApi.get(wsId, id) as Pack;
      setPack(data);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load pack.');
    } finally {
      setLoading(false);
    }
  }, [wsId, id]);

  useEffect(() => { load(); }, [load]);

  function formatDocType(type: string) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

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

        {!loading && pack && (
          <>
            {/* Metadata Card */}
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: tk.color.subtle, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Product Pack
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: tk.color.ink, marginTop: 2 }}>
                    {pack.depth.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Text>
                </View>
                <DocumentStatusPill status={pack.status as any} />
              </View>

              <Divider style={{ marginVertical: 0 }} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                {[
                  { label: 'Total', value: pack.documentCount, color: tk.color.ink },
                  { label: 'Approved', value: pack.approvedCount, color: tk.color.opportunity },
                  { label: 'Review', value: pack.inReviewCount, color: tk.color.warning },
                  { label: 'Changes', value: pack.changesRequestedCount, color: tk.color.risk },
                ].map((stat) => (
                  <View key={stat.label} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: stat.color }}>{stat.value}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: tk.color.subtle, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{
                  flex: 1, backgroundColor: tk.color.brandFaint, borderRadius: tk.radius.sm, padding: 8,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: tk.color.subtle }}>Language</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.ink, marginTop: 1 }}>
                    {pack.language.toUpperCase()}
                  </Text>
                </View>
                <View style={{
                  flex: 1, backgroundColor: tk.color.brandFaint, borderRadius: tk.radius.sm, padding: 8,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: tk.color.subtle }}>Updated</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.ink, marginTop: 1 }}>
                    {new Date(pack.updatedAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Document List */}
            {(pack.documents?.length ?? 0) > 0 ? (
              <View>
                <SectionHeader title={`Documents (${pack.documents?.length ?? 0})`} />
                <View style={{ gap: 8 }}>
                  {pack.documents?.map((doc) => (
                    <Pressable
                      key={doc.id}
                      onPress={() => { impact(); setSelected(selected?.id === doc.id ? null : doc); }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
                    >
                      <Card style={{ gap: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.ink }}>
                              {doc.title ?? formatDocType(doc.type)}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 11, color: tk.color.subtle }}>v{doc.version}</Text>
                              <Text style={{ fontSize: 11, color: tk.color.muted }}>·</Text>
                              <Text style={{ fontSize: 11, color: tk.color.subtle }}>{doc.language.toUpperCase()}</Text>
                              {doc.wordCount ? (
                                <>
                                  <Text style={{ fontSize: 11, color: tk.color.muted }}>·</Text>
                                  <Text style={{ fontSize: 11, color: tk.color.subtle }}>{doc.wordCount.toLocaleString()} words</Text>
                                </>
                              ) : null}
                            </View>
                          </View>
                          <DocumentStatusPill status={doc.status as any} />
                        </View>

                        {selected?.id === doc.id && doc.content && (
                          <>
                            <Divider style={{ marginVertical: 4 }} />
                            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled showsVerticalScrollIndicator>
                              <Text style={{ fontSize: 14, color: tk.color.ink, lineHeight: 22 }}>{doc.content}</Text>
                            </ScrollView>
                          </>
                        )}

                        {selected?.id === doc.id && !doc.content && (
                          <Text style={{ fontSize: 13, color: tk.color.muted, fontStyle: 'italic' }}>
                            Content not available — open the web app for the full document reader.
                          </Text>
                        )}
                      </Card>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <EmptyState
                icon="📄"
                title="No documents yet"
                body="Generate the Pack from the web app to populate documents."
              />
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
