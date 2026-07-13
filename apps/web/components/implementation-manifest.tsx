'use client';

/**
 * Implementation-prompt manifest viewer. Renders the deterministic
 * workstream/sprint breakdown of the pack's bounded coding-agent prompts.
 * Filterable by sprint and workstream, and windowed (only a bounded slice is
 * rendered at a time) so a 100+ prompt manifest never freezes the tab.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { Card, Badge, LoadingState, palette } from './ui';
import { useT } from '../lib/i18n';
import { firstWorkspaceId, decisionApi, type ImplementationManifestView, type ManifestPromptView } from '../lib/api';

const PAGE = 40; // window size — cap DOM nodes for large manifests

export function ImplementationManifest({ packId }: { packId: string }) {
  const t = useT();
  const [manifest, setManifest] = useState<ImplementationManifestView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sprint, setSprint] = useState<number | 'all'>('all');
  const [workstream, setWorkstream] = useState<string>('all');
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    const ws = await firstWorkspaceId();
    if (!ws) { setLoading(false); return; }
    try { setManifest(await decisionApi.manifest(ws, packId)); } catch { /* none */ }
    setLoading(false);
  }, [packId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!manifest) return [] as ManifestPromptView[];
    return manifest.prompts.filter(
      (p) => (sprint === 'all' || p.phase === sprint) && (workstream === 'all' || p.workstream === workstream),
    );
  }, [manifest, sprint, workstream]);

  useEffect(() => { setLimit(PAGE); }, [sprint, workstream]);

  if (loading) return <LoadingState label={t('state.loading')} />;
  if (!manifest || manifest.totalPrompts === 0) {
    return <Card><div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{t('manifest.none')}</div></Card>;
  }

  const selectStyle = {
    padding: `${spacing.xs}px ${spacing.sm}px`, borderRadius: radius.md,
    border: `${border.hairline}px solid ${palette.line}`, background: palette.surface, color: palette.ink, fontSize: typography.size.sm,
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.md }}>
        <div style={{ fontWeight: typography.weight.semibold }}>{t('manifest.title')}</div>
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
          <select style={selectStyle} value={String(sprint)} onChange={(e) => setSprint(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">{t('manifest.allSprints')}</option>
            {manifest.sprints.map((s) => <option key={s} value={s}>{t('manifest.sprint')} {s}</option>)}
          </select>
          <select style={selectStyle} value={workstream} onChange={(e) => setWorkstream(e.target.value)}>
            <option value="all">{t('manifest.allWorkstreams')}</option>
            {manifest.workstreams.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginBottom: spacing.md }}>
        {manifest.totalPrompts} · {manifest.workstreams.length} · {manifest.sprints.length}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {filtered.slice(0, limit).map((p) => (
          <Card key={p.promptId}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontWeight: typography.weight.medium, fontSize: typography.size.sm }}>
                <span style={{ color: palette.subtle }}>{p.promptId}</span> · {p.title}
              </div>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                <Badge variant="opportunity">{p.workstream}</Badge>
                <Badge variant="muted">{t('manifest.sprint')} {p.phase}</Badge>
                {p.groupingConfidence === 'low' && <Badge variant="warning">⚠ {t('manifest.lowConfidence')}</Badge>}
              </div>
            </div>
            <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: spacing.xs }}>{p.objective}</div>
            {p.dependsOn.length > 0 && (
              <div style={{ fontSize: typography.size.xs, color: palette.subtle, marginTop: spacing.xs }}>
                {t('manifest.dependsOn')}: {p.dependsOn.join(', ')}
              </div>
            )}
          </Card>
        ))}
      </div>

      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          style={{ marginTop: spacing.md, padding: `${spacing.xs}px ${spacing.md}px`, borderRadius: radius.md, border: `${border.hairline}px solid ${palette.line}`, background: palette.surface, color: palette.ink, cursor: 'pointer', fontSize: typography.size.sm }}
        >
          + {filtered.length - limit}
        </button>
      )}
    </div>
  );
}
