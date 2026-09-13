import { ThemeToggle } from '@mensah-rentals/ui';
import { ArrowRight, PackageOpen } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PublicPlatformCapabilitiesResponse } from '@mensah-rentals/types';
import { CartHeaderLink } from './cart-header-link';
import { DesktopNavigation, MobileNavigation } from './public-navigation';
import type { PublicNavigationCategory } from '@/lib/public-navigation';

const navLink =
  'rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring';

export function PublicShell({
  children,
  features = {
    cartSubmissionsAvailable: true,
    customerOrderPortal: false,
    customerSubmissionMode: 'EMAIL_INQUIRY',
    rentalRequests: false,
  },
  rentalCategories = [],
}: {
  children: ReactNode;
  features?: PublicPlatformCapabilitiesResponse;
  rentalCategories?: PublicNavigationCategory[];
}) {
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
            <DesktopNavigation categories={rentalCategories} />
            <ThemeToggle />
            {features.cartSubmissionsAvailable ? <CartHeaderLink /> : null}
            <Link
              className="hidden min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-flex"
              href="/rentals"
            >
              Browse equipment
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <MobileNavigation
              categories={rentalCategories}
              showTracking={features.rentalRequests}
            />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="mt-20 border-t border-border bg-card">
        <div className="mx-auto grid max-w-[1760px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_.8fr] lg:px-8">
          <div>
            <p className="font-semibold text-foreground">
              Mensah Rentals &amp; Services
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Equipment rental requests for events, productions, and projects.
              Our team reviews every request before confirming a custom quote.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <nav
              aria-label="Company links"
              className="grid content-start gap-1"
            >
              <p className="mb-2 text-sm font-semibold">Company</p>
              <Link className={navLink} href="/about">
                About
              </Link>
              <Link className={navLink} href="/contact">
                Contact
              </Link>
              <Link className={navLink} href="/rentals">
                Rentals
              </Link>
              <Link className={navLink} href="/gallery">
                Gallery
              </Link>
              {features.rentalRequests ? (
                <Link className={navLink} href="/track-request">
                  Track request
                </Link>
              ) : null}
            </nav>
            <nav aria-label="Legal links" className="grid content-start gap-1">
              <p className="mb-2 text-sm font-semibold">Legal</p>
              <Link className={navLink} href="/privacy">
                Privacy
              </Link>
              <Link className={navLink} href="/terms">
                Terms
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
