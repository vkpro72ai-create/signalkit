'use client';

/**
 * Minimal, flat Markdown renderer (headings, bullets, blockquote, paragraphs)
 * for Product Pack documents. No gradients.
 *
 * Two things beyond plain markdown, both keyed off the exact, stable
 * convention `documentToMarkdown()` (apps/api/src/packs/pack.service.ts)
 * emits for every generated document — no backend change needed:
 *  - `### heading` lines are section headings (one per `sections[]` entry).
 *    Comments anchor to this exact heading text.
 *  - A `**Risks**` / `**Assumptions**` / `**Source needs**` bold line
 *    immediately followed by a bullet list is rendered as a colored callout
 *    instead of generic bold+list, so these don't get lost in plain prose.
 */
import { useState, type ReactNode } from 'react';
import { spacing, typography, radius, border, colorFor, type SemanticColor } from '@signalkit/ui';
import { palette, Button } from './ui';
import type { Translator } from '@signalkit/i18n';

export interface MarkdownComment {
  id: string;
  sectionHeading: string | null;
  body: string;
  status: string;
  createdAt: string;
}

const CALLOUT_VARIANT: Record<string, SemanticColor> = {
  Risks: 'risk',
  Assumptions: 'warning',
  'Source needs': 'warning',
};

export function Markdown({
  source,
  comments = [],
  onAddComment,
  onResolveComment,
  t,
}: {
  source: string;
  /** Open + resolved comments for this document — filtered/rendered inline by `sectionHeading`. */
  comments?: MarkdownComment[];
  onAddComment?: (sectionHeading: string, body: string) => void | Promise<void>;
  onResolveComment?: (id: string) => void;
  /** Only required when `onAddComment`/`onResolveComment` are passed — labels for the inline composer. */
  t?: Translator;
}) {
  const [composerHeading, setComposerHeading] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const lines = source.split('\n');
  const out: ReactNode[] = [];
  let list: string[] = [];
  let pendingCalloutLabel: string | null = null;

  const flush = (key: number) => {
    if (!list.length) {
      pendingCalloutLabel = null;
      return;
    }
    const variant = pendingCalloutLabel ? CALLOUT_VARIANT[pendingCalloutLabel] : undefined;
    if (variant) {
      const c = colorFor(variant);
      out.push(
        <div
          key={`callout${key}`}
          style={{ background: c.bg, border: `${border.hairline}px solid ${c.border}`, borderRadius: radius.md, padding: spacing.sm, margin: `${spacing.sm}px 0` }}
        >
          <div style={{ fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: c.fg, marginBottom: 4 }}>{pendingCalloutLabel}</div>
          <ul style={{ margin: 0, paddingInlineStart: spacing.lg }}>
            {list.map((li, i) => (
              <li key={i} style={{ fontSize: typography.size.sm, color: c.fg, marginBottom: 2 }}>{li}</li>
            ))}
          </ul>
        </div>,
      );
    } else {
      out.push(
        <ul key={`ul${key}`} style={{ margin: `${spacing.xs}px 0`, paddingInlineStart: spacing.lg }}>
          {list.map((li, i) => (
            <li key={i} style={{ fontSize: typography.size.base, marginBottom: 2 }}>{li}</li>
          ))}
        </ul>,
      );
    }
    list = [];
    pendingCalloutLabel = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) {
      list.push(line.slice(2));
      return;
    }
    flush(i);

    const labelMatch = line.match(/^\*\*(Risks|Assumptions|Source needs)\*\*$/);
    if (labelMatch) {
      pendingCalloutLabel = labelMatch[1]!;
      return;
    }

    if (line.startsWith('### ')) {
      const heading = line.slice(4);
      const headingComments = comments.filter((c) => c.sectionHeading === heading);
      const canComment = Boolean(onAddComment && t);
      out.push(
        <div key={`h3${i}`} style={{ marginTop: spacing.md }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
            <h3 style={{ fontSize: typography.size.base, fontWeight: 600, margin: 0 }}>{heading}</h3>
            {canComment && (
              <button
                onClick={() => {
                  setComposerHeading((prev) => (prev === heading ? null : heading));
                  setDraft('');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.subtle, fontSize: typography.size.xs, textDecoration: 'underline' }}
              >
                {composerHeading === heading ? `− ${t!('pack.comment.cancel')}` : `+ ${t!('pack.comment.add')}`}
              </button>
            )}
          </div>
          {headingComments.map((c) => {
            const cc = colorFor('evidence');
            return (
              <div
                key={c.id}
                style={{
                  background: cc.bg,
                  border: `${border.hairline}px solid ${cc.border}`,
                  borderRadius: radius.md,
                  padding: spacing.sm,
                  margin: `${spacing.xs}px 0`,
                  opacity: c.status === 'resolved' ? 0.55 : 1,
                }}
              >
                <div style={{ fontSize: typography.size.sm, color: cc.fg }}>{c.body}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: cc.fg }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                  {c.status === 'open' && onResolveComment && (
                    <button onClick={() => onResolveComment(c.id)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: cc.fg, textDecoration: 'underline' }}>
                      {t!('pack.comment.resolve')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {composerHeading === heading && onAddComment && t && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, margin: `${spacing.xs}px 0` }}>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('pack.comment.placeholder')}
                rows={2}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  borderRadius: radius.md,
                  border: `${border.hairline}px solid ${palette.line}`,
                  fontSize: typography.size.sm,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              <div>
                <Button
                  onClick={() => {
                    if (!draft.trim()) return;
                    void onAddComment(heading, draft.trim());
                    setComposerHeading(null);
                    setDraft('');
                  }}
                  disabled={!draft.trim()}
                >
                  {t('pack.comment.add')}
                </Button>
              </div>
            </div>
          )}
        </div>,
      );
      return;
    }

    if (line.startsWith('# ')) out.push(<h1 key={i} style={{ fontSize: typography.size.xl, fontWeight: 700, margin: `${spacing.md}px 0 ${spacing.xs}px` }}>{line.slice(2)}</h1>);
    else if (line.startsWith('## ')) out.push(<h2 key={i} style={{ fontSize: typography.size.base, fontWeight: 600, color: palette.subtle, margin: `${spacing.md}px 0 2px` }}>{line.slice(3)}</h2>);
    else if (line.startsWith('> ')) out.push(<blockquote key={i} style={{ borderInlineStart: `2px solid ${palette.line}`, paddingInlineStart: spacing.sm, color: palette.subtle, fontSize: typography.size.sm, margin: `${spacing.sm}px 0` }}>{line.slice(2)}</blockquote>);
    else if (line.length) out.push(<p key={i} style={{ fontSize: typography.size.base, lineHeight: 1.6, margin: `${spacing.xs}px 0` }}>{renderInline(line)}</p>);
  });
  flush(lines.length);
  return <div>{out}</div>;
}

function renderInline(text: string): ReactNode {
  // Bold **x** only — keep it simple and safe.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}
