import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { CatalogueQueryState } from '@/lib/catalogue-query';
import { catalogueHref } from '@/lib/catalogue-query';

function visiblePages(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from(
    { length: Math.max(0, end - start + 1) },
    (_, index) => Math.max(1, start) + index,
  );
}

export function CataloguePagination({
  basePath,
  state,
  totalPages,
}: {
  basePath: string;
  state: CatalogueQueryState;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const linkClass =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  return (
    <nav
      aria-label="Catalogue pagination"
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {state.page > 1 ? (
        <Link
          aria-label="Previous catalogue page"
          className={linkClass}
          href={catalogueHref(basePath, state, state.page - 1)}
          rel="prev"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
        </Link>
      ) : (
        <span aria-disabled="true" className={`${linkClass} opacity-45`}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Previous catalogue page unavailable</span>
        </span>
      )}
      {visiblePages(state.page, totalPages).map((page) =>
        page === state.page ? (
          <span
            aria-current="page"
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
            key={page}
          >
            <span className="sr-only">Page </span>
            {page}
          </span>
        ) : (
          <Link
            aria-label={`Go to catalogue page ${page}`}
            className={linkClass}
            href={catalogueHref(basePath, state, page)}
            key={page}
          >
            {page}
          </Link>
        ),
      )}
      {state.page < totalPages ? (
        <Link
          aria-label="Next catalogue page"
          className={linkClass}
          href={catalogueHref(basePath, state, state.page + 1)}
          rel="next"
        >
          <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-disabled="true" className={`${linkClass} opacity-45`}>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Next catalogue page unavailable</span>
        </span>
      )}
    </nav>
  );
}
