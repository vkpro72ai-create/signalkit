'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { spacing, typography, radius, border, colorFor } from '@signalkit/ui';
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
import {
  apiGet,
  apiPost,
  apiPut,
  firstWorkspaceId,
  commentApi,
  packApi,
  type DocumentCommentView,
  type ApplyCommentsResult,
} from '../../../../lib/api';
import type { Translator } from '@signalkit/i18n';

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
  layer?: 'vision' | 'build' | 'execution' | 'evidence';
  section?: { key: string; title: string } | null;
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

interface PackMetadata {
  packTitle?: string;
  sourceMode?: string;
  qualityGates?: {
    structureGate: string;
    evidenceGate: string;
    safetyGate: string;
    buildabilityGate: string;
    exportGate: string;
    openQuestions?: string[];
    sourceNeeds?: string[];
    whatNotToBuildOrClaim?: string[];
  };
  layers?: Array<{ key: 'vision' | 'build' | 'execution' | 'evidence'; title: string; documentTypes: string[]; titles: string[] }>;
  executionHandoff?: {
    mode: string;
    qiraBacklogDraft: {
      projectTitle: string;
      projectDescription: string;
      epics: Array<{ title: string; relatedSections: string[] }>;
      sprints: Array<{ title: string; focus: string }>;
      tasks: Array<{ title: string; ownerRole: string; phase: string; acceptanceCriteria: string[]; relatedSections: string[] }>;
      dependencies: Array<{ from: string; to: string }>;
      ownerRoles: string[];
      labels: string[];
      acceptanceCriteria: string[];
      doneDefinition: string[];
    };
    aiAgentPromptBundleDraft: Array<{
      title: string;
      targetAgent: string;
      purpose: string;
      promptBody: string;
      relatedSections: string[];
      expectedFiles: string[];
      tests: string[];
      finalReportFormat: string[];
    }>;
  };
}

interface Pack {
  id: string;
  title: string;
  depth: string;
  status: string;
  metadata?: PackMetadata | null;
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
  const [rightTab, setRightTab] = useState<'info' | 'handoff' | 'research'>('info');

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

  // Comments — rendered inline in the reading pane (see Markdown), not a separate tab.
  const [comments, setComments] = useState<DocumentCommentView[]>([]);
  const [commentBusy, setCommentBusy] = useState(false);
  const [openCommentsSummary, setOpenCommentsSummary] = useState<{ documentsAffected: number }>({ documentsAffected: 0 });

