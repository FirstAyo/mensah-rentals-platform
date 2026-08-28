import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@mensah-rentals/ui';
import { PublicShell } from '@/components/public-shell';
import { AppProviders } from '@/components/app-providers';
import { indexingEnabled, siteOrigin } from '@/lib/site-config';
import { getPublicFeatures } from '@/lib/public-features';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  description:
    'Browse equipment for events, productions, and projects, then request a custom rental quote from Mensah Rentals.',
  title: { default: 'Mensah Rentals', template: '%s | Mensah Rentals' },
  openGraph: { type: 'website', siteName: 'Mensah Rentals' },
  twitter: { card: 'summary' },
  robots: indexingEnabled()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const features = await getPublicFeatures();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppProviders>
            <PublicShell features={features}>{children}</PublicShell>
          </AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
