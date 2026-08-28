import { Info } from 'lucide-react';
import Link from 'next/link';

export function PublicFeatureUnavailable({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Info aria-hidden="true" className="h-8 w-8 text-primary" />
        <h1 className="mt-5 text-3xl font-bold tracking-tight">
          {title} is currently unavailable
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          This service is not currently available online. You can still browse
          the complete rental catalogue.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          href="/rentals"
        >
          Browse rental equipment
        </Link>
      </div>
    </section>
  );
}
