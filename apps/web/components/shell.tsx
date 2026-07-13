'use client';

/**
 * Premium flat 2D application shell: a sidebar of the workspace pipeline, a top
 * bar with project + market + language switchers. Chat is intentionally NOT the
 * primary surface — the pipeline is.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { spacing, radius, border, typography, colorFor } from '@signalkit/ui';
import { SUPPORTED_LOCALES, type LocaleCode } from '@signalkit/i18n';
import { useI18n } from '../lib/i18n';
import { NAV } from '../lib/nav-config';
import { palette } from './ui';

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

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav
      className={`app-sidebar${open ? ' is-open' : ''}`}
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
        const active = item.href === '/signalkit' ? pathname === '/signalkit' : pathname.startsWith(item.href);
        const accent = colorFor('opportunity');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderRadius: radius.md,
              borderInlineStart: `3px solid ${active ? accent.border : 'transparent'}`,
              fontSize: typography.size.sm,
              fontWeight: active ? typography.weight.semibold : typography.weight.regular,
              color: active ? palette.ink : palette.subtle,
              background: active ? accent.bg : 'transparent',
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

function Hamburger({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      onClick={onClick}
      className="app-hamburger"
      style={{
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        flexShrink: 0,
        borderRadius: radius.md,
        border: `${border.hairline}px solid ${palette.line}`,
        background: palette.surface,
        color: palette.ink,
        fontSize: typography.size.lg,
        cursor: 'pointer',
      }}
    >
      {open ? '✕' : '☰'}
    </button>
  );
}

function TopBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <header
      className="app-topbar"
      style={{
        minHeight: 56,
        flexShrink: 0,
        borderBottom: `${border.hairline}px solid ${palette.line}`,
        background: palette.surface,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        padding: `${spacing.sm}px ${spacing.xl}px`,
        gap: spacing.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, minWidth: 0 }}>
        <Hamburger open={open} onClick={onToggle} />
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap', minWidth: 0 }}>
          <ProjectSwitcher />
          <MarketSelector />
        </div>
      </div>
      <LanguageSwitcher />
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // No token stored for THIS origin (localStorage is origin-scoped — a token
  // saved while testing another domain/port does not carry over) → every
  // fetch in every product page would 401 and show a generic error. Send the
  // user to sign in immediately instead of rendering a broken dashboard.
  useEffect(() => {
    const token = window.localStorage.getItem('signalkit_token');
    if (!token) router.replace('/login');
  }, [router]);

  // Close the off-canvas sidebar whenever the route changes so back/forward
  // navigation and deep links never leave it stuck open on mobile.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', background: palette.canvas }}>
      <div
        className={`app-sidebar-backdrop${sidebarOpen ? ' is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
        <main className="app-main" style={{ flex: 1, padding: spacing['2xl'], maxWidth: 1200, width: '100%' }}>{children}</main>
      </div>
    </div>
  );
}
