'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { LLM_PROVIDER_TYPES, type LLMProviderType } from '@signalkit/shared';
import {
  Card,
  PageHeader,
  Badge,
  ModelCostBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  Button,
  palette,
} from '../../../../components/ui';
import { useT } from '../../../../lib/i18n';
import {
  apiGet,
  estimatePackCostUsd,
  firstWorkspaceId,
  PACK_DEPTHS,
  llmApi,
  PROVIDER_LABELS,
  type CatalogModelView,
  type ProviderView,
  type LlmConnectionView,
  type LlmSettingsView,
} from '../../../../lib/api';

type LoadState = 'loading' | 'error' | 'ready' | 'no_workspace';

const inputStyle = {
  padding: `${spacing.sm}px ${spacing.md}px`,
  borderRadius: radius.md,
  border: `${border.hairline}px solid ${palette.line}`,
  fontSize: typography.size.sm,
  width: '100%',
  boxSizing: 'border-box' as const,
};

const selectStyle = { ...inputStyle };

// ── Connections & routing ────────────────────────────────────────────────────

function ConnectionsSection({ workspaceId }: { workspaceId: string }) {
  const [connections, setConnections] = useState<LlmConnectionView[]>([]);
  const [settings, setSettings] = useState<LlmSettingsView | null>(null);
  const [models, setModels] = useState<CatalogModelView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [provider, setProvider] = useState<LLMProviderType>('deepseek');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [smokeResult, setSmokeResult] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsBaseUrl = provider === 'openai_compatible' || provider === 'custom';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conns, s, modelRows] = await Promise.all([
        llmApi.connections(workspaceId),
        llmApi.settings(workspaceId),
        llmApi.models(),
      ]);
      setConnections(conns);
      setSettings(s);
      setModels(modelRows);
      setSelectedModelId((current) => current || s.defaultModelId || modelRows.find((m) => m.provider === 'deepseek')?.modelId || modelRows[0]?.modelId || '');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function setMode(mode: 'byok' | 'platform') {
    setSettings(await llmApi.updateSettings({ workspaceId, mode, defaultModelId: selectedModelId || undefined }));
  }

  async function connect() {
    setError(null);
    if (apiKey.trim().length < 8) return setError('API key looks too short.');
    if (needsBaseUrl && !baseUrl.trim()) return setError('Base URL is required for this provider.');
    setBusy(true);
    try {
      await llmApi.connect({
        workspaceId,
        provider,
        apiKey: apiKey.trim(),
        label: label.trim() || PROVIDER_LABELS[provider],
        baseUrl: needsBaseUrl ? baseUrl.trim() : undefined,
        defaultModelId: selectedModelId || undefined,
      });
      setApiKey('');
      setLabel('');
      setBaseUrl('');
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect provider.');
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: 'Testing…' }));
    try {
      const res = await llmApi.testStored(id, workspaceId);
      setTestResults((prev) => ({ ...prev, [id]: res.ok ? 'Connected ✓' : (res.message ?? 'Failed') }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: 'Failed' }));
    }
  }

  async function remove(id: string) {
    await llmApi.remove(id, workspaceId);
    await load();
  }

  async function saveSettings() {
    if (!selectedModelId) {
      setSaveResult('Select a model before saving.');
      return;
    }
    setBusy(true);
    setSaveResult(null);
    try {
      const next = await llmApi.updateSettings({
        workspaceId,
        mode: settings?.mode ?? 'byok',
        defaultModelId: selectedModelId,
      });
      setSettings(next);
      setSaveResult(`Saved default model: ${selectedModelId}`);
    } catch (e) {
      setSaveResult(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  async function runSmoke() {
    const selectedModel = models.find((model) => model.modelId === selectedModelId);
    if (!selectedModel) {
      setSmokeResult('Select a model before running the smoke test.');
      return;
    }
    const activeConnection = connections.find((connection) => connection.provider === selectedModel.provider && connection.status === 'active');
    if (!activeConnection) {
      setSmokeResult(`No active ${PROVIDER_LABELS[selectedModel.provider] ?? selectedModel.provider} connection found. Connect the provider first.`);
      return;
    }
    setBusy(true);
    setSmokeResult('Running DeepSeek smoke…');
    try {
      const result = await llmApi.smoke({
        workspaceId,
        provider: selectedModel.provider,
        modelId: selectedModel.modelId,
        prompt: 'Return exactly: SIGNALKIT_LLM_SMOKE_OK',
      });
      setSmokeResult(
        result.ok
          ? `${result.provider}/${result.modelId} → ${result.text} · ${result.task} · ${result.latencyMs ?? 0} ms`
          : `${result.code}: ${result.message}`,
      );
    } catch (e) {
      setSmokeResult(e instanceof Error ? e.message : 'Smoke test failed.');
    } finally {
      setBusy(false);
    }
  }

  const selectedModel = models.find((model) => model.modelId === selectedModelId) ?? null;
  const selectedProviderConnections = selectedModel ? connections.filter((connection) => connection.provider === selectedModel.provider) : [];

  return (
    <>
      {/* Platform vs BYOK */}
      <div style={{ marginBottom: spacing.xl }}>
        <h2 style={{ fontSize: typography.size.lg, marginBottom: spacing.sm }}>Platform AI</h2>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
            <div>
              <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium }}>
                {settings?.mode === 'platform' ? 'Using SignalKit-hosted models' : 'Using your own API keys (BYOK)'}
              </div>
              <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 4, maxWidth: 520 }}>
                All requests route through the backend LLM router — the browser never calls a provider directly, and keys are encrypted at rest.
              </p>
              <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 4 }}>
                Workspace: <span style={{ fontFamily: 'monospace' }}>{workspaceId}</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: spacing.xs }}>
              <Button variant={settings?.mode === 'platform' ? 'primary' : 'secondary'} onClick={() => void setMode('platform')}>Platform</Button>
              <Button variant={settings?.mode === 'byok' ? 'primary' : 'secondary'} onClick={() => void setMode('byok')}>Bring my own key</Button>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ marginBottom: spacing.xl }}>
        <h2 style={{ fontSize: typography.size.lg, marginBottom: spacing.sm }}>Routing & smoke test</h2>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: spacing.sm, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: typography.size.xs, color: palette.subtle }}>Default model</label>
              <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)} style={selectStyle}>
                <option value="">Select model…</option>
                {models.map((model) => (
                  <option key={`${model.provider}:${model.modelId}`} value={model.modelId}>
                    {model.displayName} · {PROVIDER_LABELS[model.provider] ?? model.provider}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => void saveSettings()} disabled={busy || !selectedModelId}>Save</Button>
            <Button variant="secondary" onClick={() => void runSmoke()} disabled={busy || !selectedModelId}>Run smoke test</Button>
          </div>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', marginTop: spacing.md }}>
            <Badge variant="muted">Selected provider: {selectedModel ? PROVIDER_LABELS[selectedModel.provider] ?? selectedModel.provider : '—'}</Badge>
            <Badge variant={selectedProviderConnections.some((connection) => connection.status === 'active') ? 'success' : 'risk'}>
              Connection: {selectedProviderConnections.some((connection) => connection.status === 'active') ? 'active' : 'missing'}
            </Badge>
            {settings?.defaultModelId && <Badge variant="confidence">Current saved model: {settings.defaultModelId}</Badge>}
          </div>
          {saveResult && <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: spacing.sm, marginBottom: 0 }}>{saveResult}</p>}
          {smokeResult && <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: spacing.sm, marginBottom: 0 }}>{smokeResult}</p>}
        </Card>
      </div>

      {/* Connections */}
      <div style={{ marginBottom: spacing.xl }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
          <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>Connected providers</h2>
          <Button variant="secondary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Add provider'}</Button>
        </div>

        {showAdd && (
          <Card style={{ marginBottom: spacing.md }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxWidth: 480 }}>
              <label style={{ fontSize: typography.size.xs, color: palette.subtle }}>Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value as LLMProviderType)} style={selectStyle}>
                {LLM_PROVIDER_TYPES.map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>
                ))}
              </select>

              <label style={{ fontSize: typography.size.xs, color: palette.subtle }}>Label</label>
              <input style={inputStyle} placeholder={PROVIDER_LABELS[provider]} value={label} onChange={(e) => setLabel(e.target.value)} />

              <label style={{ fontSize: typography.size.xs, color: palette.subtle }}>API key</label>
              <input style={inputStyle} type="password" placeholder="sk-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />

              {needsBaseUrl && (
                <>
                  <label style={{ fontSize: typography.size.xs, color: palette.subtle }}>Base URL</label>
                  <input style={inputStyle} placeholder="https://api.your-endpoint.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                </>
              )}

              {error && <div style={{ color: '#9B1C1C', fontSize: typography.size.xs }}>{error}</div>}

              {provider === 'deepseek' && (
                <p style={{ color: palette.subtle, fontSize: typography.size.xs, margin: 0 }}>
                  DeepSeek uses the backend OpenAI-compatible adapter with base URL https://api.deepseek.com/v1.
                </p>
              )}

              <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.xs }}>
                <Button onClick={() => void connect()} disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</Button>
              </div>
              <p style={{ color: palette.subtle, fontSize: 11, margin: 0 }}>
                The key is encrypted at rest and never displayed again — only a masked version is shown below.
              </p>
            </div>
          </Card>
        )}

        {loading ? (
          <LoadingState label="Loading…" />
        ) : connections.length === 0 ? (
          <EmptyState title="No providers connected" body="Add a provider to enable BYOK routing, or stay on Platform AI above." />
        ) : (
          <Card style={{ padding: 0 }}>
            {connections.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: spacing.lg,
                  borderBottom: i < connections.length - 1 ? `${border.hairline}px solid ${palette.line}` : 'none',
                }}
              >
                <div>
                  <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm }}>
                    {c.label} <span style={{ color: palette.subtle, fontWeight: typography.weight.regular }}>· {PROVIDER_LABELS[c.provider] ?? c.provider}</span>
                  </div>
                  <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: 2, fontFamily: 'monospace' }}>{c.maskedKey}</div>
                </div>
                <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                  {testResults[c.id] && <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>{testResults[c.id]}</span>}
                  <Badge variant={c.status === 'active' ? 'success' : 'muted'}>{c.status}</Badge>
                  <Button variant="ghost" onClick={() => void test(c.id)}>Test connection</Button>
                  <Button variant="ghost" onClick={() => void remove(c.id)}>Remove</Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

