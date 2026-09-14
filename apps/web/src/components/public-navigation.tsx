'use client';

import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import type { MutableRefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { PublicNavigationCategory } from '@/lib/public-navigation';

const linkClass =
  'rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring';

const OPEN_DELAY_MS = 140;
const CLOSE_DELAY_MS = 240;
const EXIT_DURATION_MS = 150;

function clearPendingTimer(
  timer: MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (timer.current) clearTimeout(timer.current);
  timer.current = null;
}

export function DesktopNavigation({
  categories,
}: {
  categories: PublicNavigationCategory[];
}) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealFrame = useRef<number | null>(null);

  const cancelRevealFrame = () => {
    if (revealFrame.current !== null)
      window.cancelAnimationFrame(revealFrame.current);
    revealFrame.current = null;
  };

  const cancelClose = () => {
    clearPendingTimer(closeTimer);
    clearPendingTimer(exitTimer);
    if (rendered && !open) setOpen(true);
  };
  const reveal = () => {
    clearPendingTimer(openTimer);
    cancelClose();
    cancelRevealFrame();
    setRendered(true);
    revealFrame.current = window.requestAnimationFrame(() => {
      revealFrame.current = null;
      setOpen(true);
    });
  };
  const scheduleOpen = () => {
    cancelClose();
    if (open || openTimer.current) return;
    openTimer.current = setTimeout(reveal, OPEN_DELAY_MS);
  };
  const finishClose = () => {
    cancelRevealFrame();
    setOpen(false);
    clearPendingTimer(exitTimer);
    exitTimer.current = setTimeout(() => setRendered(false), EXIT_DURATION_MS);
  };
  const scheduleClose = () => {
    clearPendingTimer(openTimer);
    clearPendingTimer(closeTimer);
    closeTimer.current = setTimeout(finishClose, CLOSE_DELAY_MS);
  };
  const closeNow = () => {
    clearPendingTimer(openTimer);
    clearPendingTimer(closeTimer);
    finishClose();
  };

  useEffect(() => {
    if (!rendered) return;
    const closeFromDocument = () => {
      clearPendingTimer(openTimer);
      clearPendingTimer(closeTimer);
      setOpen(false);
      clearPendingTimer(exitTimer);
      exitTimer.current = setTimeout(
        () => setRendered(false),
        EXIT_DURATION_MS,
      );
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) closeFromDocument();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFromDocument();
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [rendered]);

  useEffect(
    () => () => {
      clearPendingTimer(openTimer);
      clearPendingTimer(closeTimer);
      clearPendingTimer(exitTimer);
      cancelRevealFrame();
    },
    [],
  );

  return (
    <nav
      aria-label="Primary navigation"
      className="hidden items-center lg:flex"
    >
      <div
        className="static flex min-h-16 items-center"
        ref={root}
        onBlurCapture={(event) => {
          if (!root.current?.contains(event.relatedTarget as Node | null))
            scheduleClose();
        }}
        onFocusCapture={cancelClose}
        onPointerEnter={scheduleOpen}
        onPointerLeave={scheduleClose}
      >
        <button
          aria-controls="rentals-mega-menu"
          aria-expanded={open}
          className={`${linkClass} inline-flex items-center gap-1`}
          onClick={() => (open ? closeNow() : reveal())}
          ref={trigger}
          type="button"
        >
          Rentals{' '}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {rendered ? (
          <div
            aria-hidden={!open}
            className={`absolute left-0 right-0 top-[calc(100%-1px)] z-50 border-t border-border/80 bg-background/95 px-3 pb-4 pt-3 shadow-[0_24px_55px_-30px_hsl(var(--foreground)/0.45)] backdrop-blur-sm transition-[opacity,transform] motion-reduce:transform-none motion-reduce:transition-opacity ${
              open
                ? 'translate-y-0 scale-100 opacity-100 duration-200 ease-out'
                : '-translate-y-2 scale-[0.99] opacity-0 duration-150 ease-in'
            }`}
            id="rentals-mega-menu"
            inert={!open}
            data-state={open ? 'open' : 'closed'}
          >
            <div className="public-container" data-mega-menu-content="true">
              <div className="grid gap-7 rounded-b-3xl rounded-t-xl border border-border bg-card p-6 shadow-2xl lg:grid-cols-[13rem_1fr] lg:p-7">
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
                    onClick={closeNow}
                  >
                    View All Rentals
                    <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                  </Link>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Link
                        className="group flex min-h-20 gap-3 rounded-xl border border-border/60 bg-background/70 p-2 outline-none transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
                        href={`/rentals/${category.slug}`}
                        onClick={closeNow}
                      >
                        {category.image ? (
                          <span
                            aria-hidden="true"
                            className="h-16 w-20 shrink-0 rounded-lg bg-cover bg-center transition duration-200 group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
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
                View All Rentals
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
