import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, isRtl } from '@signalkit/i18n';

export const metadata = {
  title: 'SignalKit',
  description:
    'Evidence-backed market opportunity discovery and build-ready Product Document Packs.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const locale = DEFAULT_LOCALE;
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <body
        style={{
          margin: 0,
          fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          // Flat 2D: solid background, no gradients.
          background: '#FBFCFD',
          color: '#1B1F24',
        }}
      >
        {children}
      </body>
    </html>
  );
}
