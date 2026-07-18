import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@mensah-rentals/ui';

import './globals.css';

export const metadata: Metadata = {
  description:
    'Secure staff access for the Mensah Rentals administration platform.',
  title: 'Mensah Rentals Admin',
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
