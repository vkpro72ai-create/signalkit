'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SemanticColor } from '@signalkit/ui';
import {
  PageHeader, Card, Badge, Button, EmptyState, LoadingState, ErrorState,
} from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import {
  apiGet, apiPost, firstWorkspaceId,
  EXPORT_TYPES, ROLE_BRIEF_TYPES,
  type ExportJobView, type CreateExportInput,
} from '../../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PackSummary {
  id: string;
  title: string;
  depth: string;
  primaryLanguage: string;
  status: string;
}

interface ManifestView {
  exportId: string | null;
  packId: string;
  exportType: string;
  outputLanguage: string;
  generatedAt: string;
  includedDocuments: string[];
  qualityGateSummary: { status: string; passedCount: number; warnCount: number; failCount: number } | null;
  evidenceSummary: { count: number };
  assumptionsSummary: { count: number };
  unresolvedQuestionsSummary: { count: number };
  fileList: { path: string; bytes: number }[];
}

const LOCALE_OPTIONS = ['en', 'ru', 'tr', 'de', 'es', 'fr', 'pt', 'ar', 'hi', 'id'];
const EXPORT_CATEGORIES = [
  { id: 'pdf', label: 'PDF' },
  { id: 'bundle', label: 'Bundles' },
  { id: 'brief', label: 'Briefs' },
  { id: 'evidence', label: 'Evidence' },
] as const;

function statusColor(status: ExportJobView['status']): SemanticColor {
  if (status === 'ready') return 'ready';
  if (status === 'failed') return 'failed';
  if (status === 'processing') return 'warning';
  return 'muted';
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Export type card ──────────────────────────────────────────────────────────

function ExportTypeCard({
  type,
  selected,
  onSelect,
}: {
  type: typeof EXPORT_TYPES[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const formatLabel = type.format === 'pdf' ? 'PDF' : type.format === 'zip' ? 'ZIP' : 'MD';
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
        border: `1.5px solid ${selected ? '#111' : '#e0e0e0'}`,
        borderRadius: 5, background: selected ? '#f5f5f5' : '#fff',
        cursor: 'pointer', marginBottom: 5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: selected ? 700 : 400, color: '#111' }}>{type.label}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#888', letterSpacing: 0.5 }}>{formatLabel}</span>
      </div>
    </button>
  );
}

// ── Manifest viewer ───────────────────────────────────────────────────────────

