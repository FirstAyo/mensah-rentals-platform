import { ThemeToggle } from '@mensah-rentals/ui';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
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
        <div className="public-container flex min-h-16 items-center justify-between gap-4">
          <Link
            className="inline-flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/"
          >
            <span className="sr-only">Mensah Rentals home</span>
            <Image
              alt=""
              aria-hidden="true"
              className="h-auto w-36 dark:hidden sm:w-44"
              height={222}
              priority
              src="/brand/logo-light.png"
              width={671}
            />
            <Image
              alt=""
              aria-hidden="true"
              className="hidden h-auto w-36 dark:block sm:w-44"
              height={222}
              priority
              src="/brand/logo-dark.png"
              width={671}
            />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <DesktopNavigation
              categories={rentalCategories}
              submissionMode={features.customerSubmissionMode}
            />
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
        <div className="public-container grid gap-10 py-12 md:grid-cols-[1.2fr_.8fr]">
          <div>
            <Image
              alt="Mensah Rentals and Services"
              className="h-auto w-56 dark:hidden"
              height={222}
              src="/brand/logo-light.png"
              width={671}
            />
            <Image
              alt="Mensah Rentals and Services"
              className="hidden h-auto w-56 dark:block"
              height={222}
              src="/brand/logo-dark.png"
              width={671}
            />
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Equipment rentals for events, productions, and projects. Build
              your equipment list and send an enquiry for staff review.
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
