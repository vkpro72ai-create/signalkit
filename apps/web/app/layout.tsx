import './globals.css';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { isRtl } from '@signalkit/i18n';
import { I18nProvider, readLocaleFromCookie } from '../lib/i18n';

export const metadata = {
  title: 'SignalKit',
  description:
    'Evidence-backed market opportunity discovery and build-ready Product Document Packs.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Server-side: read the persisted locale so the first paint has correct lang/dir.
  const cookieStore = await cookies();
  const locale = readLocaleFromCookie(cookieStore.toString());

  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
