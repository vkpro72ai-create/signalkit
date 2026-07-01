'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { spacing, typography, radius, border } from '@signalkit/ui';
import type { DocumentStatus } from '@signalkit/shared';
import {
  Card,
  PageHeader,
  Button,
  Badge,
  DocumentStatusPill,
  EmptyState,
  LoadingState,
  ErrorState,
  palette,
} from '../../../../components/ui';
import { Markdown } from '../../../../components/markdown';
import { useT } from '../../../../lib/i18n';
import { apiGet, apiPost, apiPut, firstWorkspaceId } from '../../../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocMeta {
  packDepth: string;
  verticalTemplate: string;
  market: { country: string | null };
  claimIds: string[];
  assumptionIds: string[];
  sourceRefIds: string[];
  unresolvedQuestionIds: string[];
  confidence: { level: string } | null;
}

interface DocView {
  id: string;
  docType: string;
  title: string;
  body: string;
  language: string;
  status: string;
  version: number;
  qualityGateStatus: string;
  metadata: DocMeta;
  updatedAt: string;
}

interface GateCheck { id: string; label: string; status: string; message: string }

interface Pack {
  id: string;
  title: string;
  depth: string;
  status: string;
  documents: DocView[];
  qualityGate: { status: string; passedCount: number; warnCount: number; failCount: number; checks: GateCheck[] } | null;
}

interface DocVersion {
  id: string;
  version: number;
  body: string;
  changeSummary: string;
  authorId: string | null;
  generatedBy: string;
  createdAt: string;
}

interface ResearchUpdate {
  id: string;
  title: string;
  type: string;
  content: string;
  language: string;
  createdAt: string;
  linkedDocumentIds: string[];
}

interface DocumentComment {
  id: string;
  authorId: string;
  body: string;
  status: string;
  createdAt: string;
}

interface Assumption {
  id: string;
  text: string;
  validationStatus: string;
  impactIfWrong: string;
  rationale: string;
}

