import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="mx-auto max-w-[1760px] px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
        Equipment rental requests
      </p>
      <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
        The right equipment for your event, production, or project.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
        Browse our rental catalogue and tell us what you need. Our team reviews
        every request and prepares a custom quote.
      </p>
      <Link
        className="mt-8 inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-white"
        href="/rentals"
      >
        Browse rentals
      </Link>
    </section>
  );
}
