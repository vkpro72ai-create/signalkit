'use client';

/**
 * Failed-pack diagnostic wall. Shows the last successful step, the failed step,
 * doc counts, model/provider, attempts and the precise reason — and offers an
 * in-place "Retry failed step" (resume) when the job is retryable. Completed
 * work is never thrown away or blindly restarted.
 */
import { useCallback, useEffect, useState } from 'react';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { Button, Card, Badge, palette } from './ui';
import { useT } from '../lib/i18n';
import { firstWorkspaceId, decisionApi, type PackDiagnosticsView } from '../lib/api';

export function PackDiagnostics({ packId, onRetry }: { packId: string; onRetry?: () => void }) {
  const t = useT();
  const [ws, setWs] = useState<string | null>(null);
  const [diag, setDiag] = useState<PackDiagnosticsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const workspace = await firstWorkspaceId();
    if (!workspace) return;
    setWs(workspace);
    try { setDiag(await decisionApi.diagnostics(workspace, packId)); } catch { /* no job yet */ }
  }, [packId]);

  useEffect(() => { void load(); }, [load]);

  // Only a wall for terminal-failed / partially-ready jobs.
  if (!diag || (diag.status !== 'failed' && diag.status !== 'partially_ready')) return null;

  async function retry() {
    if (!ws) return;
    setBusy(true); setError(null);
    try {
      await decisionApi.retryPack(ws, packId);
      onRetry?.();
      await load();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'error';
      setError(code === 'resume_unavailable' || code === 'not_retryable' ? t('diag.notRetryable') : t('state.error.body'));
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.md, fontSize: typography.size.sm, padding: `${spacing.xs}px 0` }}>
      <span style={{ color: palette.subtle }}>{label}</span>
      <span style={{ textAlign: 'end' }}>{value}</span>
    </div>
  );
  const failedStepRow = diag.steps.find((s) => s.status === 'failed');

  return (
    <Card style={{ borderInlineStart: `3px solid ${palette.line}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <div style={{ fontWeight: typography.weight.semibold }}>{t('diag.title')}</div>
        <Badge variant={diag.status === 'failed' ? 'failed' : 'warning'}>{diag.status}</Badge>
      </div>

      {diag.contextChanged && (
        <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}` }}>
          ⚠️ {t('diag.contextChanged')}
        </div>
      )}

      {row(t('diag.lastSuccessful'), diag.lastSuccessfulStep ?? '—')}
      {row(t('diag.failedStep'), diag.failedStep ?? '—')}
      {row(t('diag.docsReady'), `${diag.readyDocumentCount} / ${diag.totalExpectedDocumentCount}`)}
      {row(t('diag.model'), failedStepRow?.model ? `${failedStepRow.model} · ${failedStepRow.provider ?? ''}` : '—')}
      {row(t('diag.attempts'), String(failedStepRow?.attemptCount ?? 0))}
      {(diag.errorReason || failedStepRow?.errorReason) && row(t('diag.reason'), diag.errorReason ?? failedStepRow?.errorReason ?? '')}

      {error && <div style={{ color: palette.subtle, fontSize: typography.size.sm, margin: `${spacing.sm}px 0` }}>{error}</div>}

      <div style={{ marginTop: spacing.md }}>
        <Button onClick={() => void retry()} disabled={busy || !diag.retryable}>
          {busy ? t('diag.retrying') : t('diag.retry')}
        </Button>
        {!diag.retryable && <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: spacing.xs }}>{t('diag.notRetryable')}</div>}
      </div>
    </Card>
  );
}
