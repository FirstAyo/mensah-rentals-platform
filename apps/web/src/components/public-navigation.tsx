'use client';

import { ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { PublicNavigationCategory } from '@/lib/public-navigation';

const linkClass =
  'rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring';

export function DesktopNavigation({
  categories,
}: {
  categories: PublicNavigationCategory[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <nav
      aria-label="Primary navigation"
      className="hidden items-center lg:flex"
    >
      <div
        className="static"
        ref={root}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          aria-controls="rentals-mega-menu"
          aria-expanded={open}
          className={`${linkClass} inline-flex items-center gap-1`}
          onClick={() => setOpen((value) => !value)}
          ref={trigger}
          type="button"
        >
          Rentals{' '}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {open ? (
          <div
            className="absolute left-0 right-0 top-full border-y border-border bg-background/98 shadow-xl backdrop-blur"
            id="rentals-mega-menu"
          >
            <div className="mx-auto grid max-w-[1760px] gap-6 px-6 py-7 lg:grid-cols-[14rem_1fr] lg:px-8">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
                  Rental catalogue
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Browse equipment by category. Submit a request and our team
                  will prepare a custom quote.
                </p>
                <Link
                  className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary"
                  href="/rentals"
                  onClick={() => setOpen(false)}
                >
                  View All Rentals
                </Link>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      className="group flex min-h-20 gap-3 rounded-xl border border-transparent p-2 outline-none hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      href={`/rentals/${category.slug}`}
                      onClick={() => setOpen(false)}
                    >
                      {category.image ? (
                        <span
                          aria-hidden="true"
                          className="h-16 w-20 shrink-0 rounded-lg bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${category.image.url})`,
                            backgroundPosition: category.image.focalPoint,
                          }}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="h-16 w-20 shrink-0 rounded-lg bg-primary/10"
                        />
                      )}
                      <span className="py-1">
                        <span className="block font-semibold">
                          {category.name}
                        </span>
                        {category.description ? (
                          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                            {category.description}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
      <Link className={linkClass} href="/gallery">
        Gallery
      </Link>
      <Link className={linkClass} href="/#how-it-works">
        How it works
      </Link>
      <Link className={linkClass} href="/about">
        About
      </Link>
      <Link className={linkClass} href="/contact">
        Contact
      </Link>
    </nav>
  );
}

export function MobileNavigation({
  categories,
  showTracking,
}: {
  categories: PublicNavigationCategory[];
  showTracking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="relative lg:hidden">
      <button
        aria-controls="mobile-primary-menu"
        aria-expanded={open}
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        {open ? (
          <X aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Menu aria-hidden="true" className="h-5 w-5" />
        )}
      </button>
      {open ? (
        <nav
          aria-label="Mobile navigation"
          className="absolute right-0 top-12 z-50 max-h-[calc(100dvh-5rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-xl"
          id="mobile-primary-menu"
        >
          <details className="group">
            <summary
              className={`${linkClass} flex min-h-11 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden`}
            >
              Rentals{' '}
              <ChevronDown
                aria-hidden="true"
                className="h-4 w-4 transition group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="grid gap-1 border-l border-border py-1 pl-3">
              <Link className={linkClass} href="/rentals" onClick={close}>
                All equipment
              </Link>
              {categories.map((category) => (
                <Link
                  className={linkClass}
                  href={`/rentals/${category.slug}`}
                  key={category.slug}
                  onClick={close}
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </details>
          <Link
            className={`${linkClass} block min-h-11`}
            href="/gallery"
            onClick={close}
          >
            Gallery
          </Link>
          <Link
            className={`${linkClass} block min-h-11`}
            href="/#how-it-works"
            onClick={close}
          >
            How it works
          </Link>
          <Link
            className={`${linkClass} block min-h-11`}
            href="/about"
            onClick={close}
          >
            About
          </Link>
          <Link
            className={`${linkClass} block min-h-11`}
            href="/contact"
            onClick={close}
          >
            Contact
          </Link>
          {showTracking ? (
            <Link
              className={`${linkClass} block min-h-11`}
              href="/track-request"
              onClick={close}
            >
              Track request
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
