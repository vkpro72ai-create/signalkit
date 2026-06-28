'use client';

/**
 * Premium flat 2D application shell: a sidebar of the workspace pipeline, a top
 * bar with project + market + language switchers. Chat is intentionally NOT the
 * primary surface — the pipeline is.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { spacing, radius, border, typography } from '@signalkit/ui';
import { SUPPORTED_LOCALES, type LocaleCode } from '@signalkit/i18n';
import { useI18n } from '../lib/i18n';
import { palette } from './ui';
import type { MessageKey } from '@signalkit/i18n';

const NAV: { href: Route; key: MessageKey }[] = [
  { href: '/projects', key: 'nav.projects' },
  { href: '/niches', key: 'nav.niches' },
  { href: '/sources', key: 'nav.sources' },
  { href: '/pack', key: 'nav.pack' },
  { href: '/exports', key: 'nav.exports' },
  { href: '/settings/language', key: 'nav.settings' },
  { href: '/design-system', key: 'nav.designSystem' },
];

const LOCALE_LABEL: Record<LocaleCode, string> = {
  en: 'English',
  ru: 'Русский',
  tr: 'Türkçe',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  ar: 'العربية',
  hi: 'हिन्दी',
  id: 'Bahasa',
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => setLocale(e.target.value as LocaleCode)}
      style={{
        padding: `${spacing.xs}px ${spacing.sm}px`,
        borderRadius: radius.md,
        border: `${border.hairline}px solid ${palette.line}`,
        background: palette.surface,
        color: palette.ink,
        fontSize: typography.size.sm,
      }}
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABEL[l]}
        </option>
      ))}
    </select>
  );
}

export function ProjectSwitcher({ projectName }: { projectName?: string }) {
  return (
    <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>
      {projectName ?? '—'}
    </span>
  );
}

export function MarketSelector({ market }: { market?: string }) {
  const { t } = useI18n();
  return (
    <span style={{ color: palette.subtle, fontSize: typography.size.sm }}>
      {t('label.market')}: {market ?? t('market.global')}
    </span>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav
      style={{
        width: 248,
        flexShrink: 0,
        borderInlineEnd: `${border.hairline}px solid ${palette.line}`,
        background: palette.surface,
        padding: spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
      }}
    >
      <div style={{ fontSize: typography.size.lg, fontWeight: typography.weight.bold, padding: `${spacing.sm}px ${spacing.sm}px ${spacing.lg}px` }}>
        {t('app.name')}
      </div>
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderRadius: radius.md,
              fontSize: typography.size.sm,
              fontWeight: active ? typography.weight.semibold : typography.weight.regular,
              color: active ? palette.ink : palette.subtle,
              background: active ? palette.canvas : 'transparent',
              textDecoration: 'none',
            }}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}

function TopBar() {
  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        borderBottom: `${border.hairline}px solid ${palette.line}`,
        background: palette.surface,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${spacing.xl}px`,
        gap: spacing.lg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        <ProjectSwitcher />
        <MarketSelector />
      </div>
      <LanguageSwitcher />
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: palette.canvas }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar />
        <main style={{ flex: 1, padding: spacing['2xl'], maxWidth: 1200, width: '100%' }}>{children}</main>
      </div>
    </div>
  );
}
