/**
 * Mobile web Deliverable Hub for the Product Pack page. Rendered alongside
 * the desktop reader in `app/signalkit/packs/[id]/page.tsx`; CSS media
 * queries (see `.pack-deliverable-hub` / `.pack-reader-desktop` in
 * globals.css) decide which one is visible at the current viewport — same
 * pattern as the off-canvas sidebar in `components/shell.tsx`.
 *
 * Intentionally NOT a document manager: no 31-document list, no inline
 * document body, no raw QC/assumptions dump, no Regenerate button. The PDF
 * is the reading surface; Backlog & Sprints and Vibe Coding Prompts are
 * separate execution artifacts.
 */
'use client';

import { useState } from 'react';
import { inferPromptRole, type PromptRole } from '@signalkit/shared';
import { spacing, typography, radius, border, colorFor } from '@signalkit/ui';
import { Card, Button, Badge, palette } from './ui';
import { API_BASE, apiGet, apiPost } from '../lib/api';
import type { Translator } from '@signalkit/i18n';
import type {
  Pack, QiraBacklogDraft, QiraBacklogEpic, AiAgentPrompt,
} from '../app/signalkit/packs/[id]/page';

// ── Export job helpers (create/poll/download — no new backend needed) ──────

interface ExportJobLite {
  id: string;
  type: string;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
  artifact?: { fileName: string; mimeType: string } | null;
}

async function getOrCreateReadyExport(
  ws: string,
  packId: string,
  type: string,
  language: string,
  onStatus?: (status: string) => void,
): Promise<ExportJobLite> {
  const jobs = await apiGet<ExportJobLite[]>(`/workspaces/${ws}/packs/${packId}/exports`);
  const ready = jobs.find((j) => j.type === type && j.status === 'ready');
  if (ready) return ready;

  let job = jobs.find((j) => j.type === type && (j.status === 'queued' || j.status === 'processing'));
  if (!job) {
    job = await apiPost<ExportJobLite>(`/workspaces/${ws}/packs/${packId}/exports`, { type, language });
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    onStatus?.(job.status);
    if (job.status === 'ready') return job;
    if (job.status === 'failed') throw new Error('Export generation failed.');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const list = await apiGet<ExportJobLite[]>(`/workspaces/${ws}/packs/${packId}/exports`);
    const match = list.find((j) => j.id === job!.id);
    if (match) job = match;
  }
  throw new Error('Export timed out — try again in a moment.');
}

async function fetchExportBlob(ws: string, exportId: string): Promise<Blob> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('signalkit_token') : null;
  const res = await fetch(`${API_BASE}/workspaces/${ws}/exports/${exportId}/download`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  return res.blob();
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function openBlobInNewTab(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Web Share API with a File when supported; otherwise copies the page link. */
async function shareBlobOrCopyLink(blob: Blob, fileName: string, mimeType: string): Promise<'shared' | 'copied'> {
  type ShareNavigator = Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  const nav = navigator as ShareNavigator;
  try {
    const file = new File([blob], fileName, { type: mimeType });
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: fileName });
      return 'shared';
    }
  } catch {
    // User cancelled the share sheet, or the browser rejected the file share — fall back below.
  }
  await navigator.clipboard.writeText(window.location.href);
  return 'copied';
}

function shareTextAsFile(content: string, fileName: string) {
  triggerDownload(new Blob([content], { type: 'text/markdown' }), fileName);
}

// ── Backlog markdown (mirrors apps/api renderMarkdownZip's backlog.md) ─────

