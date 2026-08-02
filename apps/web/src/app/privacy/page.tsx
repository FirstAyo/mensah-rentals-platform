import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How Mensah Rentals handles information on its website, including Google Maps review content.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
        Website information
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Privacy policy</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: August 1, 2026
      </p>
      <div className="prose prose-slate mt-10 max-w-none dark:prose-invert">
        <p>
          This page explains the website&apos;s current technical handling of
          information. It is a practical disclosure and should be reviewed by
          Mensah Rentals and its legal adviser before production launch.
        </p>
        <h2>Rental requests</h2>
        <p>
          Information submitted for a rental request is used to review the
          request, communicate with the customer, prepare quotes, and operate an
          accepted rental. Private request and document access uses secure,
          request-scoped browser capabilities.
        </p>
        <h2>Google Maps review content</h2>
        <p>
          When enabled, the homepage retrieves current business ratings and
          reviews from Google Maps Platform through the Mensah Rentals server.
          The website does not permanently store the returned review text,
          reviewer names, profile links, photographs, ratings, or dates.
        </p>
        <p>
          Reviewer profile photographs are loaded from Google&apos;s servers
          when displayed, so Google may receive ordinary connection information
          such as an IP address and browser request details. Google&apos;s
          handling of that information is described in the{' '}
          <a
            href="https://policies.google.com/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Privacy Policy
          </a>
          .
        </p>
        <h2>Questions</h2>
        <p>
          Contact Mensah Rentals through its published business contact channel
          with questions about this website or a rental request.
        </p>
      </div>
    </article>
  );
}
