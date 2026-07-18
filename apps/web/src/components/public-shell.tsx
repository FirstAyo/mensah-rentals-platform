import { ThemeToggle } from '@mensah-rentals/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1760px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link className="text-xl font-bold" href="/">
            Mensah Rentals
          </Link>
          <div className="flex items-center gap-4">
            <nav aria-label="Primary navigation">
              <Link
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
                href="/rentals"
              >
                Rentals
              </Link>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="mt-16 border-t border-border">
        <div className="mx-auto max-w-[1760px] px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Mensah Rentals &amp; Services — equipment rental requests for events,
          productions, and projects.
        </div>
      </footer>
    </div>
  );
}
