import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@mensah-rentals/ui';
import { PublicShell } from '@/components/public-shell';
import { indexingEnabled, siteOrigin } from '@/lib/site-config';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  description:
    'Browse equipment for events, productions, and projects, then request a custom rental quote from Mensah Rentals.',
  title: { default: 'Mensah Rentals', template: '%s | Mensah Rentals' },
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: 'Mensah Rentals', url: '/' },
  twitter: { card: 'summary' },
  robots: indexingEnabled()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <PublicShell>{children}</PublicShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
