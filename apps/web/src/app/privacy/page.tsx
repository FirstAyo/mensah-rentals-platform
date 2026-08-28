import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { companyPageJsonLd, serializeJsonLd } from '@/lib/structured-data';

const description =
  'How Mensah Rentals & Services handles information submitted through contact enquiries, rental requests, quotes, orders, and this website.';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description,
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy | Mensah Rentals',
    description,
    url: '/privacy',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | Mensah Rentals',
    description,
  },
  robots: publicPageRobots(),
};

export default function PrivacyPage() {
  const origin = siteOrigin();
  const crumbs = [{ href: '/', label: 'Home' }, { label: 'Privacy' }];
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(origin, '/privacy', 'Privacy Policy'),
          ),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbJsonLd(crumbs, origin)),
        }}
        type="application/ld+json"
      />
      <section className="border-b border-border bg-muted/35">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
          <Breadcrumbs items={crumbs} />
          <p className="mt-9 text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
            Privacy information
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Privacy policy
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: August 28, 2026
          </p>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            This policy describes the platform&apos;s current handling of
            information. It should be reviewed by Mensah Rentals and qualified
            privacy counsel before production launch.
          </p>
        </div>
      </section>
      <article className="prose prose-slate mx-auto max-w-5xl px-4 py-12 prose-headings:scroll-mt-24 dark:prose-invert sm:px-6 lg:py-16">
        <h2>Who operates this website</h2>
        <p>
          Mensah Rentals &amp; Services Inc. operates this equipment
          rental-request platform. The business can be contacted through the{' '}
          <Link href="/contact">contact page</Link>, at{' '}
          <a href="mailto:info@mensahrentals.com">info@mensahrentals.com</a>, or
          at <a href="tel:+16046445265">(604) 644-5265</a>.
        </p>
        <h2>Information collected</h2>
        <p>
          The platform may collect information that you provide in a contact
          enquiry, rental cart or request, request amendment, formal change
          request, quote response, and confirmed-order workflow. Depending on
          the workflow, this may include your name, email, phone, company, event
          or project details, requested equipment and quantities, dates,
          fulfilment information, delivery address, notes, and responses to
          customer documents.
        </p>
        <p>
          Staff authentication records, authorization roles, operational
          records, security logs, audit events, and system diagnostics are
          handled inside the administrative platform and are not public customer
          data.
        </p>
        <h2>How information is used</h2>
        <p>
          Information is used to receive and review enquiries and rental
          requests, communicate about a project, prepare and manage quotes and
          confirmed orders, coordinate fulfilment and returns, maintain
          operational history, protect private access, investigate errors or
          abuse, and meet applicable business or legal obligations.
        </p>
        <h2>Contact enquiries</h2>
        <p>
          A successfully submitted contact enquiry is stored in the platform for
          authorized staff review. This phase does not configure an outbound
          email provider, so the website does not claim that the message was
          delivered by email. Spam-prevention controls include a hidden
          honeypot, bounded request sizes, exact request-origin checks,
          validation, and rate limiting.
        </p>
        <h2>Private access and cookies</h2>
        <p>
          The rental cart and private customer workflows use secure, scoped
          browser cookies where needed. Private request, quote, and order access
          uses opaque capabilities; raw capability and session secrets are not
          included in public responses or logs. The Admin application uses an
          HTTP-only staff session cookie. Theme preference is stored in the
          browser so a manual light or dark choice can persist.
        </p>
        <h2>Google Maps review content</h2>
        <p>
          When enabled, the homepage retrieves current business ratings and
          reviews from Google Maps Platform through the Mensah Rentals server.
          The platform does not permanently store returned review text, reviewer
          names, profile links, photographs, ratings, or dates. Reviewer images
          load from Google&apos;s servers when displayed, so Google may receive
          normal connection details. See the{' '}
          <a
            href="https://policies.google.com/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Privacy Policy
          </a>
          .
        </p>
        <h2>Sharing and public visibility</h2>
        <p>
          Customer contact and rental workflow information is not intended for
          public catalogue responses. Authorized staff can access the records
          required for their work according to backend permissions. Service
          infrastructure and third-party providers may process information only
          as needed to operate the platform. The current repository does not
          implement advertising trackers or a general analytics product; this
          policy must be updated before any such service is introduced.
        </p>
        <h2>Security and retention</h2>
        <p>
          The platform uses validation, access controls, private caching rules,
          password hashing, database-backed staff sessions, audit logging, and
          other safeguards appropriate to the implemented workflows. No system
          can guarantee absolute security. Operational records are retained
          according to business, legal, security, and workflow needs; this
          policy does not promise an unverified fixed retention period.
        </p>
        <h2>Your questions and requests</h2>
        <p>
          To ask a privacy question or make a request concerning information you
          supplied, use the <Link href="/contact">contact page</Link> or the
          verified business contact details above. Mensah Rentals may need to
          verify identity and the relevant record before responding.
        </p>
      </article>
    </>
  );
}
