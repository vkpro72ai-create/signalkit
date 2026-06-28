'use client';

/** Minimal, flat Markdown renderer (headings, bullets, blockquote, paragraphs). No gradients. */
import { spacing, typography } from '@signalkit/ui';
import { palette } from './ui';

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = (key: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul${key}`} style={{ margin: `${spacing.xs}px 0`, paddingInlineStart: spacing.lg }}>
          {list.map((li, i) => (
            <li key={i} style={{ fontSize: typography.size.sm, marginBottom: 2 }}>{li}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) {
      list.push(line.slice(2));
      return;
    }
    flush(i);
    if (line.startsWith('# ')) out.push(<h1 key={i} style={{ fontSize: typography.size.xl, fontWeight: 700, margin: `${spacing.md}px 0 ${spacing.xs}px` }}>{line.slice(2)}</h1>);
    else if (line.startsWith('## ')) out.push(<h2 key={i} style={{ fontSize: typography.size.base, fontWeight: 600, color: palette.subtle, margin: `${spacing.md}px 0 2px` }}>{line.slice(3)}</h2>);
    else if (line.startsWith('> ')) out.push(<blockquote key={i} style={{ borderInlineStart: `2px solid ${palette.line}`, paddingInlineStart: spacing.sm, color: palette.subtle, fontSize: typography.size.xs, margin: `${spacing.sm}px 0` }}>{line.slice(2)}</blockquote>);
    else if (line.length) out.push(<p key={i} style={{ fontSize: typography.size.sm, margin: `${spacing.xs}px 0` }}>{renderInline(line)}</p>);
  });
  flush(lines.length);
  return <div>{out}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Bold **x** only — keep it simple and safe.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}
