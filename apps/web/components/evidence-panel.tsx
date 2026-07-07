'use client';

/**
 * Evidence panel — the trust surface. Shows claims with their confidence and
 * grounding (evidence-backed vs assumption), "why do we believe this?",
 * "what is weak?", "what contradicts this?", plus assumption and unresolved-
 * question trackers. Premium flat 2D; no gradients, no chat.
 */
import { useCallback, useEffect, useState } from 'react';
import { spacing, typography, radius, border } from '@signalkit/ui';
import type { ConfidenceLevel } from '@signalkit/shared';
import { Card, Badge, Button, ConfidenceBadge, EmptyState, palette } from './ui';
import { apiGet, apiPost } from '../lib/api';

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

export function EvidencePanel({ ws, projectId }: { ws: string; projectId: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [assumption, setAssumption] = useState('');
  const [question, setQuestion] = useState('');

  const base = `/workspaces/${ws}/projects/${projectId}`;
  const refresh = useCallback(async () => {
    setGraph(await apiGet<Graph>(`${base}/evidence/graph`).catch(() => ({ claims: [], assumptions: [], questions: [] })));
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
          <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>Evidence & claims</h2>
          <Button variant="secondary" onClick={() => void synthesize()}>Build evidence from signals</Button>
        </div>

        {!graph || graph.claims.length === 0 ? (
          <EmptyState title="No claims yet" body="Add sources, then build evidence to generate grounded claims." />
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
                    {c.assessment.weak ? <Badge variant="risk">weak</Badge> : null}
                  </div>
                  <div style={{ fontSize: typography.size.sm, marginTop: spacing.xs }}>{c.text}</div>
                  <div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.xs }}>
                    <button onClick={() => setOpen(isOpen ? null : c.id)} style={linkBtn}>
                      {isOpen ? 'Hide' : 'Why do we believe this?'} ({c.supportingEvidence.length})
                    </button>
                    {c.contradictingEvidence.length > 0 && <span style={{ color: '#6A1B1B', fontSize: typography.size.xs }}>contradicted</span>}
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
      </Card>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
        <Card>
          <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Assumptions</h2>
          <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
            <input style={field} placeholder="Add an assumption…" value={assumption} onChange={(e) => setAssumption(e.target.value)} />
            <Button variant="secondary" onClick={() => void addAssumption()}>Add</Button>
          </div>
          {graph?.assumptions.length ? (
            graph.assumptions.map((a) => (
              <div key={a.id} style={{ fontSize: typography.size.sm, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                <Badge variant="warning">{a.validationStatus}</Badge> {a.text}
              </div>
            ))
          ) : (
            <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>None tracked.</span>
          )}
        </Card>

        <Card>
          <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Unresolved questions</h2>
          <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
            <input style={field} placeholder="Add a research question…" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <Button variant="secondary" onClick={() => void addQuestion()}>Add</Button>
          </div>
          {graph?.questions.length ? (
            graph.questions.map((q) => (
              <div key={q.id} style={{ fontSize: typography.size.sm, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                <Badge variant="confidence">{q.priority}</Badge> {q.text}
              </div>
            ))
          ) : (
            <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>None tracked.</span>
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
