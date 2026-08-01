'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { AccessibleDialog } from './accessible-dialog';

export function MobileAdminNavigation({
  links,
}: {
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium lg:hidden"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <Menu aria-hidden="true" className="h-4 w-4" /> Menu
      </button>
      <AccessibleDialog
        descriptionId="mobile-admin-navigation-description"
        initialFocusRef={firstLinkRef}
        onClose={() => setOpen(false)}
        open={open}
        returnFocusRef={triggerRef}
        titleId="mobile-admin-navigation-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div>
            <h2
              className="text-lg font-semibold"
              id="mobile-admin-navigation-title"
            >
              Administration
            </h2>
            <p
              className="mt-1 text-sm text-muted-foreground"
              id="mobile-admin-navigation-description"
            >
              Choose an administrative section.
            </p>
          </div>
          <button
            aria-label="Close administration menu"
            className="grid h-11 w-11 place-items-center rounded-lg border border-border"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <nav
          aria-label="Mobile administrative sections"
          className="max-h-[70dvh] space-y-1 overflow-y-auto p-4"
        >
          {links.map((link, index) => (
            <Link
              className="block min-h-11 rounded-lg px-3 py-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              href={link.href}
              key={link.href}
              onClick={() => setOpen(false)}
              ref={index === 0 ? firstLinkRef : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </AccessibleDialog>
    </>
  );
}
