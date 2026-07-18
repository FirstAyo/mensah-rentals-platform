import Link from 'next/link';
export default function ForbiddenPage() {
  return (
    <section className="rounded-2xl border border-border bg-card p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">
        Access denied
      </p>
      <h1 className="mt-2 text-3xl font-semibold">
        You do not have permission to view this page.
      </h1>
      <Link
        className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-white"
        href="/"
      >
        Return to dashboard
      </Link>
    </section>
  );
}