// ── Model catalog (reference) ────────────────────────────────────────────────

function ModelCatalog() {
  const t = useT();
  const [state, setState] = useState<LoadState>('loading');
  const [models, setModels] = useState<CatalogModelView[]>([]);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [depth, setDepth] = useState<(typeof PACK_DEPTHS)[number]>('build_ready');

  async function load() {
    setState('loading');
    try {
      const [m, p] = await Promise.all([
        apiGet<CatalogModelView[]>('/llm/models'),
        apiGet<ProviderView[]>('/llm/providers'),
      ]);
      setModels(m);
      setProviders(p);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>Model catalog</h2>
        <select value={depth} onChange={(e) => setDepth(e.target.value as typeof depth)} style={{ ...selectStyle, width: 'auto' }}>
          {PACK_DEPTHS.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}

      {state === 'ready' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg }}>
            {providers.map((p) => (
              <Badge key={p.type} variant="muted">{p.displayName}{p.requiresBaseUrl ? ' · base URL' : ''}</Badge>
            ))}
          </div>

          {models.length === 0 ? (
            <EmptyState title={t('state.empty.title')} body={t('state.empty.body')} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
              {models.map((m) => <ModelCard key={m.id} model={m} depth={depth} t={t} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelCard({
  model,
  depth,
  t,
}: {
  model: CatalogModelView;
  depth: (typeof PACK_DEPTHS)[number];
  t: (k: 'label.score' | 'label.estCost' | 'label.market') => string;
}) {
  const estCost = estimatePackCostUsd(model, depth);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: typography.weight.semibold }}>{model.displayName}</div>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{model.provider}</div>
        </div>
        <ModelCostBadge usd={estCost} label={t('label.estCost')} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
        <Badge variant="confidence">{t('label.score')}: {model.ratingOverall ?? '—'}</Badge>
        <Badge variant="muted">ctx {Math.round(model.contextWindow / 1000)}k</Badge>
        <Badge variant="muted">${model.inputTokenPrice}/${model.outputTokenPrice} per 1M</Badge>
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AiEnginePage() {
  const t = useT();
  const [ws, setWs] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    firstWorkspaceId()
      .then((id) => {
        setWs(id);
        setState(id ? 'ready' : 'no_workspace');
      })
      .catch(() => setState('error'));
  }, []);

  return (
    <div style={{ maxWidth: 780 }}>
      <PageHeader
        title={t('nav.aiEngine')}
        subtitle="Bring your own API key or use SignalKit-hosted models. Every request routes through the backend — never directly from the browser."
        action={
          <Link href="/signalkit/settings/usage" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">AI Usage</Button>
          </Link>
        }
      />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} />}
      {state === 'no_workspace' && <EmptyState title="No workspace yet" body="Create your product lab from the home dashboard first." />}
      {state === 'ready' && ws && <ConnectionsSection workspaceId={ws} />}

      <ModelCatalog />
    </div>
  );
}
