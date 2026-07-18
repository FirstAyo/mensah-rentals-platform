import Link from 'next/link';
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
        className="mt-8 inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-white"
        href="/rentals"
      >
        Return to rentals
      </Link>
    </section>
  );
}
