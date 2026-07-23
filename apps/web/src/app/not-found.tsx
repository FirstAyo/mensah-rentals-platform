import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
export default function NotFound() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">
        404
      </p>
      <h1 className="mt-3 text-4xl font-bold">We could not find that page.</h1>
      <p className="mt-4 text-muted-foreground">
        The catalogue item may be unavailable or the address may have changed.
      </p>
      <Link
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        href="/rentals"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Return to rentals
      </Link>
    </section>
  );
}
