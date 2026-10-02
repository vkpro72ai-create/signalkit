import './globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { isRtl, DEFAULT_LOCALE } from '@signalkit/i18n';
import { I18nProvider } from '../lib/i18n';

export const metadata = {
  title: 'SignalKit',
  description:
    'Evidence-backed market opportunity discovery and build-ready Product Document Packs.',
};

// Without this, mobile browsers render the layout at a virtual ~980px
// desktop width and zoom out — every page becomes unusably tiny on a phone.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
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
