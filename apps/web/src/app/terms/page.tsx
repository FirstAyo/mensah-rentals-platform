import type { Metadata } from 'next';
import { publicPageRobots } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'Website terms for the Mensah Rentals rental-request platform and Google Maps content.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of use | Mensah Rentals',
    description:
      'Website terms for the Mensah Rentals rental-request platform and third-party content.',
    url: '/terms',
  },
  twitter: {
    card: 'summary',
    title: 'Terms of use | Mensah Rentals',
    description:
      'Website terms for the Mensah Rentals rental-request platform and third-party content.',
  },
  robots: publicPageRobots(),
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
        Website information
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Terms of use</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: August 1, 2026
      </p>
      <div className="prose prose-slate mt-10 max-w-none dark:prose-invert">
        <p>
          These basic terms describe the website&apos;s current purpose. They do
          not replace rental-specific terms supplied with a quote or order and
          should be reviewed by Mensah Rentals and its legal adviser before
          production launch.
        </p>
        <h2>Rental-request platform</h2>
        <p>
          Adding equipment to a cart or submitting a request does not confirm
          availability, reserve inventory, create an order, or establish a final
          price. Mensah Rentals reviews requests and may later issue a custom
          quote.
        </p>
        <h2>Google Maps content</h2>
        <p>
          Ratings, review text, reviewer attribution, and source links marked as
          Google Maps content are supplied by Google, not written or verified by
          Mensah Rentals. Their display and use are also subject to the{' '}
          <a
            href="https://policies.google.com/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Terms of Service
          </a>{' '}
          and applicable{' '}
          <a
            href="https://developers.google.com/maps/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Maps Platform terms
          </a>
          . Individual reviews link to their source on Google Maps.
        </p>
        <h2>Acceptable use</h2>
        <p>
          Do not misuse the website, attempt to bypass access controls, or use
          automated traffic to disrupt the service or create avoidable third-
          party API costs.
        </p>
      </div>
    </article>
  );
}
