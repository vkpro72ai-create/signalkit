'use client';

/**
 * Task 3 — async Product Pack generation progress banner. Polls
 * GET /workspaces/:ws/packs/:packId/generation-status every 2s while a job
 * is queued/running, and stops automatically once it reaches a terminal
 * state (completed/partially_ready/failed/cancelled). Renders nothing for
 * packs with no generation job (deterministic packs generated without
 * useLlm, or packs created before this feature existed) — a 404 here is
 * expected and silent, not an error.
 */
import { useCallback, useEffect, useState } from 'react';
import { spacing, radius, border, typography, colorFor } from '@signalkit/ui';
import { Badge } from './ui';
import { apiGet } from '../lib/api';
import { useT } from '../lib/i18n';
import type { MessageKey } from '@signalkit/i18n';

interface GenerationStepView {
  stepKey: string;
  status: 'pending' | 'running' | 'completed' | 'repairing' | 'failed' | 'skipped';
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  attemptCount: number;
  repairCount: number;
  errorCode: string | null;
  errorReason: string | null;
}

interface GenerationStatusView {
  jobId: string;
  packId: string;
  status: 'queued' | 'running' | 'partially_ready' | 'completed' | 'failed' | 'cancelled';
  generationMode: 'standard' | 'strong_model';
  overallProgress: number;
  currentStep: string | null;
  steps: GenerationStepView[];
  readyDocumentCount: number;
  totalExpectedDocumentCount: number;
  buildReady: boolean;
  errorCode: string | null;
  errorReason: string | null;
}

const IN_PROGRESS = new Set(['queued', 'running']);
const TERMINAL = new Set(['completed', 'partially_ready', 'failed', 'cancelled']);

const STEP_KEYS = new Set([
  'vision', 'bcg_star_evaluation', 'build_product', 'build_design',
  'build_engineering', 'execution', 'qira_backlog', 'ai_agent_bundle', 'evidence',
]);

function stepLabel(t: (key: MessageKey) => string, stepKey: string): string {
  return STEP_KEYS.has(stepKey) ? t(`gen.step.${stepKey}` as MessageKey) : stepKey;
}

function statusColor(status: GenerationStatusView['status']) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'failed';
  if (status === 'partially_ready') return 'warning';
  return 'muted';
}

export function PackGenerationStatusBanner({ workspaceId, packId }: { workspaceId: string; packId: string }) {
  const t = useT();
  const [job, setJob] = useState<GenerationStatusView | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const status = await apiGet<GenerationStatusView>(`/workspaces/${workspaceId}/packs/${packId}/generation-status`);
      setJob(status);
    } catch {
      // No job for this pack (deterministic pack, or pre-Task-3 pack) — stay silent.
      setHidden(true);
    }
  }, [workspaceId, packId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!job || !IN_PROGRESS.has(job.status)) return;
    const timer = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(timer);
  }, [job, load]);

  if (hidden || !job || (job.status === 'completed' && job.buildReady)) return null;

  const c = colorFor(statusColor(job.status), 'light');
  const currentStepLabel = job.currentStep ? stepLabel(t, job.currentStep) : null;

  return (
    <div
      style={{
        background: c.bg,
        border: `${border.hairline}px solid ${c.border}`,
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Badge variant={statusColor(job.status)}>{statusLabel(t, job)}</Badge>
          {currentStepLabel && IN_PROGRESS.has(job.status) ? (
            <span style={{ fontSize: typography.size.sm, color: c.fg }}>{t('gen.generating').replace('{step}', currentStepLabel)}</span>
          ) : null}
        </div>
        <span style={{ fontSize: typography.size.xs, color: c.fg }}>
          {t('gen.docsReady').replace('{ready}', String(job.readyDocumentCount)).replace('{total}', String(job.totalExpectedDocumentCount))}
        </span>
      </div>

      {IN_PROGRESS.has(job.status) ? (
        <div style={{ marginTop: spacing.sm, background: 'rgba(0,0,0,0.06)', borderRadius: radius.full, height: 6, overflow: 'hidden' }}>
          <div style={{ width: `${job.overallProgress}%`, height: '100%', background: c.fg, transition: 'width 0.5s ease' }} />
        </div>
      ) : null}

      {job.status === 'failed' ? (
        <p style={{ marginTop: spacing.sm, fontSize: typography.size.sm, color: c.fg }}>
          {t('gen.failedAt').replace('{step}', currentStepLabel ?? '—')}{job.errorCode ? ` — ${job.errorCode}` : ''}
          {job.errorReason ? `: ${job.errorReason}` : ''}
        </p>
      ) : null}

      {job.status === 'partially_ready' ? (
        <p style={{ marginTop: spacing.sm, fontSize: typography.size.sm, color: c.fg }}>{t('gen.partiallyReady')}</p>
      ) : null}

      {job.status === 'completed' && !job.buildReady ? (
        <p style={{ marginTop: spacing.sm, fontSize: typography.size.sm, color: c.fg }}>{t('gen.completedNotBuildReady')}</p>
      ) : null}

      {TERMINAL.has(job.status) ? (
        <div style={{ marginTop: spacing.sm, display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
          {job.steps.map((step) => (
            <span
              key={step.stepKey}
              title={step.errorReason ?? undefined}
              style={{
                fontSize: typography.size.xs,
                padding: '2px 8px',
                borderRadius: radius.full,
                background: colorFor(step.status === 'completed' ? 'success' : step.status === 'failed' ? 'failed' : 'muted', 'light').bg,
                color: colorFor(step.status === 'completed' ? 'success' : step.status === 'failed' ? 'failed' : 'muted', 'light').fg,
              }}
            >
              {stepLabel(t, step.stepKey)}
              {step.repairCount > 0 ? t('gen.repaired') : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(t: (key: MessageKey) => string, job: GenerationStatusView): string {
  switch (job.status) {
    case 'queued': return t('gen.status.queued');
    case 'running': return t('gen.status.running');
    case 'partially_ready': return t('gen.status.partially_ready');
    case 'completed': return job.buildReady ? t('gen.status.buildReady') : t('gen.status.completed');
    case 'failed': return t('gen.status.failed');
    case 'cancelled': return t('gen.status.cancelled');
    default: return job.status;
  }
}
