import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@mensah-rentals/ui';

import { Providers } from './providers';

import './globals.css';

export const metadata: Metadata = {
  description:
    'Secure staff access for the Mensah Rentals administration platform.',
  title: 'Mensah Rentals Admin',
  icons: {
    icon: [
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
  },
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