function buildBacklogMarkdown(backlog: QiraBacklogDraft): string {
  const lines: string[] = [
    `# ${backlog.projectTitle}`, '',
    '> Draft backlog for Qira or another delivery/PM system. Not a live API export.', '',
    backlog.projectDescription, '', '## Epics', '',
  ];
  for (const epic of backlog.epics) {
    lines.push(`### ${epic.title}`, '', epic.description, '', `- Priority: ${epic.priority}`, `- Sprint hint: ${epic.sprintHint}`, '', '#### Tasks', '');
    for (const task of epic.tasks) {
      lines.push(`- **${task.title}** (${task.ownerRole}, ${task.taskType}) — ${task.description}`);
      if (task.acceptanceCriteria.length) lines.push(`  - Acceptance: ${task.acceptanceCriteria.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## Sprints', '');
  for (const sprint of backlog.sprints) {
    lines.push(`### ${sprint.name}`, '', sprint.goal, `- Epics: ${sprint.epicTitles.join(', ')}`, `- Tasks: ${sprint.taskTitles.join(', ')}`, '');
  }
  return lines.join('\n');
}

// ── Small building blocks ───────────────────────────────────────────────────

function DeliverableCard({
  title, description, children, actions,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  actions: Array<{ label: string; onPress: () => void; loading?: boolean; variant?: 'primary' | 'secondary' | 'ghost' }>;
}) {
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <div style={{ fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.ink }}>{title}</div>
      <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: 2, marginBottom: spacing.sm }}>{description}</div>
      {children}
      <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', marginTop: children ? spacing.sm : 0 }}>
        {actions.map((a) => (
          <Button key={a.label} variant={a.variant ?? 'secondary'} onClick={a.onPress} disabled={a.loading}>
            {a.loading ? '…' : a.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div style={{
      background: colorFor('failed', 'light').bg, border: `${border.hairline}px solid ${colorFor('failed', 'light').border}`,
      borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.xs, color: colorFor('failed', 'light').fg,
      marginTop: spacing.sm,
    }}>
      {message}
    </div>
  );
}

const ROLE_ORDER: PromptRole[] = ['frontend', 'backend', 'ai', 'qa', 'integration', 'general'];

function EpicRow({ epic }: { epic: QiraBacklogEpic }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `${border.hairline}px solid ${palette.line}`, padding: `${spacing.xs}px 0` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium, color: palette.ink }}>{epic.title}</span>
        <span style={{ fontSize: typography.size.xs, color: palette.subtle }}>{epic.tasks.length} · {open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ marginTop: spacing.xs, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          <div style={{ fontSize: typography.size.xs, color: palette.subtle }}>{epic.description}</div>
          {epic.tasks.map((task) => (
            <div key={task.title} style={{ fontSize: typography.size.xs, paddingLeft: spacing.sm, borderLeft: `${border.hairline}px solid ${palette.line}` }}>
              <div style={{ fontWeight: typography.weight.medium }}>{task.title}</div>
              <div style={{ color: palette.subtle }}>{task.description}</div>
              <div style={{ color: palette.subtle, fontSize: 10 }}>Owner: {task.ownerRole}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function PackDeliverableHub({
  ws, pack, t, onSubmitComment,
}: {
  ws: string | null;
  pack: Pack;
  t: Translator;
  onSubmitComment: (text: string) => Promise<void>;
}) {
  const handoff = pack.metadata?.executionHandoff ?? null;
  const backlog = handoff?.qiraBacklogDraft ?? null;
  const prompts = handoff?.aiAgentPromptBundleDraft ?? [];

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentDone, setCommentDone] = useState(false);

  const market = pack.documents[0]?.metadata?.market?.country ?? t('market.global');
  const language = pack.primaryLanguage ?? pack.documents[0]?.language ?? 'en';
  const gateStatus = pack.qualityGate?.status ?? 'not_run';

  async function run(key: string, fn: () => Promise<void>) {
    setBusyKey(key);
    setErrorNote(null);
    setStatusNote(null);
    try {
      await fn();
    } catch (e) {
      setErrorNote(e instanceof Error ? e.message : t('pack.hub.error.generic'));
    } finally {
      setBusyKey(null);
    }
  }

  async function pdfAction(action: 'open' | 'download' | 'share') {
    if (!ws) return;
    await run(`pdf-${action}`, async () => {
      const job = await getOrCreateReadyExport(ws, pack.id, 'full_pdf_pack', language, (s) => setStatusNote(s === 'processing' || s === 'queued' ? t('pack.hub.pdf.preparing') : null));
      const blob = await fetchExportBlob(ws, job.id);
      const fileName = job.artifact?.fileName ?? `${pack.title}.pdf`;
      const mimeType = job.artifact?.mimeType ?? 'application/pdf';
      if (action === 'open') openBlobInNewTab(blob);
      else if (action === 'download') triggerDownload(blob, fileName);
      else {
        const result = await shareBlobOrCopyLink(blob, fileName, mimeType);
        if (result === 'copied') setStatusNote(t('pack.hub.share.copiedLink'));
      }
      setStatusNote(null);
    });
  }

  async function zipAction() {
    if (!ws) return;
    await run('zip', async () => {
      const job = await getOrCreateReadyExport(ws, pack.id, 'markdown_zip', language, (s) => setStatusNote(s === 'processing' || s === 'queued' ? t('pack.hub.pdf.preparing') : null));
      const blob = await fetchExportBlob(ws, job.id);
      triggerDownload(blob, job.artifact?.fileName ?? `${pack.title}.zip`);
      setStatusNote(null);
    });
  }

  async function promptsZipAction() {
    if (!ws) return;
    await run('prompts-zip', async () => {
      const job = await getOrCreateReadyExport(ws, pack.id, 'ai_agent_engineering_bundle', language, (s) => setStatusNote(s === 'processing' || s === 'queued' ? t('pack.hub.pdf.preparing') : null));
      const blob = await fetchExportBlob(ws, job.id);
      triggerDownload(blob, job.artifact?.fileName ?? `${pack.title}-ai-agent-bundle.zip`);
      setStatusNote(null);
    });
  }

  function backlogDownload() {
    if (!backlog) return;
    shareTextAsFile(buildBacklogMarkdown(backlog), `${backlog.projectTitle.replace(/[^a-z0-9]+/gi, '-')}-backlog.md`);
  }

  async function copyPrompt(prompt: AiAgentPrompt) {
    await navigator.clipboard.writeText(prompt.promptBody);
    setCopiedTitle(prompt.title);
    setTimeout(() => setCopiedTitle(null), 1800);
  }

  async function submitComment() {
    if (commentText.trim().length < 5) {
      setErrorNote(t('pack.hub.error.generic'));
      return;
    }
    await run('comment', async () => {
      await onSubmitComment(commentText.trim());
      setCommentText('');
      setCommentDone(true);
    });
  }

  const groupedPrompts = ROLE_ORDER
    .map((role) => ({ role, items: prompts.filter((p) => inferPromptRole(p.relatedSections) === role) }))
    .filter((g) => g.items.length > 0);

  const roleLabel: Record<PromptRole, string> = {
    frontend: t('pack.hub.prompts.roleFrontend'),
    backend: t('pack.hub.prompts.roleBackend'),
    ai: t('pack.hub.prompts.roleAi'),
    qa: t('pack.hub.prompts.roleQa'),
    integration: t('pack.hub.prompts.roleIntegration'),
    general: t('pack.hub.prompts.roleGeneral'),
  };

  return (
    <div>
      {/* Header */}
      <Card style={{ marginBottom: spacing.md }}>
        <div style={{ fontSize: 10, fontWeight: typography.weight.medium, color: palette.subtle, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {t('nav.pack')}
        </div>
        <div style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.ink, marginTop: 2 }}>{pack.title}</div>
        <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: spacing.xs }}>{t('pack.hub.explain')}</div>
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', marginTop: spacing.sm }}>
          <Badge variant="muted">{t('pack.hub.language')}: {language.toUpperCase()}</Badge>
          <Badge variant="muted">{t('pack.hub.market')}: {market}</Badge>
          <Badge variant="muted">{t('pack.hub.generated')}: {new Date(pack.createdAt).toLocaleDateString()}</Badge>
          <Badge variant={gateStatus === 'failed' ? 'failed' : gateStatus === 'warnings' ? 'warning' : 'success'}>
            {t('pack.gate.label')}: {gateStatus}
          </Badge>
          <Badge variant="muted">{pack.status.replace(/_/g, ' ')}</Badge>
        </div>
      </Card>

      {errorNote && <ErrorNote message={errorNote} />}
      {statusNote && <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginBottom: spacing.sm }}>{statusNote}</div>}

      {/* Product Pack PDF */}
      <DeliverableCard
        title={t('pack.hub.pdf.title')}
        description={t('pack.hub.pdf.description')}
        actions={[
          { label: t('pack.hub.pdf.open'), onPress: () => void pdfAction('open'), loading: busyKey === 'pdf-open', variant: 'primary' },
          { label: t('pack.hub.pdf.download'), onPress: () => void pdfAction('download'), loading: busyKey === 'pdf-download' },
          { label: t('pack.hub.pdf.share'), onPress: () => void pdfAction('share'), loading: busyKey === 'pdf-share' },
        ]}
      />

      {/* Backlog & Sprints */}
      <DeliverableCard
        title={t('pack.hub.backlog.title')}
        description={backlog ? t('pack.hub.backlog.description') : t('pack.hub.backlog.empty')}
        actions={backlog ? [
          { label: backlogOpen ? t('pack.hub.backlog.close') : t('pack.hub.backlog.open'), onPress: () => setBacklogOpen((v) => !v), variant: 'primary' },
          { label: t('pack.hub.backlog.download'), onPress: backlogDownload },
        ] : []}
      >
        {backlogOpen && backlog && (
          <div>
            <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginBottom: spacing.xs }}>{backlog.projectDescription}</div>
            <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, marginBottom: spacing.xs }}>
              {t('pack.hub.backlog.epicsHeading')} ({backlog.epics.length})
            </div>
            {backlog.epics.map((epic) => <EpicRow key={epic.title} epic={epic} />)}
            <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, margin: `${spacing.sm}px 0 ${spacing.xs}px` }}>
              {t('pack.hub.backlog.sprintsHeading')} ({backlog.sprints.length})
            </div>
            {backlog.sprints.map((sprint) => (
              <div key={sprint.name} style={{ fontSize: typography.size.xs, marginBottom: spacing.xs }}>
                <strong>{sprint.name}</strong> — {sprint.goal}
              </div>
            ))}
          </div>
        )}
      </DeliverableCard>

      {/* Vibe Coding Prompts */}
      <DeliverableCard
        title={t('pack.hub.prompts.title')}
        description={prompts.length > 0 ? t('pack.hub.prompts.description') : t('pack.hub.prompts.empty')}
        actions={prompts.length > 0 ? [
          { label: promptsOpen ? t('pack.hub.prompts.close') : t('pack.hub.prompts.open'), onPress: () => setPromptsOpen((v) => !v), variant: 'primary' },
          { label: t('pack.hub.prompts.downloadZip'), onPress: () => void promptsZipAction(), loading: busyKey === 'prompts-zip' },
        ] : []}
      >
        {promptsOpen && groupedPrompts.map((group) => (
          <div key={group.role} style={{ marginBottom: spacing.sm }}>
            <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.xs, marginBottom: spacing.xs }}>
              {roleLabel[group.role]} ({group.items.length})
            </div>
            {group.items.map((prompt) => (
              <div key={prompt.title} style={{ borderBottom: `${border.hairline}px solid ${palette.line}`, padding: `${spacing.xs}px 0` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs }}>
                  <span style={{ fontSize: typography.size.xs, fontWeight: typography.weight.medium }}>{prompt.title}</span>
                  <Button variant="ghost" onClick={() => void copyPrompt(prompt)}>
                    {copiedTitle === prompt.title ? t('pack.hub.prompts.copied') : t('pack.hub.prompts.copy')}
                  </Button>
                </div>
                <div style={{ fontSize: 10, color: palette.subtle }}>{prompt.targetAgent}</div>
              </div>
            ))}
          </div>
        ))}
      </DeliverableCard>

      {/* ZIP Export */}
      <DeliverableCard
        title={t('pack.hub.zip.title')}
        description={t('pack.hub.zip.description')}
        actions={[{ label: t('pack.hub.zip.download'), onPress: () => void zipAction(), loading: busyKey === 'zip', variant: 'primary' }]}
      />

      {/* Add comment / request addition */}
      <Card>
        <div style={{ fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.ink }}>{t('pack.hub.comment.title')}</div>
        <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: 2, marginBottom: spacing.sm }}>{t('pack.hub.comment.description')}</div>
        {commentDone ? (
          <div style={{ fontSize: typography.size.xs, color: colorFor('success', 'light').fg }}>{t('pack.hub.comment.success')}</div>
        ) : (
          <>
            <textarea
              value={commentText}
              onChange={(e) => { setCommentText(e.target.value); setCommentDone(false); }}
              placeholder={t('pack.hub.comment.placeholder')}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', padding: spacing.sm, borderRadius: radius.md,
                border: `${border.hairline}px solid ${palette.line}`, fontSize: typography.size.xs,
                fontFamily: 'inherit', resize: 'vertical', color: palette.ink, background: palette.surface,
              }}
            />
            {busyKey === 'comment' && (
              <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: spacing.xs }}>{t('pack.hub.comment.busy')}</div>
            )}
            <div style={{ marginTop: spacing.sm }}>
              <Button onClick={() => void submitComment()} disabled={busyKey === 'comment'}>{t('pack.hub.comment.submit')}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
