import './globals.css';
import type { ReactNode } from 'react';
import { isRtl, DEFAULT_LOCALE } from '@signalkit/i18n';
import { I18nProvider } from '../lib/i18n';

export const metadata = {
  title: 'SignalKit',
  description:
    'Evidence-backed market opportunity discovery and build-ready Product Document Packs.',
};

// Static-export-compatible: no server-side cookies() call.
// I18nProvider reads the locale cookie on the client after hydration.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} dir={isRtl(DEFAULT_LOCALE) ? 'rtl' : 'ltr'}>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
