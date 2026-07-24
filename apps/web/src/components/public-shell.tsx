import { ThemeToggle } from '@mensah-rentals/ui';
import { ArrowRight, Menu, PackageOpen } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CartHeaderLink } from './cart-header-link';

const navLink =
  'rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-3 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
        href="#main-content"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex min-h-16 max-w-[1760px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            className="inline-flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <PackageOpen aria-hidden="true" className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-bold leading-tight sm:text-lg">
                Mensah Rentals
              </span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Equipment for projects that matter
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <nav
              aria-label="Primary navigation"
              className="hidden items-center md:flex"
            >
              <Link className={navLink} href="/#how-it-works">
                How it works
              </Link>
              <Link className={navLink} href="/rentals">
                Rentals
              </Link>
              <Link className={navLink} href="/track-request">
                Track request
              </Link>
            </nav>
            <ThemeToggle />
            <CartHeaderLink />
            <Link
              className="hidden min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-flex"
              href="/rentals"
            >
              Browse equipment
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              aria-label="Open rental catalogue"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              href="/rentals"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="mt-20 border-t border-border bg-card">
        <div className="mx-auto grid max-w-[1760px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <p className="font-semibold text-foreground">
              Mensah Rentals &amp; Services
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Equipment rental requests for events, productions, and projects.
              Our team reviews every request before confirming a custom quote.
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-2 md:justify-end"
          >
            <Link className={navLink} href="/">
              Home
            </Link>
            <Link className={navLink} href="/rentals">
              Rental catalogue
            </Link>
            <Link className={navLink} href="/track-request">
              Track request
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
