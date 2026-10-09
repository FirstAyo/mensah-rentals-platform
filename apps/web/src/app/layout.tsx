import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@mensah-rentals/ui';
import { PublicShell } from '@/components/public-shell';
import { AppProviders } from '@/components/app-providers';
import { indexingEnabled, siteOrigin } from '@/lib/site-config';
import { getPublicFeatures } from '@/lib/public-features';
import { getPublicNavigationCategories } from '@/lib/public-navigation';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  description:
    'Browse equipment for events, productions, and projects, then send an enquiry to Mensah Rentals.',
  title: { default: 'Mensah Rentals', template: '%s | Mensah Rentals' },
  openGraph: { type: 'website', siteName: 'Mensah Rentals' },
  twitter: { card: 'summary' },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon-32.png', type: 'image/png', sizes: '32x32' },
      {
        url: '/brand/symbol-light.png',
        type: 'image/png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/brand/symbol-dark.png',
        type: 'image/png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: [
      {
        url: '/brand/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  robots: indexingEnabled()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [features, rentalCategories] = await Promise.all([
    getPublicFeatures(),
    getPublicNavigationCategories(),
  ]);
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppProviders>
            <PublicShell
              features={features}
              rentalCategories={rentalCategories}
            >
              {children}
            </PublicShell>
          </AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