function ManifestViewer({ manifest, onClose }: { manifest: ManifestView; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', border: '1.5px solid #111', borderRadius: 8, maxWidth: 680, width: '90%', maxHeight: '80vh', overflow: 'auto', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Export Manifest</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>Close</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
          <tbody>
            {[
              ['Export ID', manifest.exportId ?? '—'],
              ['Pack ID', manifest.packId],
              ['Export Type', manifest.exportType],
              ['Language', manifest.outputLanguage],
              ['Generated', new Date(manifest.generatedAt).toLocaleString()],
              ['Documents', manifest.includedDocuments.length.toString()],
              ['Evidence items', manifest.evidenceSummary?.count.toString() ?? '0'],
              ['Assumptions', manifest.assumptionsSummary?.count.toString() ?? '0'],
              ['Unresolved questions', manifest.unresolvedQuestionsSummary?.count.toString() ?? '0'],
              ['Quality gate', manifest.qualityGateSummary?.status ?? '—'],
            ].map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '6px 8px', color: '#666', fontWeight: 500, width: 200 }}>{k}</td>
                <td style={{ padding: '6px 8px', color: '#111' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {manifest.includedDocuments.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Included Documents</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
              {manifest.includedDocuments.map((d) => (
                <span key={d} style={{ background: '#f0f0f0', borderRadius: 3, padding: '2px 8px', fontSize: 11 }}>{d}</span>
              ))}
            </div>
          </>
        )}

        {manifest.fileList && manifest.fileList.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>File List</h3>
            <div style={{ background: '#f8f8f8', borderRadius: 4, padding: 12, maxHeight: 200, overflow: 'auto' }}>
              {manifest.fileList.map((f) => (
                <div key={f.path} style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>
                  {f.path} <span style={{ color: '#aaa' }}>({fileSizeLabel(f.bytes)})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Export history row ────────────────────────────────────────────────────────

function ExportHistoryRow({
  job,
  workspaceId,
  onManifest,
}: {
  job: ExportJobView;
  workspaceId: string;
  onManifest: (m: ManifestView) => void;
}) {
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('signalkit_token') : null;

  const handleDownload = () => {
    const url = `${API}/workspaces/${workspaceId}/exports/${job.id}/download`;
    if (token) {
      fetch(url, { headers: { authorization: `Bearer ${token}` } })
        .then((r) => r.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', job.artifact?.fileName ?? 'export');
          link.click();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        })
        .catch(() => {/* ignore */});
    }
  };

  const handleManifest = async () => {
    try {
      const m = await apiGet<ManifestView>(`/workspaces/${workspaceId}/exports/${job.id}/manifest`);
      onManifest(m);
    } catch {/* ignore */}
  };

  return (
    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>
        {job.type.replace(/_/g, ' ')}
        {job.roleBrief && <span style={{ color: '#888', marginLeft: 6 }}>({job.roleBrief})</span>}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12 }}>{job.language?.toUpperCase()}</td>
      <td style={{ padding: '10px 12px' }}>
        <Badge variant={statusColor(job.status)}>{job.status}</Badge>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: '#888' }}>
        {job.artifact ? fileSizeLabel(job.artifact.sizeBytes) : '—'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: '#888' }}>
        {new Date(job.createdAt).toLocaleString()}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {job.status === 'ready' && (
            <button
              type="button"
              onClick={handleDownload}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              Download
            </button>
          )}
          {job.status === 'ready' && (
            <button
              type="button"
              onClick={() => void handleManifest()}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'transparent', color: '#555', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
            >
              Manifest
            </button>
          )}
          {job.status === 'failed' && job.errorCode && (
            <span style={{ fontSize: 10, color: '#c00' }}>{job.errorCode}</span>
          )}
          {(job.status === 'queued' || job.status === 'processing') && (
            <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
              {job.status === 'queued' ? 'Waiting…' : 'Processing…'}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExportsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <ExportsPageInner />
    </Suspense>
  );
}

function ExportsPageInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const preselectedPackId = searchParams.get('packId') ?? '';

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string>(preselectedPackId);
  const [jobs, setJobs] = useState<ExportJobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [selectedType, setSelectedType] = useState<string>('markdown_zip');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedLang, setSelectedLang] = useState('en');
  const [applyBranding, setApplyBranding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Manifest viewer
  const [manifest, setManifest] = useState<ManifestView | null>(null);

  // Category filter
  const [category, setCategory] = useState<string>('pdf');

  const selectedExportType = EXPORT_TYPES.find((e) => e.id === selectedType);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const ws = await firstWorkspaceId();
      if (!ws) { setLoadError('No workspace found'); return; }
      setWorkspaceId(ws);

      const allPacks: PackSummary[] = [];
      try {
        const niches = await apiGet<{ id: string }[]>(`/workspaces/${ws}/niches`);
        for (const niche of niches.slice(0, 5)) {
          const ps = await apiGet<PackSummary[]>(`/workspaces/${ws}/niches/${niche.id}/packs`);
          allPacks.push(...ps);
        }
      } catch {/* no niches yet */}

      setPacks(allPacks);
      // Preselect from URL ?packId= param; fall back to first pack
      if (!preselectedPackId && allPacks.length > 0) setSelectedPackId(allPacks[0].id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    if (!workspaceId || !selectedPackId) return;
    try {
      const list = await apiGet<ExportJobView[]>(`/workspaces/${workspaceId}/packs/${selectedPackId}/exports`);
      setJobs(list);
    } catch {/* ignore */}
  }, [workspaceId, selectedPackId]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { void loadJobs(); }, [loadJobs]);

  // Poll for in-progress jobs
  useEffect(() => {
    const hasInProgress = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
    if (!hasInProgress) return;
    const timer = setInterval(() => { void loadJobs(); }, 2000);
    return () => clearInterval(timer);
  }, [jobs, loadJobs]);

  const handleGenerate = async () => {
    if (!workspaceId || !selectedPackId) return;
    setGenError(null);
    setGenerating(true);
    try {
      const input: CreateExportInput = {
        type: selectedType,
        language: selectedLang,
        roleBrief: selectedRole || null,
        applyBranding,
      };
      await apiPost<ExportJobView>(`/workspaces/${workspaceId}/packs/${selectedPackId}/exports`, input);
      await loadJobs();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <LoadingState label={t('state.loading')} />;
  if (loadError) return <ErrorState title={t('state.error.title')} body={loadError} />;

  const filteredTypes = EXPORT_TYPES.filter((e) => e.category === category);

  return (
    <div>
      {manifest && <ManifestViewer manifest={manifest} onClose={() => setManifest(null)} />}

      <PageHeader
        title={t('export.center')}
        subtitle="Generate production-grade exports from your Product Document Pack."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, marginTop: 24, alignItems: 'start' }}>

        {/* ── Left: configure ── */}
        <div>
          <Card>
            {/* Pack selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Pack</label>
              {packs.length === 0 ? (
                <p style={{ fontSize: 12, color: '#888', margin: 0 }}>No packs available. Generate a pack first.</p>
              ) : (
                <select
                  value={selectedPackId}
                  onChange={(e) => setSelectedPackId(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #ddd', borderRadius: 4, fontSize: 12 }}
                >
                  {packs.map((p) => (
                    <option key={p.id} value={p.id}>{p.title} ({p.depth})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
              {EXPORT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  style={{
                    padding: '4px 9px', fontSize: 11, fontWeight: 600,
                    border: `1.5px solid ${category === cat.id ? '#111' : '#ddd'}`,
                    borderRadius: 4, background: category === cat.id ? '#111' : '#fff',
                    color: category === cat.id ? '#fff' : '#555', cursor: 'pointer',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Export type cards */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Export Type</label>
              {filteredTypes.map((type) => (
                <ExportTypeCard
                  key={type.id}
                  type={type}
                  selected={selectedType === type.id}
                  onSelect={() => setSelectedType(type.id)}
                />
              ))}
            </div>

            {/* Role brief */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Role Brief (optional)</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #ddd', borderRadius: 4, fontSize: 12 }}
              >
                <option value="">— No role filter —</option>
                {ROLE_BRIEF_TYPES.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Output Language</label>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #ddd', borderRadius: 4, fontSize: 12 }}
              >
                {LOCALE_OPTIONS.map((l) => (
                  <option key={l} value={l}>{l.toUpperCase()}</option>
                ))}
              </select>
            </div>

            {/* White-label */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555', cursor: 'pointer' }}>
                <input type="checkbox" checked={applyBranding} onChange={(e) => setApplyBranding(e.target.checked)} />
                Apply workspace branding
              </label>
            </div>

            {/* Preview */}
            <div style={{ background: '#f8f8f8', borderRadius: 4, padding: 10, marginBottom: 14, fontSize: 11, color: '#555' }}>
              <strong>Preview</strong>
              <div style={{ marginTop: 5, lineHeight: 1.7 }}>
                Type: <strong>{selectedExportType?.label ?? selectedType}</strong><br />
                Format: <strong>{selectedExportType?.format.toUpperCase() ?? '—'}</strong><br />
                Language: <strong>{selectedLang.toUpperCase()}</strong>
                {selectedRole && <><br />Role: <strong>{ROLE_BRIEF_TYPES.find((r) => r.id === selectedRole)?.label}</strong></>}
              </div>
            </div>

            {genError && (
              <div style={{ background: '#fff0f0', border: '1px solid #fcc', borderRadius: 4, padding: 8, marginBottom: 10, fontSize: 11, color: '#c00' }}>
                {genError}
              </div>
            )}

            <Button variant="primary" onClick={() => void handleGenerate()} disabled={!selectedPackId || generating}>
              {generating ? 'Generating…' : 'Generate Export'}
            </Button>
          </Card>
        </div>

        {/* ── Right: history ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Export History</h2>
            <button type="button" onClick={() => void loadJobs()} style={{ background: 'transparent', border: '1px solid #ddd', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>

          {jobs.length === 0 ? (
            <Card>
              <EmptyState
                title="No exports yet"
                body="Configure an export and click Generate Export to create your first export."
              />
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #e8e8e8', background: '#fafafa' }}>
                    {['Type', 'Language', 'Status', 'Size', 'Created', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <ExportHistoryRow
                      key={job.id}
                      job={job}
                      workspaceId={workspaceId ?? ''}
                      onManifest={setManifest}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Status legend */}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#888' }}>Status: </span>
            <Badge variant="muted">queued</Badge>
            <span style={{ fontSize: 11, color: '#888' }}>→</span>
            <Badge variant="warning">processing</Badge>
            <span style={{ fontSize: 11, color: '#888' }}>→</span>
            <Badge variant="ready">ready</Badge>
            <span style={{ fontSize: 11, color: '#888' }}>|</span>
            <Badge variant="failed">failed</Badge>
          </div>

          {/* Security note */}
          <div style={{ marginTop: 14, padding: 12, background: '#f8f8f8', borderRadius: 4, fontSize: 11, color: '#888' }}>
            Exports contain no API keys, encryption secrets, or internal service credentials.
            White-label exports use workspace branding configured in Settings → Workspace.
          </div>
        </div>
      </div>
    </div>
  );
}