  // Apply-comments (pack-level, resilient to per-document failure)
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyCommentsResult | null>(null);

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
    void loadOpenCommentsSummary(workspaceId, pid);
    const firstDoc = p.documents[0];
    if (firstDoc) {
      setSelected(firstDoc.id);
      setEditBody(firstDoc.body);
      originalBodyRef.current = firstDoc.body;
      await loadSidePanelData(workspaceId, pid, firstDoc.id);
    }
  }

  async function loadOpenCommentsSummary(workspaceId: string, pid: string) {
    try {
      setOpenCommentsSummary(await commentApi.openSummary(workspaceId, pid));
    } catch { /* non-fatal */ }
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
      setComments(await commentApi.list(workspaceId, packId, docId));
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
  const displayTitle = pack ? normalizePackTitle(pack.metadata?.packTitle || pack.title) : t('nav.packs');
  const groupedDocs = pack ? groupDocsForNavigation(pack.documents, t) : [];
  const qualityGates = pack?.metadata?.qualityGates ?? null;
  const handoff = pack?.metadata?.executionHandoff ?? null;

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

  /** Pack-level: reprocess only the documents that have open comments. Resilient — a
   * failed document keeps its previous version, and the batch continues past it. */
  async function applyComments() {
    if (!ws || !pack) return;
    setApplyBusy(true);
    setApplyResult(null);
    try {
      const result = await packApi.applyComments(ws, pack.id);
      setApplyResult(result);
      const updated = await apiGet<Pack>(`/workspaces/${ws}/packs/${pack.id}`);
      setPack(updated);
      if (doc) {
        const fresh = updated.documents.find((d) => d.id === doc.id);
        if (fresh) {
          setEditBody(fresh.body);
          originalBodyRef.current = fresh.body;
        }
        await loadSidePanelData(ws, pack.id, doc.id);
      }
      void loadOpenCommentsSummary(ws, pack.id);
    } finally {
      setApplyBusy(false);
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

  async function addComment(sectionHeading: string, body: string) {
    if (!ws || !pack || !doc) return;
    setCommentBusy(true);
    try {
      await commentApi.create(ws, pack.id, doc.id, body, sectionHeading);
      setComments(await commentApi.list(ws, pack.id, doc.id));
      void loadOpenCommentsSummary(ws, pack.id);
    } finally {
      setCommentBusy(false);
    }
  }

  async function resolveComment(id: string) {
    if (!ws || !pack) return;
    try {
      await commentApi.resolve(ws, id);
      setComments((prev) => prev.map((c) => c.id === id ? { ...c, status: 'resolved' } : c));
      void loadOpenCommentsSummary(ws, pack.id);
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
    <div style={{ maxWidth: 1500 }}>
      <PageHeader
        title={displayTitle}
        subtitle={
          pack
            ? t('pack.subtitle').replace('{depth}', pack.depth.replace(/_/g, ' ')).replace('{count}', String(pack.documents.length))
            : t('pack.subtitleFallback')
        }
        action={
          pack ? (
            <Button variant="secondary" onClick={() => router.push(`/signalkit/exports?packId=${pack.id}`)}>
              {t('pack.export')}
            </Button>
          ) : undefined
        }
      />

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'not_found' && (
        <EmptyState
          title={t('pack.notFound.title')}
          body={t('pack.notFound.body')}
          action={<Button variant="secondary" onClick={() => router.push('/signalkit/opportunities')}>{t('pack.notFound.cta')}</Button>}
        />
      )}

      {state === 'ready' && pack && (
        <>
          {/* Quality gate row */}
          <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
            {pack.qualityGate && (
              <>
                <Badge variant={gateVariant}>{t('pack.gate.label')}: {pack.qualityGate.status}</Badge>
                <Badge variant="success">{pack.qualityGate.passedCount} {t('pack.gate.pass')}</Badge>
                {pack.qualityGate.warnCount > 0 && <Badge variant="warning">{pack.qualityGate.warnCount} {t('pack.gate.warn')}</Badge>}
                {pack.qualityGate.failCount > 0 && <Badge variant="failed">{pack.qualityGate.failCount} {t('pack.gate.fail')}</Badge>}
                {qualityGates && (
                  <>
                    <Badge variant={qualityGates.structureGate === 'complete' ? 'success' : 'failed'}>{t('pack.gate.structure')}: {qualityGates.structureGate}</Badge>
                    <Badge variant={qualityGates.evidenceGate === 'supported' ? 'success' : 'warning'}>{t('pack.gate.evidence')}: {qualityGates.evidenceGate}</Badge>
                    <Badge variant={qualityGates.safetyGate === 'clear' ? 'success' : 'warning'}>{t('pack.gate.safety')}: {qualityGates.safetyGate}</Badge>
                  </>
                )}
              </>
            )}
            <div style={{ flex: 1 }} />
            <Button
              variant="secondary"
              onClick={() => void applyComments()}
              disabled={applyBusy || openCommentsSummary.documentsAffected === 0}
            >
              {applyBusy ? t('pack.applyComments.busy') : t('pack.applyComments.button').replace('{count}', String(openCommentsSummary.documentsAffected))}
            </Button>
            <Button variant={showBlueprint ? 'secondary' : 'ghost'} onClick={() => (showBlueprint ? setShowBlueprint(false) : void loadBlueprint())}>
              {showBlueprint ? t('pack.blueprint.back') : t('pack.blueprint.open')}
            </Button>
          </div>

          {applyResult && (
            <Card style={{ padding: spacing.sm, marginBottom: spacing.md, background: colorFor('evidence').bg, border: `${border.hairline}px solid ${colorFor('evidence').border}` }}>
              <span style={{ fontSize: typography.size.sm, color: colorFor('evidence').fg }}>
                {t('pack.applyComments.resultSummary').replace('{updated}', String(applyResult.documentsUpdated)).replace('{failed}', String(applyResult.documentsFailed))}
              </span>
            </Card>
          )}

          {showBlueprint && (
            <BlueprintPanel blueprint={blueprint} t={t} />
          )}

          {!showBlueprint && (
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 240px', gap: spacing.lg, alignItems: 'start' }}>

            {/* LEFT — Document navigation */}
            <Card style={{ padding: `${spacing.sm}px 0`, maxHeight: '80vh', overflow: 'auto' }}>
              {groupedDocs.map((group) => (
                <div key={group.key}>
                  <div style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: 10, color: palette.subtle, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {group.title}
                  </div>
                  {group.documents.map((d, i) => (
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
                      <span style={{ color: palette.subtle, minWidth: 16, fontSize: 10 }}>{String(group.startIndex + i + 1).padStart(2, '0')}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[d.status] ?? palette.subtle, flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              ))}
            </Card>

            {/* CENTER — Editor / reader */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {/* Toolbar */}
              {doc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.xs}px 0` }}>
                  {!editMode ? (
                    <Button variant="secondary" onClick={enterEdit}>{t('pack.toolbar.edit')}</Button>
                  ) : (
                    <>
                      <Button onClick={() => void saveDocument()} disabled={!isDirty || busy}>{t('action.save')}</Button>
                      <Button variant="ghost" onClick={cancelEdit}>{t('action.cancel')}</Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={() => void loadHistory()} disabled={historyBusy}>{t('pack.toolbar.history')}</Button>
                  <Button variant="ghost" onClick={() => void regenerateDoc()} disabled={busy}>{t('pack.toolbar.regenerate')}</Button>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>
                    {isDirty && editMode ? t('pack.toolbar.unsaved') : lastSaved ? t('pack.toolbar.saved').replace('{time}', lastSaved.toLocaleTimeString()) : `v${doc.version}`}
                  </span>
                  <DocumentStatusPill status={doc.status as DocumentStatus} label={doc.status.replace(/_/g, ' ')} />
                </div>
              )}

              {/* Version history panel */}
              {showHistory && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                    <span style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm }}>{t('pack.history.title')}</span>
                    <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.subtle, fontSize: typography.size.sm }}>✕</button>
                  </div>
                  {versions.length === 0 ? (
                    <span style={{ color: palette.subtle, fontSize: typography.size.xs }}>{t('pack.history.empty')}</span>
                  ) : versions.map((v) => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: typography.size.xs, fontWeight: typography.weight.medium }}>v{v.version} — {v.changeSummary || '—'}</div>
                        <div style={{ fontSize: 10, color: palette.subtle }}>{new Date(v.createdAt).toLocaleString()} · {v.generatedBy}</div>
                      </div>
                      <Button variant="secondary" onClick={() => void restoreVersion(v.id)}>{t('pack.history.restore')}</Button>
                    </div>
                  ))}
                </Card>
              )}

              {/* Editor or Reader */}
              <Card style={{ minHeight: 400 }}>
                {!doc && <EmptyState title={t('pack.reader.selectDocument')} />}
                {doc && !editMode && (
                  <div style={{ padding: spacing.lg }}>
                    <Markdown
                      source={doc.body}
                      comments={comments}
                      onAddComment={addComment}
                      onResolveComment={resolveComment}
                      t={t}
                    />
                  </div>
                )}
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
                {([
                  'info',
                  ...(handoff ? (['handoff'] as const) : []),
                  'research',
                ] as const).map((tab) => (
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
                    {tab === 'handoff' ? t('pack.tabs.handoff') : tab === 'research' ? t('pack.tabs.research') : t('pack.tabs.info')}
                  </button>
                ))}
              </div>

              {/* Info tab */}
              {rightTab === 'info' && doc && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, fontSize: typography.size.xs }}>
                    <Row k={t('pack.info.status')} v={<DocumentStatusPill status={doc.status as DocumentStatus} label={doc.status.replace(/_/g, ' ')} />} />
                    <Row k={t('pack.info.qualityGate')} v={doc.qualityGateStatus} />
                    <Row k={t('pack.info.language')} v={doc.language} />
                    <Row k={t('pack.info.market')} v={doc.metadata.market.country ?? t('market.global')} />
                    <Row k={t('pack.info.depth')} v={doc.metadata.packDepth.replace(/_/g, ' ')} />
                    <Row k={t('pack.info.vertical')} v={doc.metadata.verticalTemplate.replace(/_/g, ' ')} />
                    <Row k={t('pack.info.confidence')} v={doc.metadata.confidence?.level ?? '—'} />
                    <Row k={t('pack.info.claims')} v={String(doc.metadata.claimIds.length)} />
                    <Row k={t('pack.info.assumptions')} v={String(doc.metadata.assumptionIds.length)} />
                    <Row k={t('pack.info.sources')} v={String(doc.metadata.sourceRefIds.length)} />
                    <Row k={t('pack.info.openQuestions')} v={String(doc.metadata.unresolvedQuestionIds.length)} />
                    {qualityGates && (
                      <>
                        <Row k={t('pack.info.structureGate')} v={qualityGates.structureGate} />
                        <Row k={t('pack.info.evidenceGate')} v={qualityGates.evidenceGate} />
                        <Row k={t('pack.info.safetyGate')} v={qualityGates.safetyGate} />
                        <Row k={t('pack.info.buildabilityGate')} v={qualityGates.buildabilityGate} />
                        <Row k={t('pack.info.exportGate')} v={qualityGates.exportGate} />
                      </>
                    )}
                    <Row k={t('pack.info.version')} v={String(doc.version)} />
                    <div style={{ height: border.hairline, background: palette.line, margin: `${spacing.xs}px 0` }} />
                    <span style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, color: palette.subtle }}>{t('pack.info.review')}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                      {doc.status === 'draft' || doc.status === 'changes_requested' ? (
                        <Button variant="secondary" onClick={() => void reviewAction('request-review')} disabled={busy}>{t('pack.review.requestReview')}</Button>
                      ) : null}
                      {doc.status === 'in_review' ? (
                        <>
                          <Button variant="secondary" onClick={() => void reviewAction('approve')} disabled={busy}>{t('pack.review.approve')}</Button>
                          <Button variant="ghost" onClick={() => void reviewAction('request-changes')} disabled={busy}>{t('pack.review.requestChanges')}</Button>
                        </>
                      ) : null}
                      {doc.status === 'approved' ? (
                        <Button variant="secondary" onClick={() => void reviewAction('lock')} disabled={busy}>{t('pack.review.lock')}</Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )}

              {/* Assumptions tracker (shown inside Info tab) */}
              {rightTab === 'info' && assumptions.length > 0 && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, marginBottom: spacing.xs }}>{t('pack.assumptions.title')}</div>
                  {assumptions.slice(0, 8).map((a) => (
                    <div key={a.id} style={{ marginBottom: spacing.sm, paddingBottom: spacing.xs, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
                      <div style={{ fontSize: 10, color: VALIDATION_COLOR[a.validationStatus] ?? palette.subtle, marginBottom: 2 }}>
                        {a.validationStatus.replace(/_/g, ' ')} · {a.impactIfWrong} {t('pack.assumptions.impact')}
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

              {rightTab === 'handoff' && handoff && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, fontSize: typography.size.xs }}>
                    <p style={{ color: palette.subtle, margin: 0 }}>{t('pack.handoff.description')}</p>
                    <Row k={t('pack.handoff.mode')} v={handoff.mode} />
                    <Row k={t('pack.handoff.qiraDraft')} v={`${handoff.qiraBacklogDraft.epics.length} · ${handoff.qiraBacklogDraft.sprints.length} sprints · ${handoff.qiraBacklogDraft.tasks.length}`} />
                    <Row k={t('pack.handoff.aiPrompts')} v={String(handoff.aiAgentPromptBundleDraft.length)} />
                    <div style={{ height: border.hairline, background: palette.line, margin: `${spacing.xs}px 0` }} />
                    <div style={{ fontWeight: typography.weight.medium }}>{t('pack.handoff.qiraHeading')}</div>
                    <div style={{ color: palette.subtle }}>{handoff.qiraBacklogDraft.projectDescription}</div>
                    <div>
                      <div style={{ fontWeight: typography.weight.medium, marginBottom: 4 }}>{t('pack.handoff.epicsHeading')}</div>
                      {handoff.qiraBacklogDraft.epics.map((epic) => (
                        <div key={epic.title} style={{ marginBottom: spacing.xs }}>
                          <div>{epic.title}</div>
                          <div style={{ color: palette.subtle }}>{epic.relatedSections.join(', ')}</div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontWeight: typography.weight.medium, marginBottom: 4 }}>{t('pack.handoff.aiPromptsHeading')}</div>
                      {handoff.aiAgentPromptBundleDraft.map((prompt) => (
                        <details key={prompt.title} style={{ marginBottom: spacing.xs }}>
                          <summary style={{ cursor: 'pointer' }}>{prompt.title}</summary>
                          <div style={{ color: palette.subtle, marginTop: 4 }}>{prompt.purpose}</div>
                          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, background: palette.canvas, padding: spacing.sm, borderRadius: radius.sm, marginTop: spacing.xs }}>{prompt.promptBody}</pre>
                        </details>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* Research updates tab */}
              {rightTab === 'research' && (
                <Card style={{ padding: spacing.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                    <span style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs }}>{t('pack.research.title')}</span>
                    <Button variant="ghost" onClick={() => setShowAddResearch(!showAddResearch)}>{t('pack.research.addToggle')}</Button>
                  </div>

                  {showAddResearch && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.sm, background: palette.canvas, borderRadius: radius.sm }}>
                      <input
                        placeholder={t('pack.research.titlePlaceholder')}
                        value={newResearchTitle}
                        onChange={(e) => setNewResearchTitle(e.target.value)}
                        style={{ ...inputStyle }}
                      />
                      <select value={newResearchType} onChange={(e) => setNewResearchType(e.target.value)} style={{ ...sel }}>
                        {['customer_interview', 'competitor_note', 'landing_result', 'survey_result', 'pricing_feedback', 'legal_note', 'local_market_note', 'investor_feedback', 'internal_team_note', 'ai_agent_implementation_feedback'].map((rt) => (
                          <option key={rt} value={rt}>{rt.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                      <textarea
                        placeholder={t('pack.research.contentPlaceholder')}
                        value={newResearchContent}
                        onChange={(e) => setNewResearchContent(e.target.value)}
                        rows={3}
                        style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <Button onClick={() => void addResearchUpdate()} disabled={commentBusy || !newResearchTitle.trim()}>{t('pack.research.addButton')}</Button>
                        <Button variant="ghost" onClick={() => setShowAddResearch(false)}>{t('pack.research.cancelButton')}</Button>
                      </div>
                    </div>
                  )}

                  {researchUpdates.length === 0 && !showAddResearch && (
                    <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>{t('pack.research.empty')}</span>
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
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Build Blueprint panel ───────────────────────────────────────────────────

function BlueprintPanel({ blueprint, t }: { blueprint: BlueprintView | null; t: Translator }) {
  if (!blueprint) return <LoadingState label={t('pack.blueprint.loading')} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <Card style={{ padding: spacing.lg }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.sm }}>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{t('pack.blueprint.readiness')}</div>
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
        <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm, marginBottom: spacing.sm }}>{t('pack.blueprint.screenContracts')} ({blueprint.screenContracts.length})</div>
        {blueprint.screenContracts.map((s) => {
          const kinds = s.states.map((st) => st.kind);
          const hasStates = ['empty', 'loading', 'failed'].every((r) => kinds.includes(r));
          return (
            <div key={s.name} style={{ padding: `${spacing.sm}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                <span style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium }}>{s.name}</span>
                <Badge variant={hasStates ? 'success' : 'failed'}>{hasStates ? t('pack.blueprint.statesOk') : t('pack.blueprint.statesMissing')}</Badge>
                <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>→ {s.primaryAction}</span>
              </div>
              <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: 2 }}>
                {t('pack.blueprint.backend')}: {s.backendDependencies.join(', ') || t('pack.blueprint.frontendOnly')}
              </div>
            </div>
          );
        })}
      </Card>

      <Card style={{ padding: spacing.lg }}>
        <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm, marginBottom: spacing.sm }}>{t('pack.blueprint.apiScreenMap')}</div>
        {blueprint.apiToScreenMap.map((m, i) => (
          <div key={i} style={{ fontSize: typography.size.xs, padding: `${spacing.xs}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
            <strong>{m.screen}</strong>: {t('pack.blueprint.reads')} {m.endpoints.map((e) => `${e.method} ${e.path}`).join(', ') || '—'}; {t('pack.blueprint.writes')} {m.actions.map((a) => `${a.method} ${a.path}`).join(', ') || '—'}
          </div>
        ))}
      </Card>

      <Card style={{ padding: spacing.lg }}>
        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', marginBottom: spacing.sm }}>
          <Badge variant="risk">{t('pack.blueprint.doNotBuild')}</Badge>
          <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>{t('pack.blueprint.doNotBuildCaption')}</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: spacing.md, fontSize: typography.size.xs }}>
          {blueprint.doNotBuild.map((d, i) => <li key={i} style={{ marginBottom: spacing.xs }}><strong>{d.item}</strong> — {d.reason}</li>)}
        </ul>
      </Card>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePackTitle(title: string): string {
  return /preview/i.test(title) ? 'Build-Ready Product Pack' : title;
}

function groupDocsForNavigation(documents: DocView[], t: Translator) {
  const order: Array<{ key: 'vision' | 'build' | 'execution' | 'evidence'; title: string }> = [
    { key: 'vision', title: t('pack.groups.vision') },
    { key: 'build', title: t('pack.groups.build') },
    { key: 'execution', title: t('pack.groups.execution') },
    { key: 'evidence', title: t('pack.groups.evidence') },
  ];
  const fallback = documents.every((doc) => !doc.metadata?.layer);
  if (fallback) {
    return [{ key: 'build', title: t('pack.groups.documents'), documents, startIndex: 0 }] as const;
  }
  let startIndex = 0;
  return order
    .map((group) => {
      const groupDocuments = documents.filter((doc) => doc.metadata?.layer === group.key);
      const value = { ...group, documents: groupDocuments, startIndex };
      startIndex += groupDocuments.length;
      return value;
    })
    .filter((group) => group.documents.length > 0);
}

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
