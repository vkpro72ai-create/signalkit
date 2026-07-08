/**
 * Create Pack — Step 3. Human-readable generation progress (no technical logs).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { packApi, ApiException } from '../../lib/api';
import { tk, Button, ErrorState } from '../../components/brand';

const STEPS = [
  'Усиливаем идею',
  'Собираем стратегию продукта',
  'Проектируем пользовательский опыт',
  'Готовим технический план',
  'Собираем backlog и промпты для разработки',
  'Проверяем качество',
  'Готовим PDF и ZIP',
];

export default function CreateProgress() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const wsId = user?.workspaces?.[0]?.id;

  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<'generating' | 'ready' | 'failed'>('generating');
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cosmeticRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!wsId || !packId) return;
    try {
      const pack = await packApi.get(wsId, packId);
      if (pack.status === 'generating' || pack.status === 'empty') {
        pollingRef.current = setTimeout(poll, 3000);
        return;
      }
      if (pack.status === 'failed') {
        setStatus('failed');
        setError('Generation failed. Try again from the opportunity or idea screen.');
        return;
      }
      setStepIndex(STEPS.length - 1);
      setStatus('ready');
      setTimeout(() => router.replace(`/pack/${packId}`), 600);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not check generation status.');
      pollingRef.current = setTimeout(poll, 5000);
    }
  }, [wsId, packId, router]);

  useEffect(() => {
    poll();
    cosmeticRef.current = setInterval(() => {
      setStepIndex((i) => (i < STEPS.length - 2 ? i + 1 : i));
    }, 4000);
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (cosmeticRef.current) clearInterval(cosmeticRef.current);
    };
  }, [poll]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ padding: tk.space.base, paddingTop: 96, paddingBottom: 64, gap: tk.space.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: tk.color.ink, letterSpacing: -0.3, textAlign: 'center' }}>
          Формируем пакет
        </Text>
        <Text style={{ fontSize: 14, color: tk.color.subtle, textAlign: 'center' }}>
          Это может занять несколько минут. Можно оставить в фоне — генерация продолжится.
        </Text>
      </View>

      {status === 'failed' && error ? (
        <ErrorState message={error} onRetry={poll} />
      ) : (
        <View style={{ gap: 14 }}>
          {STEPS.map((step, i) => {
            const done = i < stepIndex || status === 'ready';
            const active = i === stepIndex && status === 'generating';
            return (
              <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done ? tk.color.brand : active ? tk.color.brandFaint : tk.color.mutedBg,
                  borderWidth: active ? 1.5 : 0, borderColor: tk.color.brand,
                }}>
                  {done ? (
                    <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>✓</Text>
                  ) : active ? (
                    <ActivityIndicator size="small" color={tk.color.brand} />
                  ) : (
                    <Text style={{ color: tk.color.muted, fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 15, fontWeight: active ? '700' : '500', color: done || active ? tk.color.ink : tk.color.muted, flex: 1 }}>
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Button label="Оставить в фоне" variant="secondary" onPress={() => router.replace('/(tabs)/packs')} />
    </ScrollView>
  );
}
