'use client';

/**
 * Founder Verdict — the founder's OWN personal rating/comment/decision on an
 * opportunity, kept deliberately separate from the AI Verdict. A high AI score
 * never stands in for a founder's conviction, and vice versa.
 */
import { useCallback, useEffect, useState } from 'react';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { Button, Card, palette } from './ui';
import { useT } from '../lib/i18n';
import { firstWorkspaceId, decisionApi, type FounderDecision, type FounderVerdictView } from '../lib/api';

const DECISIONS: FounderDecision[] = ['undecided', 'explore', 'generate_pack', 'postpone', 'reject', 'ready_to_commit'];

export function FounderVerdict({ nicheId }: { nicheId: string }) {
  const t = useT();
  const [ws, setWs] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState<FounderDecision>('undecided');
  const [others, setOthers] = useState<FounderVerdictView['others']>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const workspace = await firstWorkspaceId();
    if (!workspace) return;
    setWs(workspace);
    try {
      const v = await decisionApi.getFounderVerdict(workspace, nicheId);
      if (v.mine) { setRating(v.mine.rating); setComment(v.mine.comment); setDecision(v.mine.decision); }
      setOthers(v.others);
    } catch { /* leave defaults */ }
  }, [nicheId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!ws) return;
    setSaving(true); setSaved(false);
    try {
      await decisionApi.putFounderVerdict(ws, nicheId, { rating, comment, decision });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{t('verdict.founderTitle')}</div>

      <div style={{ fontSize: typography.size.sm, marginBottom: spacing.xs }}>{t('verdict.motivate')}</div>
      <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${t('verdict.yourRating')} ${n}`}
            onClick={() => { setRating(n); setSaved(false); }}
            style={{
              width: 36, height: 36, borderRadius: radius.md, cursor: 'pointer',
              border: `${border.hairline}px solid ${palette.line}`,
              background: rating != null && n <= rating ? palette.ink : palette.surface,
              color: rating != null && n <= rating ? palette.surface : palette.subtle,
              fontWeight: typography.weight.semibold,
            }}
          >{n}</button>
        ))}
      </div>

      <label style={{ display: 'block', fontSize: typography.size.sm, marginBottom: spacing.xs }}>{t('verdict.yourComment')}</label>
      <textarea
        value={comment}
        onChange={(e) => { setComment(e.target.value); setSaved(false); }}
        placeholder={t('verdict.commentPlaceholder')}
        rows={3}
        style={{
          width: '100%', padding: spacing.sm, borderRadius: radius.md,
          border: `${border.hairline}px solid ${palette.line}`, background: palette.surface, color: palette.ink,
          fontSize: typography.size.sm, resize: 'vertical', marginBottom: spacing.md,
        }}
      />

      <label style={{ display: 'block', fontSize: typography.size.sm, marginBottom: spacing.xs }}>{t('verdict.decision')}</label>
      <select
        value={decision}
        onChange={(e) => { setDecision(e.target.value as FounderDecision); setSaved(false); }}
        style={{
          padding: `${spacing.xs}px ${spacing.sm}px`, borderRadius: radius.md, marginBottom: spacing.md,
          border: `${border.hairline}px solid ${palette.line}`, background: palette.surface, color: palette.ink, fontSize: typography.size.sm,
        }}
      >
        {DECISIONS.map((d) => <option key={d} value={d}>{t(`decision.${d}` as never)}</option>)}
      </select>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
        <Button onClick={() => void save()} disabled={saving}>{saving ? t('action.saving') : t('verdict.save')}</Button>
        {saved && <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>{t('verdict.saved')}</span>}
      </div>

      {others.length > 0 && (
        <div style={{ marginTop: spacing.md, fontSize: typography.size.xs, color: palette.subtle }}>
          {others.map((o) => (
            <div key={o.userId}>{o.user.displayName ?? o.user.email}: {o.rating ?? '—'}/5 · {t(`decision.${o.decision}` as never)}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
