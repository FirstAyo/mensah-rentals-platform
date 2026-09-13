import { ImageOff } from 'lucide-react';
import Link from 'next/link';

export function GalleryUnavailable({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-3xl border border-dashed border-border bg-card text-center ${compact ? 'p-7' : 'p-10 sm:p-14'}`}
      role="status"
    >
      <ImageOff aria-hidden="true" className="mx-auto h-9 w-9 text-primary" />
      <h2 className="mt-4 text-xl font-semibold">
        Gallery temporarily unavailable
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Our project photographs could not be loaded right now. You can still
        explore the rental catalogue.
      </p>
      <Link
        className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href="/rentals"
      >
        Browse rentals
      </Link>
    </div>
  );
}
