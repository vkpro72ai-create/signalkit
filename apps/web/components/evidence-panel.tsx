'use client';

/**
 * Evidence panel — the trust surface, embedded contextually inside an
 * Opportunity / Pack / Project (never a standalone top-level page). Shows
 * claims with their confidence and grounding, "why do we believe this?",
 * contradictions, plus assumption and unresolved-question trackers.
 *
 * When `nicheId` is provided, the primary action is an honest automatic
 * evidence scan (claims_found | no_strong_claims | configuration_needed |
 * failed — never fabricated); manual source add is secondary. Without a
 * nicheId (e.g. the legacy project-only Sources page) it falls back to the
 * project-level "build evidence from signals" synthesis.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography, radius, border } from '@signalkit/ui';
import type { ConfidenceLevel } from '@signalkit/shared';
import { Card, Badge, Button, ConfidenceBadge, EmptyState, palette } from './ui';
import { apiGet, apiPost, decisionApi, type EvidenceScanView } from '../lib/api';
import { useT } from '../lib/i18n';

interface EvidenceRef { id: string; summary: string; sourceRefId: string }
interface ClaimView {
  id: string;
  text: string;
  type: string;
  confidenceLevel: string;
  supportingEvidence: EvidenceRef[];
  contradictingEvidence: EvidenceRef[];
  contradictions: { reason: string; suggestedQuestion: string | null; resolved: boolean }[];
  assessment: { grounding: string; weak: boolean };
}
interface Graph {
  claims: ClaimView[];
  assumptions: { id: string; text: string; validationStatus: string }[];
  questions: { id: string; text: string; priority: string; status: string }[];
}

const GROUNDING_VARIANT: Record<string, 'evidence' | 'warning' | 'failed'> = {
  evidence_backed: 'evidence',
  assumption_only: 'warning',
  ungrounded: 'failed',
};

export function EvidencePanel({ ws, projectId, nicheId }: { ws: string; projectId: string; nicheId?: string }) {
  const t = useT();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [assumption, setAssumption] = useState('');
  const [question, setQuestion] = useState('');
  const [scanState, setScanState] = useState<'idle' | 'scanning'>('idle');
  const [scanResult, setScanResult] = useState<EvidenceScanView | null>(null);

  const base = `/workspaces/${ws}/projects/${projectId}`;
  const refresh = useCallback(async () => {
    setGraph(await apiGet<Graph>(`${base}/evidence/graph`).catch(() => ({ claims: [], assumptions: [], questions: [] })));
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runScan() {
    if (!nicheId) return;
    setScanState('scanning');
    try {
      const result = await decisionApi.evidenceScan(ws, nicheId);
      setScanResult(result);
    } finally {
      setScanState('idle');
      await refresh();
    }
  }
  async function synthesize() {
    await apiPost(`${base}/evidence/synthesize`, {});
    await refresh();
  }
  async function addAssumption() {
    if (!assumption.trim()) return;
    await apiPost(`${base}/assumptions`, { text: assumption });
    setAssumption('');
    await refresh();
  }
  async function addQuestion() {
    if (!question.trim()) return;
    await apiPost(`${base}/questions`, { text: question });
    setQuestion('');
    await refresh();
  }

  const field = { padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}`, fontSize: typography.size.sm, flex: 1 } as const;

  return (
    <>
      <Card style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', marginBottom: spacing.md }}>
          <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>{t('evidence.title')}</h2>
          {nicheId ? (
            <Button variant="secondary" onClick={() => void runScan()} disabled={scanState === 'scanning'}>
              {scanState === 'scanning' ? t('evscan.scanning') : t('evscan.cta')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void synthesize()}>{t('evidence.buildFromSignals')}</Button>
          )}
        </div>

        {scanResult && (
          <div style={{ marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}`, fontSize: typography.size.xs, color: palette.subtle }}>
            {scanResult.status === 'claims_found' && `${scanResult.claims ?? 0} ${t('evscan.claimsFound')} · ${scanResult.verifiedClaims ?? 0} ${t('evscan.verifiedClaims')}`}
            {scanResult.status === 'no_strong_claims' && t('evscan.noStrong')}
            {scanResult.status === 'failed' && t('evscan.failed')}
            {scanResult.status === 'configuration_needed' && (
              <>
                {t('evscan.configNeeded')}
                <ul style={{ margin: `${spacing.xs}px 0 0`, paddingInlineStart: spacing.lg }}>
                  {scanResult.missingConfiguration.map((m) => <li key={m.type}>{m.hint}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        {!graph || graph.claims.length === 0 ? (
          <EmptyState title={t('evidence.empty.title')} body={t('evidence.empty.body')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {graph.claims.map((c) => {
              const isOpen = open === c.id;
              return (
                <div key={c.id} style={{ borderBottom: `${border.hairline}px solid ${palette.line}`, paddingBottom: spacing.md }}>
                  <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge variant="muted">{c.type.replace(/_/g, ' ')}</Badge>
                    <ConfidenceBadge level={c.confidenceLevel as ConfidenceLevel} />
                    <Badge variant={GROUNDING_VARIANT[c.assessment.grounding] ?? 'muted'}>{c.assessment.grounding.replace(/_/g, ' ')}</Badge>
                    {c.assessment.weak ? <Badge variant="risk">{t('evidence.weak')}</Badge> : null}
                  </div>
                  <div style={{ fontSize: typography.size.sm, marginTop: spacing.xs }}>{c.text}</div>
                  <div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.xs }}>
                    <button onClick={() => setOpen(isOpen ? null : c.id)} style={linkBtn}>
                      {isOpen ? t('evidence.hide') : t('evidence.whyBelieve')} ({c.supportingEvidence.length})
                    </button>
                    {c.contradictingEvidence.length > 0 && <span style={{ color: '#6A1B1B', fontSize: typography.size.xs }}>{t('evidence.contradicted')}</span>}
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: spacing.sm, paddingInlineStart: spacing.md, borderInlineStart: `${border.thick}px solid ${palette.line}` }}>
                      {c.supportingEvidence.map((e) => (
                        <div key={e.id} style={{ fontSize: typography.size.xs, color: palette.subtle, marginBottom: 4 }}>
                          ✓ {e.summary} <span style={{ opacity: 0.6 }}>· src {e.sourceRefId.slice(0, 6)}</span>
                        </div>
                      ))}
                      {c.contradictingEvidence.map((e) => (
                        <div key={e.id} style={{ fontSize: typography.size.xs, color: '#6A1B1B', marginBottom: 4 }}>✗ {e.summary}</div>
                      ))}
                      {c.contradictions.map((x, i) => (
                        <div key={i} style={{ fontSize: typography.size.xs, color: '#6B4E07', marginTop: 4 }}>
                          ⚠ {x.reason}{x.suggestedQuestion ? ` — ${x.suggestedQuestion}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {nicheId && (
          <div style={{ marginTop: spacing.md }}>
            <Link href="/signalkit/sources" style={{ fontSize: typography.size.xs, color: palette.subtle }}>{t('evscan.ownSource')}</Link>
          </div>
        )}
      </Card>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
        <Card>
          <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>{t('evidence.assumptions.title')}</h2>
          <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
            <input style={field} placeholder={t('evidence.assumptions.placeholder')} value={assumption} onChange={(e) => setAssumption(e.target.value)} />
            <Button variant="secondary" onClick={() => void addAssumption()}>{t('evidence.assumptions.add')}</Button>
          </div>
          {graph?.assumptions.length ? (
            graph.assumptions.map((a) => (
              <div key={a.id} style={{ fontSize: typography.size.sm, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                <Badge variant="warning">{a.validationStatus}</Badge> {a.text}
              </div>
            ))
          ) : (
            <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>{t('evidence.assumptions.none')}</span>
          )}
        </Card>

        <Card>
          <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>{t('evidence.questions.title')}</h2>
          <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
            <input style={field} placeholder={t('evidence.questions.placeholder')} value={question} onChange={(e) => setQuestion(e.target.value)} />
            <Button variant="secondary" onClick={() => void addQuestion()}>{t('evidence.questions.add')}</Button>
          </div>
          {graph?.questions.length ? (
            graph.questions.map((q) => (
              <div key={q.id} style={{ fontSize: typography.size.sm, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                <Badge variant="confidence">{q.priority}</Badge> {q.text}
              </div>
            ))
          ) : (
            <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>{t('evidence.questions.none')}</span>
          )}
        </Card>
      </div>
    </>
  );
}

const linkBtn = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: '#1B3A66',
  fontSize: 12,
  cursor: 'pointer',
  textDecoration: 'underline',
} as const;
