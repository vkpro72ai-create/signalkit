'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { spacing, typography, radius, border } from '@signalkit/ui';
import { Button, Card, palette } from '../../components/ui';
import { LanguageSwitcher } from '../../components/shell';
import { useT } from '../../lib/i18n';
import { API_BASE } from '../../lib/api';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('auth_failed');
      const data = (await res.json()) as { accessToken: string };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('signalkit_token', data.accessToken);
      }
      router.push('/signalkit');
    } catch {
      setError(t('state.error.body'));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `${border.hairline}px solid ${palette.line}`,
    fontSize: typography.size.sm,
    width: '100%',
  } as const;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette.canvas,
        padding: spacing.xl,
      }}
    >
      <Card style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <strong style={{ fontSize: typography.size.lg }}>{t('app.name')}</strong>
          <LanguageSwitcher />
        </div>
        <h1 style={{ fontSize: typography.size.xl, margin: 0 }}>{t('auth.login.title')}</h1>
        <p style={{ color: palette.subtle, marginTop: spacing.xs }}>{t('auth.login.subtitle')}</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.lg }}>
          <label style={{ fontSize: typography.size.sm }}>
            {t('auth.email')}
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label style={{ fontSize: typography.size.sm }}>
            {t('auth.password')}
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <span style={{ color: '#6A1B1B', fontSize: typography.size.sm }}>{error}</span> : null}
          <Button type="submit" disabled={busy}>
            {t('action.signIn')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