interface BlueprintView {
  buildReadinessScore: number;
  buildReadinessLevel: string;
  buildReadinessBreakdown: { dimension: string; score: number; reasoning: string }[];
  warnings: string[];
  screenContracts: { name: string; primaryAction: string; states: { kind: string }[]; backendDependencies: string[]; acceptanceCriteria: string[] }[];
  apiToScreenMap: { screen: string; endpoints: { method: string; path: string }[]; actions: { method: string; path: string }[] }[];
  permissionMatrix: { role: string; allowedActions: string[]; blockedActions: string[] }[];
  doNotBuild: { item: string; reason: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  draft: palette.subtle,
  in_review: '#B45309',
  changes_requested: '#9B1C1C',
  approved: '#166534',
  locked: '#1E3A5F',
  archived: palette.subtle,
  failed: '#9B1C1C',
};

const VALIDATION_COLOR: Record<string, string> = {
  untested: palette.subtle,
  supported: '#166534',
  contradicted: '#9B1C1C',
  invalidated: '#7C2D12',
  needs_more_data: '#B45309',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductPackReader({ params }: { params: Promise<{ id: string }> }) {
  const { id: packId } = use(params);
  const t = useT();
  const router = useRouter();

  // Core state
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'not_found'>('loading');
  const [ws, setWs] = useState<string | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editor state
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const originalBodyRef = useRef('');

  // Right panel tabs
  const [rightTab, setRightTab] = useState<'info' | 'research' | 'comments'>('info');

  // Version history
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  // Research updates
  const [researchUpdates, setResearchUpdates] = useState<ResearchUpdate[]>([]);
  const [showAddResearch, setShowAddResearch] = useState(false);
  const [newResearchTitle, setNewResearchTitle] = useState('');
  const [newResearchType, setNewResearchType] = useState('customer_interview');
  const [newResearchContent, setNewResearchContent] = useState('');

  // Comments
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  // Assumptions
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);

  // Build Blueprint (Session 14)
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [blueprint, setBlueprint] = useState<BlueprintView | null>(null);

  async function loadBlueprint() {
    if (!ws || !pack) return;
    setShowBlueprint(true);
    try {
      setBlueprint(await apiGet<BlueprintView>(`/workspaces/${ws}/packs/${pack.id}/build-blueprint`));
    } catch { /* non-fatal */ }
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function load() {
    setState('loading');
    try {
      const workspaceId = await firstWorkspaceId();
      setWs(workspaceId);
      if (!workspaceId) return setState('not_found');
      await openPack(workspaceId, packId);
      setState('ready');
    } catch {
      setState('not_found');
    }
  }

  async function openPack(workspaceId: string, pid: string) {
    const p = await apiGet<Pack>(`/workspaces/${workspaceId}/packs/${pid}`);
    setPack(p);
    const firstDoc = p.documents[0];
    if (firstDoc) {
      setSelected(firstDoc.id);
      setEditBody(firstDoc.body);
      originalBodyRef.current = firstDoc.body;
      await loadSidePanelData(workspaceId, pid, firstDoc.id);
    }
  }

  async function loadSidePanelData(workspaceId: string, packId: string, docId: string) {
    try {
      const [ru, ass] = await Promise.all([
        apiGet<ResearchUpdate[]>(`/workspaces/${workspaceId}/packs/${packId}/research-updates`),
        apiGet<Assumption[]>(`/workspaces/${workspaceId}/packs/${packId}/assumptions`),
      ]);
      setResearchUpdates(ru);
      setAssumptions(ass);
    } catch { /* non-fatal */ }
    try {
      const coms = await apiGet<DocumentComment[]>(`/workspaces/${workspaceId}/packs/${packId}/documents/${docId}/comments`);
      setComments(coms);
    } catch { /* non-fatal */ }
  }

  async function selectDoc(docId: string) {
    if (!ws || !pack) return;
    setSelected(docId);
    setEditMode(false);
    setShowHistory(false);
    const d = pack.documents.find((x) => x.id === docId);
    if (d) {
      setEditBody(d.body);
      originalBodyRef.current = d.body;
    }
    await loadSidePanelData(ws, pack.id, docId);
  }

  useEffect(() => { void load(); }, []);

  // ── Editor actions ─────────────────────────────────────────────────────────

  const doc = pack?.documents.find((d) => d.id === selected) ?? null;
  const isDirty = editBody !== originalBodyRef.current;

  function enterEdit() {
    if (!doc) return;
    setEditBody(doc.body);
    originalBodyRef.current = doc.body;
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    if (doc) setEditBody(doc.body);
  }

  async function saveDocument() {
    if (!ws || !pack || !doc) return;
    setBusy(true);
    try {
      await apiPut(`/workspaces/${ws}/packs/${pack.id}/documents/${doc.id}`, {
        body: editBody,
        changeSummary: 'Manual edit',
      });
      setLastSaved(new Date());
      originalBodyRef.current = editBody;
      // Refresh pack to get updated body + version
      const updated = await apiGet<Pack>(`/workspaces/${ws}/packs/${pack.id}`);
      setPack(updated);
      setEditMode(false);
    } catch { /* stay in edit mode */ } finally {
      setBusy(false);
    }
  }

  // ── Version history ────────────────────────────────────────────────────────

  async function loadHistory() {
    if (!ws || !pack || !doc) return;
    setHistoryBusy(true);
    try {
      const vs = await apiGet<DocVersion[]>(`/workspaces/${ws}/packs/${pack.id}/documents/${doc.id}/versions`);
      setVersions(vs);
      setShowHistory(true);
    } finally {
      setHistoryBusy(false);
    }
  }

  async function restoreVersion(versionId: string) {
    if (!ws || !pack || !doc) return;
    setBusy(true);
    try {
      await apiPost(`/workspaces/${ws}/packs/${pack.id}/documents/${doc.id}/restore-version`, { versionId });
      const updated = await apiGet<Pack>(`/workspaces/${ws}/packs/${pack.id}`);
      setPack(updated);
      setShowHistory(false);
      setEditMode(false);
    } finally {
      setBusy(false);
    }
  }

  // ── Review actions ─────────────────────────────────────────────────────────

  async function reviewAction(action: string) {
    if (!ws || !pack || !doc) return;
    setBusy(true);
    try {
      await apiPost(`/workspaces/${ws}/packs/${pack.id}/documents/${doc.id}/${action}`);
      const updated = await apiGet<Pack>(`/workspaces/${ws}/packs/${pack.id}`);
      setPack(updated);
    } catch { /* permission error or invalid transition */ } finally {
      setBusy(false);
    }
  }

  // ── Regeneration ───────────────────────────────────────────────────────────

  async function regenerateDoc() {
    if (!ws || !pack || !doc) return;
    setBusy(true);
    try {
      await apiPost(`/workspaces/${ws}/packs/${pack.id}/documents/${doc.id}/regenerate`);
      const updated = await apiGet<Pack>(`/workspaces/${ws}/packs/${pack.id}`);
      setPack(updated);
      setEditMode(false);
    } finally {
      setBusy(false);
    }
  }

  // ── Research updates ───────────────────────────────────────────────────────

  async function addResearchUpdate() {
    if (!ws || !pack || !newResearchTitle.trim()) return;
    setCommentBusy(true);
    try {
      await apiPost(`/workspaces/${ws}/packs/${pack.id}/research-updates`, {
        title: newResearchTitle,
        type: newResearchType,
        content: newResearchContent,
        linkedDocumentIds: doc ? [doc.id] : [],
      });
      const updated = await apiGet<ResearchUpdate[]>(`/workspaces/${ws}/packs/${pack.id}/research-updates`);
      setResearchUpdates(updated);
      setNewResearchTitle('');
      setNewResearchContent('');
      setShowAddResearch(false);
    } finally {
      setCommentBusy(false);
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async function addComment() {
    if (!ws || !pack || !doc || !newComment.trim()) return;
    setCommentBusy(true);
    try {
      await apiPost(`/workspaces/${ws}/packs/${pack.id}/documents/${doc.id}/comments`, { body: newComment });
      const updated = await apiGet<DocumentComment[]>(`/workspaces/${ws}/packs/${pack.id}/documents/${doc.id}/comments`);
      setComments(updated);
      setNewComment('');
    } finally {
      setCommentBusy(false);
    }
  }

  async function resolveComment(id: string) {
    if (!ws) return;
    try {
      await apiPost(`/workspaces/${ws}/comments/${id}/resolve`);
      setComments((prev) => prev.map((c) => c.id === id ? { ...c, status: 'resolved' } : c));
    } catch { /* non-fatal */ }
  }

  // ── Assumption validation ──────────────────────────────────────────────────

  async function updateAssumption(assumptionId: string, status: string) {
    if (!ws) return;
    try {
      await apiPut(`/workspaces/${ws}/assumptions/${assumptionId}/validation`, { status });
      setAssumptions((prev) => prev.map((a) => a.id === assumptionId ? { ...a, validationStatus: status } : a));
    } catch { /* non-fatal */ }
  }

  // ── Quality gate badge ────────────────────────────────────────────────────

  const gateVariant = pack?.qualityGate?.status === 'failed' ? 'failed' : pack?.qualityGate?.status === 'warnings' ? 'warning' : 'ready';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1400 }}>
      <PageHeader
        title={pack ? pack.title : t('nav.packs')}
        subtitle={pack ? `${pack.depth.replace(/_/g, ' ')} · ${pack.documents.length} documents` : 'Evidence-backed Product Document Pack.'}
        action={
          pack ? (
            <Button variant="secondary" onClick={() => router.push(`/signalkit/exports?packId=${pack.id}`)}>
              Export pack
            </Button>
          ) : undefined
        }
      />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'not_found' && (
        <EmptyState
          title="Pack not found"
          body="Open an opportunity and generate its Product Pack."
          action={<Button variant="secondary" onClick={() => router.push('/signalkit/opportunities')}>Go to Opportunities</Button>}
        />
      )}

      {state === 'ready' && pack && (
        <>
          {/* Quality gate row */}
          <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md, alignItems: 'center' }}>
            {pack.qualityGate && (
              <>
                <Badge variant={gateVariant}>Quality gate: {pack.qualityGate.status}</Badge>
                <Badge variant="success">{pack.qualityGate.passedCount} pass</Badge>
                {pack.qualityGate.warnCount > 0 && <Badge variant="warning">{pack.qualityGate.warnCount} warn</Badge>}
                {pack.qualityGate.failCount > 0 && <Badge variant="failed">{pack.qualityGate.failCount} fail</Badge>}
              </>
            )}
            <div style={{ flex: 1 }} />
            <Button variant={showBlueprint ? 'secondary' : 'ghost'} onClick={() => (showBlueprint ? setShowBlueprint(false) : void loadBlueprint())}>
              {showBlueprint ? 'Back to documents' : 'Build Blueprint'}
            </Button>
          </div>

          {showBlueprint && (
            <BlueprintPanel blueprint={blueprint} />
          )}

          {!showBlueprint && (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: spacing.lg, alignItems: 'start' }}>

            {/* LEFT — Document navigation */}
            <Card style={{ padding: `${spacing.sm}px 0`, maxHeight: '80vh', overflow: 'auto' }}>
              {pack.documents.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => void selectDoc(d.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    width: '100%',
                    textAlign: 'start',
                    background: d.id === selected ? palette.canvas : 'transparent',
                    border: 'none',
                    borderLeft: d.id === selected ? `2px solid ${palette.ink}` : '2px solid transparent',
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    fontSize: typography.size.xs,
                    color: palette.ink,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: palette.subtle, minWidth: 16, fontSize: 10 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[d.status] ?? palette.subtle, flexShrink: 0 }} />
                </button>
              ))}
            </Card>

            {/* CENTER — Editor / reader */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {/* Toolbar */}
              {doc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.xs}px 0` }}>
                  {!editMode ? (
                    <Button variant="secondary" onClick={enterEdit}>Edit</Button>
                  ) : (
                    <>
                      <Button onClick={() => void saveDocument()} disabled={!isDirty || busy}>Save</Button>
                      <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={() => void loadHistory()} disabled={historyBusy}>History</Button>
                  <Button variant="ghost" onClick={() => void regenerateDoc()} disabled={busy}>Regenerate</Button>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>
                    {isDirty && editMode ? 'Unsaved changes' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : `v${doc.version}`}
                  </span>
                  <DocumentStatusPill status={doc.status as DocumentStatus} label={doc.status.replace(/_/g, ' ')} />
                </div>
              )}

              {/* Version history panel */}
              {showHistory && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                    <span style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm }}>Version history</span>
                    <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.subtle, fontSize: typography.size.sm }}>✕</button>
                  </div>
                  {versions.length === 0 ? (
                    <span style={{ color: palette.subtle, fontSize: typography.size.xs }}>No versions yet.</span>
                  ) : versions.map((v) => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: typography.size.xs, fontWeight: typography.weight.medium }}>v{v.version} — {v.changeSummary || 'No summary'}</div>
                        <div style={{ fontSize: 10, color: palette.subtle }}>{new Date(v.createdAt).toLocaleString()} · {v.generatedBy}</div>
                      </div>
                      <Button variant="secondary" onClick={() => void restoreVersion(v.id)}>Restore</Button>
                    </div>
                  ))}
                </Card>
              )}

              {/* Editor or Reader */}
              <Card style={{ minHeight: 400 }}>
                {!doc && <EmptyState title="Select a document" />}
                {doc && !editMode && <div style={{ padding: spacing.lg }}><Markdown source={doc.body} /></div>}
                {doc && editMode && (
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: 480,
                      padding: spacing.lg,
                      fontFamily: 'monospace',
                      fontSize: typography.size.sm,
                      lineHeight: 1.6,
                      border: 'none',
                      resize: 'vertical',
                      outline: 'none',
                      color: palette.ink,
                      background: 'transparent',
                      boxSizing: 'border-box',
                    }}
                    spellCheck={false}
                  />
                )}
              </Card>
            </div>

            {/* RIGHT — Tabbed panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                {(['info', 'research', 'comments'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      background: 'none',
                      border: 'none',
                      borderBottom: rightTab === tab ? `2px solid ${palette.ink}` : '2px solid transparent',
                      fontSize: typography.size.xs,
                      color: rightTab === tab ? palette.ink : palette.subtle,
                      cursor: 'pointer',
                      fontWeight: rightTab === tab ? typography.weight.medium : undefined,
                    }}
                  >
                    {tab === 'comments' ? `Comments (${comments.filter(c => c.status === 'open').length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Info tab */}
              {rightTab === 'info' && doc && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, fontSize: typography.size.xs }}>
                    <Row k="Status" v={<DocumentStatusPill status={doc.status as DocumentStatus} label={doc.status.replace(/_/g, ' ')} />} />
                    <Row k="Quality gate" v={doc.qualityGateStatus} />
                    <Row k="Language" v={doc.language} />
                    <Row k="Market" v={doc.metadata.market.country ?? 'global'} />
                    <Row k="Depth" v={doc.metadata.packDepth.replace(/_/g, ' ')} />
                    <Row k="Vertical" v={doc.metadata.verticalTemplate.replace(/_/g, ' ')} />
                    <Row k="Confidence" v={doc.metadata.confidence?.level ?? '—'} />
                    <Row k="Claims" v={String(doc.metadata.claimIds.length)} />
                    <Row k="Assumptions" v={String(doc.metadata.assumptionIds.length)} />
                    <Row k="Sources" v={String(doc.metadata.sourceRefIds.length)} />
                    <Row k="Open questions" v={String(doc.metadata.unresolvedQuestionIds.length)} />
                    <Row k="Version" v={String(doc.version)} />
                    <div style={{ height: border.hairline, background: palette.line, margin: `${spacing.xs}px 0` }} />
                    <span style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, color: palette.subtle }}>Review</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                      {doc.status === 'draft' || doc.status === 'changes_requested' ? (
                        <Button variant="secondary" onClick={() => void reviewAction('request-review')} disabled={busy}>Request review</Button>
                      ) : null}
                      {doc.status === 'in_review' ? (
                        <>
                          <Button variant="secondary" onClick={() => void reviewAction('approve')} disabled={busy}>Approve</Button>
                          <Button variant="ghost" onClick={() => void reviewAction('request-changes')} disabled={busy}>Request changes</Button>
                        </>
                      ) : null}
                      {doc.status === 'approved' ? (
                        <Button variant="secondary" onClick={() => void reviewAction('lock')} disabled={busy}>Lock</Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )}

              {/* Assumptions tracker (shown inside Info tab) */}
              {rightTab === 'info' && assumptions.length > 0 && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, marginBottom: spacing.xs }}>Assumptions</div>
                  {assumptions.slice(0, 8).map((a) => (
                    <div key={a.id} style={{ marginBottom: spacing.sm, paddingBottom: spacing.xs, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                      <div style={{ fontSize: 10, color: VALIDATION_COLOR[a.validationStatus] ?? palette.subtle, marginBottom: 2 }}>
                        {a.validationStatus.replace(/_/g, ' ')} · {a.impactIfWrong} impact
                      </div>
                      <div style={{ fontSize: typography.size.xs, marginBottom: spacing.xs }}>{a.text}</div>
                      <select
                        value={a.validationStatus}
                        onChange={(e) => void updateAssumption(a.id, e.target.value)}
                        style={{ ...sel, width: '100%', fontSize: 10 }}
                      >
                        {['untested', 'supported', 'contradicted', 'invalidated', 'needs_more_data'].map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </Card>
              )}

              {/* Research updates tab */}
              {rightTab === 'research' && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                    <span style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs }}>Research updates</span>
                    <Button variant="ghost" onClick={() => setShowAddResearch(!showAddResearch)}>+ Add</Button>
                  </div>

                  {showAddResearch && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.sm, background: palette.canvas, borderRadius: radius.sm }}>
                      <input
                        placeholder="Title"
                        value={newResearchTitle}
                        onChange={(e) => setNewResearchTitle(e.target.value)}
                        style={{ ...inputStyle }}
                      />
                      <select value={newResearchType} onChange={(e) => setNewResearchType(e.target.value)} style={{ ...sel }}>
                        {['customer_interview', 'competitor_note', 'landing_result', 'survey_result', 'pricing_feedback', 'legal_note', 'local_market_note', 'investor_feedback', 'internal_team_note', 'ai_agent_implementation_feedback'].map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                      <textarea
                        placeholder="Content"
                        value={newResearchContent}
                        onChange={(e) => setNewResearchContent(e.target.value)}
                        rows={3}
                        style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <Button onClick={() => void addResearchUpdate()} disabled={commentBusy || !newResearchTitle.trim()}>Add</Button>
                        <Button variant="ghost" onClick={() => setShowAddResearch(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {researchUpdates.length === 0 && !showAddResearch && (
                    <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>No research updates yet.</span>
                  )}
                  {researchUpdates.map((ru) => (
                    <div key={ru.id} style={{ marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                      <div style={{ fontSize: typography.size.xs, fontWeight: typography.weight.medium }}>{ru.title}</div>
                      <div style={{ fontSize: 10, color: palette.subtle }}>{ru.type.replace(/_/g, ' ')} · {new Date(ru.createdAt).toLocaleDateString()}</div>
                      {ru.content && <div style={{ fontSize: typography.size.xs, marginTop: spacing.xs, color: palette.subtle }}>{ru.content.slice(0, 120)}{ru.content.length > 120 ? '…' : ''}</div>}
                    </div>
                  ))}
                </Card>
              )}

              {/* Comments tab */}
              {rightTab === 'comments' && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, marginBottom: spacing.sm }}>Comments</div>
                  {comments.map((c) => (
                    <div key={c.id} style={{ marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottom: `${border.hairline}px solid ${palette.line}`, opacity: c.status === 'resolved' ? 0.5 : 1 }}>
                      <div style={{ fontSize: typography.size.xs }}>{c.body}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: palette.subtle }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                        {c.status === 'open' && (
                          <button onClick={() => void resolveComment(c.id)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: palette.subtle }}>Resolve</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {comments.filter(c => c.status === 'open').length === 0 && (
                    <span style={{ fontSize: typography.size.xs, color: palette.subtle, display: 'block', marginBottom: spacing.sm }}>No open comments.</span>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    <textarea
                      placeholder="Add a comment…"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={2}
                      style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <Button onClick={() => void addComment()} disabled={commentBusy || !newComment.trim()}>Add comment</Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Build Blueprint panel ───────────────────────────────────────────────────

function BlueprintPanel({ blueprint }: { blueprint: BlueprintView | null }) {
  if (!blueprint) return <LoadingState label="Loading build blueprint…" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <Card style={{ padding: spacing.lg }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.sm }}>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>Build Readiness (separate score)</div>
          <div style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold }}>{blueprint.buildReadinessScore}/100</div>
          <Badge variant={blueprint.buildReadinessScore >= 70 ? 'success' : 'warning'}>{blueprint.buildReadinessLevel}</Badge>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
          {blueprint.buildReadinessBreakdown.map((d) => (
            <div key={d.dimension} style={{ fontSize: typography.size.xs, border: `${border.hairline}px solid ${palette.line}`, borderRadius: radius.sm, padding: `${spacing.xs}px ${spacing.sm}px` }}>
              <span style={{ color: palette.subtle }}>{d.dimension.replace(/_/g, ' ')}: </span>{d.score}
            </div>
          ))}
        </div>
        {blueprint.warnings.length > 0 && (
          <div style={{ marginTop: spacing.sm, display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
            {blueprint.warnings.map((w, i) => <Badge key={i} variant="warning">{w}</Badge>)}
          </div>
        )}
      </Card>

      <Card style={{ padding: spacing.lg }}>
        <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm, marginBottom: spacing.sm }}>Screen contracts ({blueprint.screenContracts.length})</div>
        {blueprint.screenContracts.map((s) => {
          const kinds = s.states.map((st) => st.kind);
          const hasStates = ['empty', 'loading', 'failed'].every((r) => kinds.includes(r));
          return (
            <div key={s.name} style={{ padding: `${spacing.sm}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                <span style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium }}>{s.name}</span>
                <Badge variant={hasStates ? 'success' : 'failed'}>{hasStates ? 'states ✓' : 'missing states'}</Badge>
                <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>→ {s.primaryAction}</span>
              </div>
              <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: 2 }}>
                Backend: {s.backendDependencies.join(', ') || 'frontend-only'}
              </div>
            </div>
          );
        })}
      </Card>

      <Card style={{ padding: spacing.lg }}>
        <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm, marginBottom: spacing.sm }}>API → Screen map</div>
        {blueprint.apiToScreenMap.map((m, i) => (
          <div key={i} style={{ fontSize: typography.size.xs, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
            <strong>{m.screen}</strong>: reads {m.endpoints.map((e) => `${e.method} ${e.path}`).join(', ') || '—'}; writes {m.actions.map((a) => `${a.method} ${a.path}`).join(', ') || '—'}
          </div>
        ))}
      </Card>

      <Card style={{ padding: spacing.lg }}>
        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', marginBottom: spacing.sm }}>
          <Badge variant="risk">DO NOT BUILD</Badge>
          <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>AI agents & developers must not implement these.</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: spacing.md, fontSize: typography.size.xs }}>
          {blueprint.doNotBuild.map((d, i) => <li key={i} style={{ marginBottom: spacing.xs }}><strong>{d.item}</strong> — {d.reason}</li>)}
        </ul>
      </Card>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm }}>
      <span style={{ color: palette.subtle }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

const sel = {
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: radius.md,
  border: `${border.hairline}px solid ${palette.line}`,
  fontSize: typography.size.sm,
  color: palette.ink,
  background: palette.surface,
} as const;

const inputStyle = {
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: radius.md,
  border: `${border.hairline}px solid ${palette.line}`,
  fontSize: typography.size.xs,
  color: palette.ink,
  background: palette.surface,
  width: '100%',
  boxSizing: 'border-box' as const,
};
