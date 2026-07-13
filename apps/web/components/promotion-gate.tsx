'use client';

/**
 * Promotion gate — turns a Build-Ready pack into a real implementation project,
 * but ONLY with explicit founder commitment. Two gates: the system gate
 * (build-ready + quality) is enforced server-side; the founder gate (ambition +
 * risk review + the 6-month commitment) is captured here. Build-Ready is the
 * gate — venture/unicorn potential are shown but never required.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { Button, Card, Badge, palette } from './ui';
import { useT } from '../lib/i18n';
import { firstWorkspaceId, decisionApi, type AmbitionMode, type ReadinessView } from '../lib/api';
import { canPromote } from '../lib/promotion';

const AMBITIONS: AmbitionMode[] = ['cash_flow_business', 'venture_scale', 'unicorn_ambition'];

export function PromotionGate({ packId }: { packId: string }) {
  const t = useT();
  const [ws, setWs] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessView | null>(null);
  const [ambition, setAmbition] = useState<AmbitionMode>('cash_flow_business');
  const [committed, setCommitted] = useState(false);
  const [reviewedRisks, setReviewedRisks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const workspace = await firstWorkspaceId();
    if (!workspace) return;
    setWs(workspace);
    try { setReadiness(await decisionApi.getReadiness(workspace, packId)); } catch { /* ignore */ }
  }, [packId]);

  useEffect(() => { void load(); }, [load]);

  async function promote() {
    if (!ws) return;
    setBusy(true); setError(null);
    try {
      const project = await decisionApi.promote(ws, packId, { ambitionMode: ambition, commitmentConfirmed: committed, reviewedRisks });
      setProjectId(project.id);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'error';
      setError(
        code === 'not_build_ready' ? t('promote.notBuildReady')
        : code === 'founder_verdict_required' ? t('promote.needRating')
        : code === 'commitment_required' ? t('promote.commit')
        : t('state.error.body'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!readiness) return null;

  return (
    <Card>
      <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{t('promote.title')}</div>

      {/* Readiness badges — distinct concepts, non-blocking except Build-Ready. */}
      <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.md }}>
        <Badge variant={readiness.buildReady ? 'ready' : 'muted'}>{t('readiness.buildReady')}{readiness.buildReady ? '' : ` · ${t('readiness.notYet')}`}</Badge>
        <Badge variant={readiness.ventureReady ? 'confidence' : 'muted'}>{t('readiness.ventureReady')}{readiness.ventureReady ? '' : ` · ${t('readiness.notYet')}`}</Badge>
        <Badge variant={readiness.unicornPotential ? 'success' : 'muted'}>{t('readiness.unicornPotential')}{readiness.unicornPotential ? '' : ` · ${t('readiness.notYet')}`}</Badge>
      </div>

      {projectId ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>{t('promote.success')}</span>
          <Link href={`/signalkit/projects/${projectId}`} style={{ textDecoration: 'none' }}><Button variant="secondary">{t('promote.viewProject')}</Button></Link>
        </div>
      ) : readiness.alreadyPromoted ? (
        <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{t('promote.alreadyPromoted')}</div>
      ) : (
        <>
          {/* Ambition mode */}
          <label style={{ display: 'block', fontSize: typography.size.sm, marginBottom: spacing.xs }}>{t('ambition.title')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginBottom: spacing.md }}>
            {AMBITIONS.map((a) => (
              <label key={a} style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-start', fontSize: typography.size.sm, cursor: 'pointer' }}>
                <input type="radio" name="ambition" checked={ambition === a} onChange={() => setAmbition(a)} />
                <span>
                  <strong>{t(`ambition.${a}` as never)}</strong>
                  <span style={{ display: 'block', color: palette.subtle, fontSize: typography.size.xs }}>{t(`ambition.${a}.desc` as never)}</span>
                </span>
              </label>
            ))}
          </div>

          {/* Top risks / unproven */}
          {readiness.topRisks.length > 0 && (
            <div style={{ marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}` }}>
              <div style={{ fontSize: typography.size.xs, fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>{t('promote.topRisks')}</div>
              <ul style={{ margin: 0, paddingInlineStart: spacing.lg, fontSize: typography.size.xs, color: palette.subtle }}>
                {readiness.topRisks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {/* Founder commitment */}
          <label style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-start', fontSize: typography.size.sm, marginBottom: spacing.xs, cursor: 'pointer' }}>
            <input type="checkbox" checked={reviewedRisks} onChange={(e) => setReviewedRisks(e.target.checked)} />
            <span>{t('promote.reviewedRisks')}</span>
          </label>
          <label style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-start', fontSize: typography.size.sm, marginBottom: spacing.md, cursor: 'pointer' }}>
            <input type="checkbox" checked={committed} onChange={(e) => setCommitted(e.target.checked)} />
            <span>{t('promote.commit')}</span>
          </label>

          {error && <div style={{ color: palette.subtle, fontSize: typography.size.sm, marginBottom: spacing.sm }}>{error}</div>}

          <Button
            onClick={() => void promote()}
            disabled={busy || !canPromote({ buildReady: readiness.buildReady, commitmentConfirmed: committed, reviewedRisks })}
          >
            {t('promote.cta')}
          </Button>
        </>
      )}
    </Card>
  );
}
